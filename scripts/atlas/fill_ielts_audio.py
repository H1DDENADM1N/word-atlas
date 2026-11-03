"""Fill the missing IELTS-context example recordings from the public atlas.

Every entry carries two examples: the everyday one (`ex`, `audio/ex/`) and the
IELTS-context one (`ex2`, `audio/ex2/`). Only 1,011 words had an `ex2`
recording; the rest fell back to the device voice. The upstream build at
0xlei.tech already voices all 7,298, and its sentences are byte-identical to
ours, so this mirrors the missing files instead of paying ElevenLabs for them.

    python3 scripts/atlas/fill_ielts_audio.py --dry-run
    python3 scripts/atlas/fill_ielts_audio.py --workers 8
    python3 scripts/atlas/fill_ielts_audio.py --flags   # refresh media bits

Real exam sentences (`public/atlas/ielts.json`) are deliberately out of scope.
"""
import argparse
import concurrent.futures as cf
import json
import pathlib
import threading
import time
import urllib.error
import urllib.request

from common import ROOT

PUB = ROOT / "public" / "atlas"
ENTRIES = PUB / "entries"
EX2 = PUB / "audio" / "ex2"
INDEX = PUB / "index.json"
BASE = "https://0xlei.tech/words/atlas/audio/ex2"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) word-atlas/1.0"}


def entries():
    for p in sorted(ENTRIES.glob("*.json"), key=lambda x: int(x.stem)):
        yield from json.loads(p.read_text(encoding="utf-8"))


def missing(force=False):
    have = {p.stem for p in EX2.glob("*.mp3")} if EX2.exists() else set()
    out = []
    for e in entries():
        if len(e.get("ex") or []) < 2:
            continue
        if not force and e["id"] in have:
            continue
        out.append(e)
    return out


def looks_like_mp3(data):
    return len(data) > 2000 and (data[:3] == b"ID3" or data[0] == 0xFF)


def fetch(entry, retries=4):
    """Download one clip; returns (id, ok, note)."""
    url = f"{BASE}/{entry['id']}.mp3"
    last = ""
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if not looks_like_mp3(data):
                raise ValueError(f"not audio ({len(data)} B)")
            out = EX2 / f"{entry['id']}.mp3"
            tmp = out.with_suffix(".part")
            tmp.write_bytes(data)
            tmp.replace(out)
            return entry["id"], True, f"{len(data)} B"
        except urllib.error.HTTPError as ex:
            last = f"HTTP {ex.code}"
            if ex.code == 404:  # upstream has no clip for this word
                break
        except Exception as ex:
            last = repr(ex)[:120]
        time.sleep(1.5 * (i + 1))
    return entry["id"], False, last


def update_flags():
    """Set media bit 16 wherever an ex2 file exists, in index and entries."""
    have = {p.stem for p in EX2.glob("*.mp3")}
    meta = json.loads(INDEX.read_text(encoding="utf-8"))
    added = 0
    for row in meta["words"]:
        if row[0] in have and not row[6] & 16:
            row[6] |= 16
            added += 1
    INDEX.write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")))

    touched = 0
    for p in sorted(ENTRIES.glob("*.json"), key=lambda x: int(x.stem)):
        chunk = json.loads(p.read_text(encoding="utf-8"))
        dirty = False
        for e in chunk:
            if e["id"] in have and not e.get("m", 0) & 16:
                e["m"] = e.get("m", 0) | 16
                dirty = True
        if dirty:
            p.write_text(json.dumps(chunk, ensure_ascii=False, separators=(",", ":")))
            touched += 1
    voiced = sum(1 for row in meta["words"] if row[6] & 16)
    print(f"flags: +{added} rows, {touched} entry chunks rewritten, ex2 voiced {voiced}/{len(meta['words'])}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--force", action="store_true", help="re-download files that already exist")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--flags", action="store_true", help="only refresh media bits")
    a = ap.parse_args()

    if a.flags:
        return update_flags()

    queue = missing(a.force)
    chars = sum(len(e["ex"][1]["en"]) for e in queue)
    print(f"todo {len(queue)} clips ({chars} characters of speech)", flush=True)
    if a.dry_run:
        for e in queue[:10]:
            print(f"  {e['id']:24} {BASE}/{e['id']}.mp3")
        return
    if not queue:
        return update_flags()
    if a.limit:
        queue = queue[: a.limit]

    EX2.mkdir(parents=True, exist_ok=True)
    stats = {"ok": 0, "fail": 0}
    lock = threading.Lock()
    failed = []

    def run(entry):
        hid, ok, note = fetch(entry)
        with lock:
            if ok:
                stats["ok"] += 1
                if stats["ok"] % 250 == 0:
                    print(f"{time.strftime('%H:%M:%S')} ok={stats['ok']} fail={stats['fail']}", flush=True)
            else:
                stats["fail"] += 1
                failed.append((hid, note))
                print("FAIL", hid, note, flush=True)

    with cf.ThreadPoolExecutor(a.workers) as pool:
        list(pool.map(run, queue))
    print("finished", stats, flush=True)
    if failed:
        print("unresolved:", ", ".join(h for h, _ in failed[:20]), flush=True)
    update_flags()


if __name__ == "__main__":
    main()
