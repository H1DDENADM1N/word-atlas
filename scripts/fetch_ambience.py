#!/usr/bin/env python3
"""Fetch the ambience loops that ship with Word Atlas.

These are **not** synthesised here. They are the tracks the reference site
`gjenglish.com` plays, taken from its open-source repository
(`wenchester8-droid/english-starry-sky`) at a pinned commit, so the same bytes
are fetched every time. Most come from Pixabay under the Pixabay Content
Licence; three (`brown`, `musicbox`, `guzheng`) upstream synthesises with its own
`scripts/make_ambience.py`.

    python3 scripts/fetch_ambience.py             # fetch what is missing
    python3 scripts/fetch_ambience.py --force     # refetch everything
    python3 scripts/fetch_ambience.py --check     # verify against the manifest

The manifest `scripts/ambience-sources.json` records the upstream commit, each
file's size and SHA-256, so a silent change upstream shows up as a failed
`--check` rather than as audio that quietly sounds different.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "sfx"
MANIFEST = ROOT / "scripts" / "ambience-sources.json"

REPO = "wenchester8-droid/english-starry-sky"
# Pinned: "main" moves, and a moving reference is how the wrong audio gets in.
COMMIT = "35070f4385f4492c6247be9411afb4b696256616"
BASE = f"https://raw.githubusercontent.com/{REPO}/{COMMIT}/public/sfx"

# Upstream order and dB trims, copied from its src/lib/ambience.ts.
TRACKS = [
    ("stars", "星河入梦", -2.9),
    ("rain", "书窗听雨", -0.5),
    ("sea", "晨海潮声", 0.8),
    ("forest", "林间晨光", -0.6),
    ("fire", "炉火微温", -0.1),
    ("voyage", "夜航舟中", -0.3),
    ("cafe", "午后咖啡", 0.3),
    ("brown", "静水深流", 2.6),
    ("musicbox", "八音旧梦", -12.5),
    ("guzheng", "弦上清音", -7.7),
    ("crickets-night", "夏夜虫吟", 0.0),
    ("rain-window", "檐雨敲窗", -0.8),
    ("stream", "石上清泉", 0.0),
    ("rain-forest", "夜雨空山", 0.4),
    ("bamboo", "竹林听风", 3.4),
    ("frogs", "稻花蛙声", -0.2),
    ("cicadas", "蝉鸣盛夏", -1.5),
    ("winter-wind", "风雪夜归", -1.2),
    ("campfire", "篝火星野", 2.5),
    ("train", "列车远行", 0.0),
    ("library", "书页静翻", 0.0),
    ("chimes", "风铃轻响", -1.0),
    ("piano-study", "琴键伴读", 0.0),
    ("piano-clouds", "云上琴音", 0.0),
    ("lofi-study", "慢拍自习室", 0.0),
    ("lofi-lamp", "灯下慢拍", 0.0),
    ("bamboo-flute", "竹笛牧歌", 0.0),
    ("guqin", "高山流水", -0.5),
    ("guitar", "木吉他午后", 0.0),
    ("harp", "竖琴星光", 0.0),
]


def target(tid: str) -> Path:
    return OUT / f"amb-{tid}.mp3"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def load_manifest() -> dict:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text(encoding="utf-8"))
    return {"repo": REPO, "commit": COMMIT, "files": {}}


def save_manifest(m: dict) -> None:
    MANIFEST.write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def fetch(tid: str, attempts: int = 4) -> bytes:
    url = f"{BASE}/amb-{tid}.mp3"
    last: Exception | None = None
    for n in range(attempts):
        try:
            # raw.githubusercontent.com must bypass the proxy when one is set.
            req = urllib.request.Request(url, headers={"User-Agent": "word-atlas-fetch"})
            with urllib.request.urlopen(req, timeout=90) as r:
                if r.status != 200:
                    raise RuntimeError(f"HTTP {r.status}")
                return r.read()
        except (urllib.error.URLError, RuntimeError, TimeoutError) as e:  # noqa: PERF203
            last = e
            time.sleep(1.5 * (n + 1))
    raise RuntimeError(f"{tid}: {last}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*", help="only these ids")
    ap.add_argument("--force", action="store_true", help="refetch even if present")
    ap.add_argument("--check", action="store_true", help="verify only, never download")
    args = ap.parse_args()

    for host in ("raw.githubusercontent.com", "github.com"):
        if os.environ.get("HTTP_PROXY") and host not in os.environ.get("NO_PROXY", ""):
            print(f"note: HTTP_PROXY is set but {host} is not in NO_PROXY", file=sys.stderr)

    OUT.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest()
    manifest["repo"], manifest["commit"] = REPO, COMMIT
    files = manifest.setdefault("files", {})

    wanted = [t for t in TRACKS if not args.ids or t[0] in args.ids]
    unknown = set(args.ids) - {t[0] for t in TRACKS}
    if unknown:
        print(f"unknown ids: {', '.join(sorted(unknown))}", file=sys.stderr)
        return 2

    bad = 0
    for tid, label, _db in wanted:
        path = target(tid)
        entry = files.get(tid)
        if args.check:
            if not path.exists():
                print(f"MISSING {path.name}")
                bad += 1
            elif entry and sha256(path) != entry["sha256"]:
                print(f"CHANGED {path.name}")
                bad += 1
            else:
                print(f"ok      {path.name:32} {label}")
            continue

        if path.exists() and entry and not args.force and sha256(path) == entry["sha256"]:
            print(f"have    {path.name:32} {label}")
            continue

        try:
            data = fetch(tid)
        except RuntimeError as e:
            print(f"FAILED  {e}", file=sys.stderr)
            bad += 1
            continue
        path.write_bytes(data)
        digest = hashlib.sha256(data).hexdigest()
        files[tid] = {"label": label, "bytes": len(data), "sha256": digest}
        print(f"got     {path.name:32} {label}  {len(data)/1e6:.2f} MB")

    save_manifest(manifest)
    print(f"\n{len(wanted)} tracks · {sum(t.get('bytes', 0) for t in files.values())/1e6:.1f} MB · manifest {MANIFEST.relative_to(ROOT)}")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
