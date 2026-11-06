"""Merge 同义词学习词典 synonyms into the shipped word cards.

Reads ``thesaurus.json`` (from ``thesaurus.py``) and appends same-part-of-speech
synonyms to every card that appears in a synonym group. The merge is the one the
project chose deliberately:

  * the card's existing ``syn`` list is kept, new words are appended;
  * part of speech must match (``n./v./adj./adv./phr. v.`` ↔ dictionary pos);
  * only headwords already in the atlas are added, so every lookup resolves;
  * duplicates are removed case-insensitively, the card's own headword excluded;
  * no cap — the etymology import's 6-word ceiling does not apply;
  * a group is skipped unless its Chinese gloss overlaps the card's gloss by at
    least ``--min-relevance`` (default 0.3), so other senses of the headword stay out;
  * groups are ordered by gloss relevance, so the closest sense comes first.

Writes the 73 entry chunks, then regenerates ``data/word-atlas.json`` and
``data/word-atlas.csv`` from them, exactly as ``build_atlas.py`` does.

Usage:
  python scripts/atlas/import_thesaurus.py --dry-run   # report only
  python scripts/atlas/import_thesaurus.py             # merge + rebuild data
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import thesaurus  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
ENTRIES = ROOT / "public" / "atlas" / "entries"
DATA = ROOT / "data"
DUMP = Path(__file__).resolve().parent / "thesaurus.json"
REPORT = ROOT / ".workbuddy" / "tmp" / "thesaurus-report.json"

CSV_HEADER = [
    "id", "word", "ipa_uk", "ipa_us", "cefr", "topic", "meanings_zh", "definition_en",
    "example1_en", "example1_zh", "example2_en", "example2_zh", "collocations", "word_family",
    "synonyms", "antonyms", "tip_zh",
]


def load_entries() -> list[dict]:
    entries: list[dict] = []
    for path in sorted(ENTRIES.glob("*.json"), key=lambda p: int(p.stem)):
        entries.extend(json.loads(path.read_text(encoding="utf-8")))
    return entries


def public_view(entries: list[dict]) -> list[dict]:
    return [{k: v for k, v in c.items() if not k.startswith("_") and k != "m"} for c in entries]


def write_data(entries: list[dict]) -> None:
    public = public_view(entries)
    (DATA / "word-atlas.json").write_text(
        json.dumps(public, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    with open(DATA / "word-atlas.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(CSV_HEADER)
        for c in public:
            ex = c["ex"] + [{"en": "", "zh": ""}] * (2 - len(c["ex"]))
            w.writerow([
                c["id"], c["w"], c["uk"], c["us"], c["cefr"], c["topic"],
                " | ".join(f'{s["pos"]} {s["zh"]}' for s in c["senses"]),
                " | ".join(s["en"] for s in c["senses"]),
                ex[0]["en"], ex[0]["zh"], ex[1]["en"], ex[1]["zh"],
                " ; ".join(c["col"]), " ; ".join(c["fam"]), ", ".join(c["syn"]),
                ", ".join(c["ant"]), c["tip"],
            ])


def dedupe_existing(entry: dict) -> int:
    """Keep the first spelling of every synonym; returns how many were dropped."""
    syn = entry.get("syn", [])
    seen: set[str] = set()
    out: list[str] = []
    for word in syn:
        key = word.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(word)
    if len(out) != len(syn):
        entry["syn"] = out
        return len(syn) - len(out)
    return 0


def main() -> None:
    ap = argparse.ArgumentParser(description="merge thesaurus.json into the word cards")
    ap.add_argument("--dry-run", action="store_true", help="report only, write nothing")
    ap.add_argument("--report", type=Path, default=REPORT)
    ap.add_argument(
        "--min-relevance",
        type=float,
        default=thesaurus.MIN_RELEVANCE,
        help="minimum Chinese-gloss overlap for a synonym group (default 0.3)",
    )
    a = ap.parse_args()

    if not DUMP.exists():
        raise SystemExit(f"missing {DUMP}; run scripts/atlas/thesaurus.py first")

    data = thesaurus.load(DUMP)
    entries = load_entries()
    canon = thesaurus.canonical(entries)

    before_total = sum(len(c.get("syn", [])) for c in entries)
    before_dist = Counter(len(c.get("syn", [])) for c in entries)
    baseline_data_equal = json.loads((DATA / "word-atlas.json").read_text(encoding="utf-8")) == public_view(entries)
    added_dist = Counter()
    changed = 0
    added = 0
    deduped = 0
    samples: list[dict] = []

    for entry in entries:
        deduped += dedupe_existing(entry)
        extra = thesaurus.new_synonyms(entry, data, canon, a.min_relevance)
        if not extra:
            continue
        entry["syn"] = entry.get("syn", []) + extra
        changed += 1
        added += len(extra)
        added_dist[len(extra)] += 1
        if len(samples) < 400:
            samples.append({
                "w": entry["w"],
                "old": entry.get("syn", [])[: len(entry.get("syn", [])) - len(extra)],
                "added": extra,
            })

    samples.sort(key=lambda s: len(s["added"]), reverse=True)
    after_total = before_total + added
    after_dist = Counter(len(c.get("syn", [])) for c in entries)

    report = {
        "cards": len(entries),
        "changed": changed,
        "added": added,
        "deduped": deduped,
        "syn_before": before_total,
        "syn_after": after_total,
        "added_dist": dict(sorted(added_dist.items())),
        "max_added": max(added_dist) if added_dist else 0,
        "before_count_dist": dict(sorted(before_dist.items())),
        "after_count_dist": dict(sorted(after_dist.items())),
        "samples": samples[:25],
        "watch": [
            {"w": c["w"], "syn": c.get("syn", [])}
            for c in entries
            if c["w"] in {"strong", "body", "light", "good", "minute", "sharp", "save", "trip"}
        ],
        "groups": len(data["groups"]),
        "indexed_words": len(data["words"]),
        "min_relevance": a.min_relevance,
        "baseline_data_equal": baseline_data_equal,
    }

    if not a.dry_run:
        # Re-read by chunk so only touched files are rewritten.
        cursor = 0
        for path in sorted(ENTRIES.glob("*.json"), key=lambda p: int(p.stem)):
            chunk = json.loads(path.read_text(encoding="utf-8"))
            size = len(chunk)
            part = entries[cursor : cursor + size]
            cursor += size
            if part != chunk:
                path.write_text(
                    json.dumps(part, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8",
                )
        write_data(entries)

        rebuilt = load_entries()
        report["verified"] = {
            "entries_equal": rebuilt == entries,
            "data_equal": json.loads((DATA / "word-atlas.json").read_text(encoding="utf-8"))
            == public_view(entries),
            "csv_rows": len((DATA / "word-atlas.csv").read_text(encoding="utf-8").splitlines()) - 1,
        }
    else:
        report["verified"] = {"data_equal_before_merge": baseline_data_equal}

    a.report.parent.mkdir(parents=True, exist_ok=True)
    a.report.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("cards", "changed", "added", "syn_before", "syn_after")}))
    print(f"report → {a.report}")


if __name__ == "__main__":
    main()
