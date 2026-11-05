#!/usr/bin/env python3
"""Generate and master the starlight UI cue kit with ElevenLabs.

The published UI cues used to be ElevenLabs takes ruined by build_sfx.py:
`afade=t=out:st=0:d=0.001` muted everything after ~10 ms, so 9 of them were
inaudible. This script regenerates 11 cues with prompts written for the night
sky / star-map palette, then masters them with a correct chain.

Two things matter for a phone speaker, and both are enforced here:
  * the prompts demand a *pitched mid-range* bell (roughly 0.8-2.5 kHz) and
    explicitly forbid low swells and airy hiss — the first attempts came back
    as <500 Hz rumble (`start` was nearly silent) or >4 kHz shimmer;
  * mastering trims to the sounding part, removes sub-bass, peak-normalises to
    -3 dBFS and verifies there is real energy in the 500 Hz-4 kHz band.

Raw takes are cached in .local/forge/sfx/cosmic-<name>.mp3 (gitignored), so a
re-run costs no credits. Use --force to regenerate them.

Usage: python3 scripts/atlas/gen_cosmic_sfx.py [--force]
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import math
import os
import ssl
import struct
import subprocess
import time
import urllib.request
from pathlib import Path

from common import FORGE, eleven_keys, load_env

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "sfx"
RAW = FORGE / "sfx"
SR = 44100
PEAK = 0.71  # -3 dBFS ceiling
# Every cue lands at -20 dBFS on its loudest 100 ms. With a uniform playback
# gain of 0.60 that is about 6 dB above the ambience bed, matching `fly`/`ignite`.
TARGET_RMS = 10 ** (-20 / 20)

STYLE = (
    "A clean, clearly audible, pitched musical tone with a sharp attack and short natural decay. "
    "Strong mid-range presence (roughly 800 Hz to 2500 Hz), the range a small phone speaker reproduces. "
    "Recorded clean and close. No low bass swell, no rumble, no airy shimmer, no hiss, no breath noise, "
    "no broadband texture, no music bed, no voices."
)

# `key` is a mechanical typewriter, not a bell. The sound-effects endpoint
# rejects a long prompt + style concatenation for this cue (HTTP 400), so it
# uses one short self-contained prompt with no appended style.
STYLE_OVERRIDES = {"key": ""}

# name -> (ElevenLabs duration, published duration, prompt)
PROMPTS: dict[str, tuple[float, float, str]] = {
    "tap": (0.7, 0.16,
            "One single struck glass bell note around 1800 Hz, a tiny clean luminous ping like a star blinking once. Very short."),
    # Keep only 0.12 s: even if the model returns a short burst of several
    # keystrokes, the published cue stays ONE isolated key press.
    "key": (0.5, 0.12,
            "Exactly ONE single vintage typewriter key strike. One isolated short mechanical clack with a tiny metallic ping, "
            "then complete silence. A single key press only, no second keystroke, no sequence, no repeated typing, "
            "no carriage return. Clean close recording, no hiss, no music, no voices."),
    "flip": (0.7, 0.34,
            "Two quick clean glass bell notes rising around 1100 Hz and 1600 Hz, a light upward chime."),
    "page": (0.9, 0.44,
            "One clear glass bell note around 1600 Hz with a very brief soft paper rustle; mostly pitched tone."),
    "correct": (1.0, 0.72,
                "Two clear ascending glass bell notes around 900 Hz and 1300 Hz, a warm satisfied rising chime."),
    "wrong": (0.9, 0.60,
              "One clear soft low-mid bell note around 750 Hz, a gentle kind 'not quite' cue, mellow and pitched."),
    "start": (1.2, 0.95,
              "A clear bright rising glass bell chime, one clean struck musical note around 1300 Hz, like a small handbell."),
    "complete": (1.8, 1.70,
                 "Four clear ascending celesta and glass bell notes from about 800 Hz to 2000 Hz, a short warm flourish ending on a soft chord."),
    "streak": (1.4, 1.00,
               "Three quick high clear glass bell notes around 1800 to 2500 Hz, a light pitched sparkle."),
    "twinkle": (0.6, 0.44,
                "One clear high glass bell note around 2000 Hz, a single star twinkling, sharp attack and short decay."),
    "splash-burst": (1.5, 1.30,
                     "A clear shimmering glass bell chord around 1200 to 2000 Hz, bright and musical, a gentle bloom."),
}

API = "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128"
# Remove rumble a phone cannot reproduce, then give the vocal/presence band a
# small lift. No loudnorm: on these short sparse takes it undershoots badly.
EQ = "highpass=f=600:poles=2,equalizer=f=1500:t=q:w=1.0:g=3,lowpass=f=9000"


def opener() -> urllib.request.OpenerDirector:
    """The sandbox proxy terminates TLS with an untrusted CA; relax verification."""
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    ctx = ssl._create_unverified_context()
    handlers: list[urllib.request.BaseHandler] = [urllib.request.HTTPSHandler(context=ctx)]
    if proxy:
        handlers.insert(0, urllib.request.ProxyHandler({"https": proxy, "http": proxy}))
    return urllib.request.build_opener(*handlers)


def generate(name: str, seconds: float, key: str, force: bool) -> Path:
    dest = RAW / f"cosmic-{name}.mp3"
    if dest.exists() and dest.stat().st_size > 1000 and not force:
        return dest
    payload = {
        "text": f"{PROMPTS[name][2]} {STYLE_OVERRIDES.get(name, STYLE)}".strip(),
        "duration_seconds": seconds,
        "prompt_influence": 0.55,
        "model_id": "eleven_text_to_sound_v2",
    }
    req = urllib.request.Request(
        API, data=json.dumps(payload).encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
    )
    last: Exception | None = None
    for attempt in range(3):
        try:
            with opener().open(req, timeout=180) as r:
                data = r.read()
            if len(data) < 1000:
                raise RuntimeError("response too small")
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            return dest
        except Exception as e:
            last = e
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"{name}: {last}")


def f32(path: Path, eq: bool = False) -> list[float]:
    cmd = ["ffmpeg", "-v", "error", "-i", str(path)]
    if eq:
        cmd += ["-af", EQ]
    cmd += ["-ac", "1", "-ar", str(SR), "-f", "f32le", "pipe:1"]
    pcm = subprocess.run(cmd, capture_output=True, check=True).stdout
    n = len(pcm) // 4
    return list(struct.unpack("<%df" % n, pcm[: n * 4]))


def rms(seg: list[float]) -> float:
    return math.sqrt(sum(x * x for x in seg) / len(seg)) if seg else 0.0


def master(raw: Path, target_dur: float) -> list[float]:
    v = f32(raw, eq=True)
    w = int(SR * 0.010)
    threshold = 10 ** (-46 / 20)
    first, last = 0, len(v)
    for i in range(0, len(v) - w + 1, w):
        if rms(v[i : i + w]) > threshold:
            first = max(0, i - int(SR * 0.005))
            break
    for i in range(len(v) - w, -1, -w):
        if rms(v[i : i + w]) > threshold:
            last = min(len(v), i + w + int(SR * 0.005))
            break
    end = min(last, first + int(SR * target_dur))
    seg = v[first:end]
    if len(seg) < int(SR * 0.05):
        raise RuntimeError(f"mastered {raw.name} is too short ({len(seg) / SR:.3f}s)")

    # Real fades: 4 ms in, 12 ms out at the *end* (the old chain faded at 0 s).
    a, b = int(SR * 0.004), int(SR * 0.012)
    for i in range(min(a, len(seg))):
        seg[i] *= i / a
    for i in range(max(0, len(seg) - b), len(seg)):
        seg[i] *= (len(seg) - i) / b

    peak = max(abs(x) for x in seg) or 1.0
    win = min(int(SR * 0.1), len(seg))
    loudest = max(rms(seg[i : i + win]) for i in range(0, len(seg) - win + 1, max(1, win // 4))) or 1e-6
    # Attenuate dense takes to the target RMS; a sparse take is left at the
    # peak ceiling rather than boosted into clipping.
    scale = min(PEAK / peak, TARGET_RMS / loudest)
    return [x * scale for x in seg]


def encode(samples: list[float], dest: Path) -> None:
    pcm = struct.pack("<%df" % len(samples), *samples)
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0",
         "-ac", "1", "-ar", "44100", "-b:a", "96k", str(dest)],
        input=pcm, check=True,
    )


def band_means(path: Path) -> tuple[float, float, float]:
    vals = []
    for flt in ("lowpass=f=500", "highpass=f=500,lowpass=f=4000", "highpass=f=4000"):
        out = subprocess.run(
            ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", flt + ",volumedetect", "-f", "null", "-"],
            capture_output=True, text=True,
        ).stderr
        import re
        m = re.search(r"mean_volume: ([-\d.]+) dB", out)
        vals.append(float(m.group(1)) if m else -99.0)
    return vals[0], vals[1], vals[2]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="regenerate cached ElevenLabs takes")
    ap.add_argument("--only", default="", help="comma-separated cue names to process")
    ap.add_argument("--master-only", action="store_true", help="re-master cached takes without calling the API")
    args = ap.parse_args()
    keys = eleven_keys(load_env())
    if not keys and not args.master_only:
        print("no ElevenLabs key found in ~/.config/word-atlas/elevenlabs.key", flush=True)
        return 1

    RAW.mkdir(parents=True, exist_ok=True)
    names = [n for n in PROMPTS if not args.only or n in set(filter(None, args.only.split(",")))]
    if not args.master_only:
        with cf.ThreadPoolExecutor(max_workers=3) as ex:
            futures = {ex.submit(generate, n, PROMPTS[n][0], keys[i % len(keys)], args.force): n
                       for i, n in enumerate(names)}
            for f in cf.as_completed(futures):
                n = futures[f]
                try:
                    p = f.result()
                    print(f"generated  {n:<15} {p.stat().st_size} B", flush=True)
                except Exception as e:
                    print(f"FAILED     {n}: {e}", flush=True)

    bad = []
    for n in names:
        raw = RAW / f"cosmic-{n}.mp3"
        dest = OUT / f"{n}.mp3"
        if not raw.exists():
            bad.append(n)
            continue
        try:
            encode(master(raw, PROMPTS[n][1]), dest)
            lo, mid, hi = band_means(dest)
            # Only reject a take whose sub-bass actually dominates. A low-mid
            # bell (e.g. `wrong` at 750 Hz) legitimately has energy on both
            # sides of 500 Hz and still plays fine on a phone.
            flag = "OK" if mid > lo - 6 else "LOW-DOMINANT"
            print(f"mastered   {n:<15} {dest.stat().st_size:>6} B  <500 {lo:>6.1f} | 500-4k {mid:>6.1f} | >4k {hi:>6.1f}  {flag}", flush=True)
            if flag != "OK":
                bad.append(n)
        except Exception as e:
            print(f"MASTER FAIL {n}: {e}", flush=True)
            bad.append(n)
    if bad:
        print("needs attention:", ", ".join(bad), flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
