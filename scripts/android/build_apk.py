#!/usr/bin/env python3
"""Build the fully offline Word Atlas APK.

The APK is assembled with the Android SDK build tools directly (aapt2, javac,
d8, zipalign, apksigner) so no Gradle download is required:

    python3 scripts/android/build_apk.py

Everything the app needs — bundle, 7,298 illustrations, 22,905 recordings, the
word data, the sound cues and a Piper text-to-speech voice — is written into
the APK. Nothing is fetched at runtime and no network permission is declared.

The speech runtime is prebuilt and vendored; run `scripts/android/fetch_tts.py`
once before the first build.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ANDROID = ROOT / "android"
MAIN = ANDROID / "app" / "src" / "main"
JAVA_SRC = MAIN / "java"
RES = MAIN / "res"
BUILD = ANDROID / "build"
DIST = ROOT / "dist-android"
PUBLIC = ROOT / "public"
# Two interchangeable word-audio sets. The share build uses upstream's original
# ElevenLabs recordings (CC BY 4.0); the private build uses OALDPEX (OUP, never
# redistribute). Both stay out of Git; the audio is selected per APK below.
AUDIO_SHARE = PUBLIC / "atlas" / "audio"
AUDIO_PRIVATE = ROOT / "private" / "audio" / "oaldpex"
# Prebuilt offline TTS runtime + voices, populated by scripts/android/fetch_tts.py
TTS = ANDROID / "vendor" / "tts"

PKG = "tech.wordatlas.app"
# Bump this for every release: Android only accepts an equal or higher code on
# upgrade, so an APK that reuses the old one silently refuses to install over it.
VERSION_CODE = 5
# The display version lives in package.json and nowhere else — the shell reads
# it back from the package manager at runtime instead of hardcoding a copy.
VERSION_NAME = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
MIN_SDK = 24
TARGET_SDK = 34
KEYSTORE = ANDROID / "keystore" / "word-atlas.jks"
KEY_ALIAS = "word-atlas"
KEY_PASS = "wordatlas"

# Already-compressed formats are stored as-is: deflating them wastes build time.
# .onnx is stored too — the runtime reads the model straight out of the APK and
# an uncompressed asset can be mapped instead of streamed.
STORED_EXT = {
    ".mp3", ".webp", ".png", ".jpg", ".jpeg", ".woff2", ".woff", ".ttf",
    ".otf", ".m4a", ".mp4", ".webm", ".zip", ".onnx",
}

START = time.time()


def log(message: str) -> None:
    print(f"[{time.time() - START:6.1f}s] {message}", flush=True)


def run(cmd: list[str], **kwargs) -> None:
    printable = " ".join(str(c) for c in cmd)
    if len(printable) > 160:
        printable = printable[:157] + "..."
    log(printable)
    subprocess.run([str(c) for c in cmd], check=True, **kwargs)


def human(size: int) -> str:
    value = float(size)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} GB"


# --------------------------------------------------------------------------
# toolchain discovery
# --------------------------------------------------------------------------


def find_sdk() -> Path:
    candidates = [
        os.environ.get("ANDROID_HOME"),
        os.environ.get("ANDROID_SDK_ROOT"),
        str(Path.home() / ".android-sdk"),
        str(Path.home() / "AppData" / "Local" / "Android" / "Sdk"),
        "C:/Android/Sdk",
    ]
    for candidate in candidates:
        if candidate and (Path(candidate) / "build-tools").is_dir():
            return Path(candidate)
    sys.exit(
        "Android SDK not found.\n"
        "Install it and set ANDROID_HOME, e.g.\n"
        "  sdkmanager 'platforms;android-34' 'build-tools;34.0.0'"
    )


def version_key(path: Path) -> list[tuple[int, int, str]]:
    """Sort "34.0.0" / "android-34" style names numerically."""
    key: list[tuple[int, int, str]] = []
    for token in path.name.replace("-", ".").replace("_", ".").split("."):
        key.append((0, int(token), "") if token.isdigit() else (1, 0, token))
    return key


def newest_dir(parent: Path) -> Path:
    dirs = [d for d in parent.iterdir() if d.is_dir()]
    if not dirs:
        sys.exit(f"Nothing installed in {parent}")
    return sorted(dirs, key=version_key)[-1]


def find_java_home(sdk: Path) -> Path:
    candidates = [os.environ.get("JAVA_HOME"), str(sdk / "jdk17")]
    for candidate in candidates:
        if candidate and (Path(candidate) / "bin" / "javac.exe").exists():
            return Path(candidate)
        if candidate and (Path(candidate) / "bin" / "javac").exists():
            return Path(candidate)
    javac = shutil.which("javac")
    if javac:
        return Path(javac).resolve().parents[1]
    sys.exit("JDK 17+ not found. Set JAVA_HOME to a JDK 17 installation.")


# --------------------------------------------------------------------------
# build steps
# --------------------------------------------------------------------------


def build_web(skip: bool) -> None:
    if skip:
        log("reusing existing dist-android")
        return
    npm = "npm.cmd" if os.name == "nt" else "npm"
    log("building the web bundle (relative URLs, classic script)")
    run([npm, "run", "build:android"], cwd=ROOT)


def build_data_js() -> tuple[Path, Path]:
    """Inline the word data and sound cues so the page needs no fetch().

    The ambience loops are 56 MB and cannot be inlined the same way: one JS
    string that big would have to be parsed before the first paint. They go into
    one script per track instead, which the page pulls in when a track is
    actually chosen. A `<script>` works from `file://` where `fetch()` does not,
    and base64 deflates back to roughly the size of the mp3 it encodes.
    """
    log("inlining atlas data and sound cues")
    index_file = PUBLIC / "atlas" / "index.json"
    index_text = index_file.read_text(encoding="utf-8")
    entries_dir = PUBLIC / "atlas" / "entries"
    chunks = [p.read_text(encoding="utf-8") for p in sorted(entries_dir.glob("*.json"), key=lambda p: int(p.stem))]
    ielts_file = PUBLIC / "atlas" / "ielts.json"
    ielts = ielts_file.read_text(encoding="utf-8") if ielts_file.exists() else ""
    syl_file = PUBLIC / "atlas" / "syllables.json"
    syllables = syl_file.read_text(encoding="utf-8") if syl_file.exists() else ""

    amb_dir = BUILD / "sfx"
    if amb_dir.exists():
        shutil.rmtree(amb_dir)
    amb_dir.mkdir(parents=True, exist_ok=True)

    sfx = {}
    for path in sorted((PUBLIC / "sfx").glob("*.mp3")):
        payload = base64.b64encode(path.read_bytes()).decode("ascii")
        if path.name.startswith("amb-"):
            name = json.dumps(path.name)
            (amb_dir / f"{path.name}.js").write_text(
                f"self.__WA_SFX=self.__WA_SFX||{{}};self.__WA_SFX[{name}]={json.dumps(payload)};\n",
                encoding="ascii",
            )
        else:
            sfx[path.name] = payload
    payload = {"index": index_text, "chunks": chunks, "ielts": ielts, "syllables": syllables, "sfx": sfx}
    target = BUILD / "data.js"
    target.parent.mkdir(parents=True, exist_ok=True)
    body = "window.__WA_DATA=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
    target.write_text(body, encoding="utf-8")
    log(
        f"  {len(chunks)} entry chunks · {len(ielts) // 1024} KB exam sentences · {len(syllables) // 1024} KB syllable breaks"
        f" · {len(sfx)} cues · {len(list(amb_dir.glob('*.js')))} ambience payloads · {human(target.stat().st_size)}"
    )
    return target, amb_dir
    return target


def aapt2_compile(aapt2: Path) -> Path:
    log("compiling resources")
    out = BUILD / "res.zip"
    if out.exists():
        out.unlink()
    run([aapt2, "compile", "--dir", RES, "-o", out])
    return out


def aapt2_link(aapt2: Path, android_jar: Path, res_zip: Path) -> Path:
    log("linking resources")
    apk = BUILD / "base.apk"
    gen = BUILD / "gen"
    if gen.exists():
        shutil.rmtree(gen)
    gen.mkdir(parents=True)
    run([
        aapt2, "link",
        "-o", apk,
        "-I", android_jar,
        "--manifest", MAIN / "AndroidManifest.xml",
        "--java", gen,
        "--min-sdk-version", str(MIN_SDK),
        "--target-sdk-version", str(TARGET_SDK),
        "--version-code", str(VERSION_CODE),
        "--version-name", VERSION_NAME,
        res_zip,
    ])
    return apk


def compile_java(java_home: Path, android_jar: Path) -> Path:
    log("compiling java sources")
    classes = BUILD / "classes"
    if classes.exists():
        shutil.rmtree(classes)
    classes.mkdir(parents=True)
    sources = sorted(str(p) for p in JAVA_SRC.rglob("*.java"))
    sources += sorted(str(p) for p in (BUILD / "gen").rglob("*.java"))
    run([
        java_home / "bin" / ("javac.exe" if os.name == "nt" else "javac"),
        "-d", classes,
        "--release", "11",
        "-encoding", "UTF-8",
        "-classpath", android_jar,
        *sources,
    ])
    return classes


def dex(java_home: Path, build_tools: Path, android_jar: Path, classes: Path) -> Path:
    log("dexing")
    out = BUILD / "dex"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    class_files = sorted(str(p) for p in classes.rglob("*.class"))
    run([
        java_home / "bin" / ("java.exe" if os.name == "nt" else "java"),
        "-cp", build_tools / "lib" / "d8.jar",
        "com.android.tools.r8.D8",
        "--release",
        "--min-api", str(MIN_SDK),
        "--lib", android_jar,
        "--output", out,
        *class_files,
    ])
    return out / "classes.dex"


def audio_set(root: Path, label: str) -> tuple[Path, Path]:
    """Validate one UK/US pair before a long packaging pass."""
    uk, us = root / "uk", root / "us"
    for accent, folder in (("UK", uk), ("US", us)):
        if not folder.is_dir() or not any(folder.glob("*.mp3")):
            raise SystemExit(
                f"{label} {accent} word audio is missing: {folder}\n"
                "  share build: restore public/atlas/audio/{uk,us} from upstream\n"
                "  private build: python3 scripts/atlas/import_audio.py --out private/audio/oaldpex"
            )
    return uk, us


def web_assets(uk_audio: Path, us_audio: Path) -> list[tuple[Path, str]]:
    """Every file that goes into assets/www, in archive order.

    The word-audio folders are skipped here and added from the chosen set, so
    the same web bundle can be packaged as a share or a private APK.
    """
    items: list[tuple[Path, str]] = []
    for path in sorted(DIST.rglob("*")):
        if path.is_file():
            items.append((path, f"assets/www/{path.relative_to(DIST).as_posix()}"))
    for folder in ("atlas", "sfx", "brand"):
        for path in sorted((PUBLIC / folder).rglob("*")):
            if not path.is_file():
                continue
            if folder == "atlas":
                rel = path.relative_to(PUBLIC / "atlas")
                if len(rel.parts) >= 2 and rel.parts[0] == "audio" and rel.parts[1] in ("uk", "us"):
                    continue
            # The ambience ships as `sfx/<name>.mp3.js`; keeping the raw mp3 too
            # would store 56 MB of audio twice.
            if folder == "sfx" and path.name.startswith("amb-") and path.suffix == ".mp3":
                continue
            items.append((path, f"assets/www/{path.relative_to(PUBLIC).as_posix()}"))
    for accent, root in (("uk", uk_audio), ("us", us_audio)):
        for path in sorted(root.rglob("*.mp3")):
            rel = path.relative_to(root).as_posix()
            items.append((path, f"assets/www/atlas/audio/{accent}/{rel}"))
    for name in ("favicon.svg", "icon-512.png", "manifest.webmanifest"):
        path = PUBLIC / name
        if path.exists():
            items.append((path, f"assets/www/{name}"))
    return items


def native_and_voice() -> list[tuple[Path, str]]:
    """Prebuilt TTS runtime (lib/<abi>/*.so) and the voices in assets/tts."""
    if not TTS.is_dir():
        raise SystemExit(
            "offline TTS runtime is missing.\n"
            "  python3 scripts/android/fetch_tts.py"
        )
    items: list[tuple[Path, str]] = []
    for abi_dir in sorted(p for p in (TTS / "libs").iterdir() if p.is_dir()):
        for lib in sorted(abi_dir.glob("*.so")):
            items.append((lib, f"lib/{abi_dir.name}/{lib.name}"))
    assets_root = TTS / "assets"
    for path in sorted(assets_root.rglob("*")):
        if path.is_file():
            items.append((path, f"assets/{path.relative_to(assets_root).as_posix()}"))
    if not items:
        raise SystemExit("offline TTS runtime folder is empty; re-run fetch_tts.py --force")
    return items


def package_apk(base_apk: Path, dex_file: Path, data_js: Path, amb_js: Path, audio: tuple[Path, Path], tag: str) -> Path:
    log(f"packaging {tag} assets (this is the big step)")
    out = BUILD / f"unaligned-{tag}.apk"
    if out.exists():
        out.unlink()
    assets = web_assets(*audio)
    assets.append((data_js, "assets/www/atlas-embed/data.js"))
    for path in sorted(amb_js.glob("*.js")):
        assets.append((path, f"assets/www/sfx/{path.name}"))
    assets.extend(native_and_voice())
    total = 0
    written = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as target:
        with zipfile.ZipFile(base_apk) as source:
            for info in source.infolist():
                data = source.read(info.filename)
                # Android 11+ requires resources.arsc to be stored uncompressed.
                store = info.filename == "resources.arsc"
                target.writestr(info, data, compress_type=zipfile.ZIP_STORED if store else zipfile.ZIP_DEFLATED)
                written += len(data)
        target.write(dex_file, "classes.dex", compress_type=zipfile.ZIP_DEFLATED)
        for path, arcname in assets:
            store = path.suffix.lower() in STORED_EXT
            target.write(path, arcname, compress_type=zipfile.ZIP_STORED if store else zipfile.ZIP_DEFLATED)
            total += path.stat().st_size
    log(f"  {len(assets)} asset files · {human(total)} of media")
    return out


def ensure_keystore(java_home: Path) -> None:
    if KEYSTORE.exists():
        return
    log("generating a signing key")
    KEYSTORE.parent.mkdir(parents=True, exist_ok=True)
    run([
        java_home / "bin" / ("keytool.exe" if os.name == "nt" else "keytool"),
        "-genkeypair", "-v",
        "-keystore", KEYSTORE,
        # apksigner cannot read the PBES2-encrypted PKCS12 files that newer JDKs
        # produce by default, so the legacy JKS container is used.
        "-storetype", "JKS",
        "-alias", KEY_ALIAS,
        "-keyalg", "RSA", "-keysize", "2048",
        "-validity", "10000",
        "-storepass", KEY_PASS, "-keypass", KEY_PASS,
        "-dname", "CN=Word Atlas, O=Word Atlas, C=CN",
    ], stdout=subprocess.DEVNULL)


def align_and_sign(build_tools: Path, java_home: Path, unaligned: Path, out: Path) -> Path:
    log(f"aligning {out.name}")
    aligned = BUILD / f"aligned-{out.stem}.apk"
    if aligned.exists():
        aligned.unlink()
    run([build_tools / ("zipalign.exe" if os.name == "nt" else "zipalign"), "-f", "-p", "4", unaligned, aligned])

    ensure_keystore(java_home)
    log(f"signing {out.name}")
    if out.exists():
        out.unlink()
    run([
        build_tools / ("apksigner.bat" if os.name == "nt" else "apksigner"),
        "sign",
        "--ks", KEYSTORE,
        "--ks-key-alias", KEY_ALIAS,
        "--ks-pass", f"pass:{KEY_PASS}",
        "--key-pass", f"pass:{KEY_PASS}",
        "--v1-signing-enabled", "false",
        "--v2-signing-enabled", "true",
        "--v3-signing-enabled", "true",
        "--out", out,
        aligned,
    ])
    run([
        build_tools / ("apksigner.bat" if os.name == "nt" else "apksigner"),
        "verify", "--print-certs", out,
    ])
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the offline Word Atlas APK")
    parser.add_argument("--skip-web", action="store_true", help="reuse dist-android instead of rebuilding")
    parser.add_argument("--flavors", choices=("both", "share", "private"), default="both", help="which APK(s) to build")
    parser.add_argument("--share-audio", default=str(AUDIO_SHARE), help="upstream-original UK/US audio root")
    parser.add_argument("--private-audio", default=str(AUDIO_PRIVATE), help="OALDPEX UK/US audio root")
    args = parser.parse_args()

    # Resolve both audio sets before the expensive passes so a missing directory
    # fails now, not after the zip has been written.
    audio_sets: list[tuple[str, tuple[Path, Path]]] = []
    if args.flavors in ("both", "share"):
        audio_sets.append(("share", audio_set(Path(args.share_audio), "share")))
    if args.flavors in ("both", "private"):
        audio_sets.append(("private", audio_set(Path(args.private_audio), "private")))

    sdk = find_sdk()
    build_tools = newest_dir(sdk / "build-tools")
    android_jar = newest_dir(sdk / "platforms") / "android.jar"
    java_home = find_java_home(sdk)
    log(f"SDK      {sdk}")
    log(f"tools    {build_tools.name}")
    log(f"android  {android_jar}")
    log(f"jdk      {java_home}")
    for flavor, (uk, us) in audio_sets:
        log(f"audio {flavor:7s} uk={sum(1 for _ in uk.glob('*.mp3'))} us={sum(1 for _ in us.glob('*.mp3'))}")

    BUILD.mkdir(parents=True, exist_ok=True)
    aapt2 = build_tools / ("aapt2.exe" if os.name == "nt" else "aapt2")

    build_web(args.skip_web)
    data_js, amb_js = build_data_js()
    res_zip = aapt2_compile(aapt2)
    base_apk = aapt2_link(aapt2, android_jar, res_zip)
    classes = compile_java(java_home, android_jar)
    dex_file = dex(java_home, build_tools, android_jar, classes)

    outputs: list[Path] = []
    for flavor, audio in audio_sets:
        suffix = "" if flavor == "share" else "_O"
        out = ROOT / f"word-atlas-android-v{VERSION_NAME}{suffix}.apk"
        unaligned = package_apk(base_apk, dex_file, data_js, amb_js, audio, flavor)
        signed = align_and_sign(build_tools, java_home, unaligned, out)
        outputs.append(signed)
        log(f"done {flavor:7s} · {signed} · {human(signed.stat().st_size)}")

    log("built " + " + ".join(p.name for p in outputs))


if __name__ == "__main__":
    main()
