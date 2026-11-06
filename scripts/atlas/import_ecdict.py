#!/usr/bin/env python3
"""Build the out-of-atlas lookup fallback from the ECDICT source CSV.

ECCEDICT's `concise-enhanced.mdx` is generated from ECDICT's `stardict.csv`,
which keeps the pronunciations as structured fields instead of HTML. Reading
the CSV is therefore both simpler and more faithful than scraping the MDX.

For every English single-word headword that has a usable phonetic and a Chinese
gloss we emit one row:

    public/atlas/fallback/<letter>.json
    {"abandon": ["əˈbændən", null, "vt.", "放弃, 抛弃, ..."]}

The row is [UK, US, pos, zh]; US is null unless the source carried a separate
American transcription. Only single words are shipped: the fallback is shown
when a tapped *word* is outside the 7,298-card atlas, and phrases would mostly
add noise. The generator is deterministic, so rerunning it reproduces the same
files byte for byte.

Usage:
    python scripts/atlas/import_ecdict.py
    python scripts/atlas/import_ecdict.py --source <stardict.csv> --dry-run
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = ROOT.parent / "ECDICT" / "stardict.csv"
DEFAULT_OUT = ROOT / "public" / "atlas" / "fallback"
DEFAULT_REPORT = ROOT / ".workbuddy" / "tmp" / "ecdict-report.json"

# ECDICT's older rows use a compact ASCII-ish transcription. These are the
# substitutions that turn it into something readable next to the atlas's own
# IPA; they are only applied to rows that actually use the old notation.
DIGRAPHS = (
    ("iә", "ɪə"),
    ("uә", "ʊə"),
    ("εә", "eə"),
    ("әu", "əʊ"),
    ("ei", "eɪ"),
    ("ai", "aɪ"),
    ("ɔi", "ɔɪ"),
    ("au", "aʊ"),
)

SINGLE_WORD = re.compile(r"[A-Za-z][A-Za-z'-]{1,29}")
CHINESE = re.compile(r"[\u4e00-\u9fff]")
POS = re.compile(r"^([a-z]{1,5}\.)\s*")
POS_MAP = {"a.": "adj.", "ad.": "adv.", "vt.": "v.", "vi.": "v."}
# Anything left that is a transcription rather than a bare number.
IPA_LIKE = re.compile(r"[a-zəɪʊæʌɒɜɛɔʃʒθðŋɹɾˈˌː]")


def clean_ipa(text: str) -> str:
    """Normalise one transcription, or return "" when it is not usable."""
    value = text.strip().strip("[]/ ").strip()
    if not value or len(value) < 2 or re.fullmatch(r"[0-9]+", value):
        return ""
    old = any(mark in value for mark in ("ә", "'", ":", ",")) or not any(
        ch in value for ch in "əɪʊæʌɒɜɛɔʃʒθðŋ"
    )
    value = (
        value.replace("ә", "ə")
        .replace("'", "ˈ")
        .replace("`", "ˈ")
        .replace(":", "ː")
        .replace(",", "ˌ")
    )
    if value.startswith("."):
        value = "ˌ" + value[1:]
    if old:
        for source, target in DIGRAPHS:
            value = value.replace(source, target)
    value = value.strip(" -;,")
    return value if IPA_LIKE.search(value) else ""


def split_phonetic(text: str) -> tuple[str, str]:
    """Return (UK, US) from `英 … 美 …`, or a single value as UK."""
    value = text.strip()
    if "英" in value or "美" in value:
        match = re.match(r"英\s*(.*?)\s*美\s*(.*)$", value, re.S)
        if match:
            uk = clean_ipa(match.group(1))
            us = clean_ipa(match.group(2))
            return uk or us, us or uk
        only = re.sub(r"^[英美]\s*", "", value)
        one = clean_ipa(only)
        return one, one
    one = clean_ipa(value)
    return one, one


def first_gloss(translation: str) -> str:
    """First meaningful Chinese line, with the literal `\\n` ECDICT stores."""
    text = (translation or "").replace("\\r", "").replace("\\n", "\n")
    for line in text.splitlines():
        line = line.strip()
        if CHINESE.search(line):
            return line
    return ""


def split_pos(gloss: str) -> tuple[str, str]:
    match = POS.match(gloss)
    if not match:
        return "", gloss
    pos = POS_MAP.get(match.group(1), match.group(1))
    return pos, gloss[match.end() :].strip() or gloss


def row_for(source: dict[str, str]) -> tuple[str, list[object]] | None:
    word = (source.get("word") or "").strip().replace("’", "'")
    if not SINGLE_WORD.fullmatch(word):
        return None
    gloss = first_gloss(source.get("translation") or "")
    if not gloss:
        return None
    uk, us = split_phonetic(source.get("phonetic") or "")
    if not uk:
        return None
    pos, zh = split_pos(gloss)
    if len(zh) > 140:
        zh = zh[:140].rstrip() + "…"
    key = word.lower()
    # UK and US are stored separately; a single transcription fills both so
    # either accent setting still has something to show.
    return key, [uk, us if us != uk else None, pos, zh]


def build(source: Path, out: Path, limit: int | None = None) -> dict[str, object]:
    csv.field_size_limit(10_000_000)
    rows: dict[str, list[str]] = {chr(letter): {} for letter in range(ord("a"), ord("z") + 1)}  # type: ignore[assignment]
    seen = 0
    kept = 0
    rejected = {"word": 0, "gloss": 0, "phonetic": 0}
    samples: dict[str, list[object]] = {}

    with source.open(encoding="utf-8", newline="") as handle:
        for item in csv.DictReader(handle):
            seen += 1
            if limit is not None and seen > limit:
                break
            word = (item.get("word") or "").strip().replace("’", "'")
            if not SINGLE_WORD.fullmatch(word):
                rejected["word"] += 1
                continue
            gloss = first_gloss(item.get("translation") or "")
            if not gloss:
                rejected["gloss"] += 1
                continue
            uk, us = split_phonetic(item.get("phonetic") or "")
            if not uk:
                rejected["phonetic"] += 1
                continue
            pos, zh = split_pos(gloss)
            if len(zh) > 140:
                zh = zh[:140].rstrip() + "…"
            key = word.lower()
            bucket = rows[key[0]]
            old = bucket.get(key)
            candidate = [uk, us if us != uk else None, pos, zh]
            # Prefer a row with both accents, then a longer gloss; this only
            # matters for duplicate spellings (Word / word and the like).
            if old is None or (candidate[1] is not None and old[1] is None):
                bucket[key] = candidate  # type: ignore[assignment]
                kept += 1
            if key not in samples:
                samples[key] = [word, *candidate]

    shards = {letter: dict(sorted(bucket.items())) for letter, bucket in rows.items()}
    return {
        "source": str(source),
        "seen": seen,
        "kept": sum(len(bucket) for bucket in shards.values()),
        "added": kept,
        "rejected": rejected,
        "shards": shards,
        "samples": samples,
    }


def write(result: dict[str, object], out: Path) -> dict[str, object]:
    out.mkdir(parents=True, exist_ok=True)
    shards: dict[str, dict[str, list[object]]] = result["shards"]  # type: ignore[assignment]
    files = []
    total = 0
    for letter, bucket in shards.items():
        path = out / f"{letter}.json"
        payload = json.dumps(bucket, ensure_ascii=False, separators=(",", ":"))
        path.write_text(payload, encoding="utf-8")
        size = path.stat().st_size
        total += size
        files.append({"letter": letter, "entries": len(bucket), "bytes": size})
    return {"files": files, "bytes": total, "entries": sum(item["entries"] for item in files)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--limit", type=int, default=None, help="only read the first N rows")
    parser.add_argument("--dry-run", action="store_true", help="report without writing shards")
    args = parser.parse_args()

    if not args.source.is_file():
        raise SystemExit(f"source CSV not found: {args.source}")

    result = build(args.source, args.out, args.limit)
    written = {"files": [], "bytes": 0, "entries": result["kept"]}
    if not args.dry_run:
        written = write(result, args.out)

    sample_keys = ("serendipity", "petrichor", "obfuscate", "halcyon")
    report = {
        "source": result["source"],
        "seen": result["seen"],
        "kept": result["kept"],
        "added": result["added"],
        "rejected": result["rejected"],
        "written": written,
        "samples": {key: result["samples"].get(key) for key in sample_keys},  # type: ignore[union-attr]
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(
        "seen={seen} kept={kept} bytes={bytes} files={files}".format(
            seen=result["seen"],
            kept=result["kept"],
            bytes=written["bytes"],
            files=len(written["files"]),
        )
    )


if __name__ == "__main__":
    main()
