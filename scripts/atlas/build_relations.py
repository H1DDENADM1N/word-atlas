"""Assign each synonym to one of the card's senses.

The card is not a learner's dictionary: most entries have two or three senses,
and a synonym list is flat. This script writes a parallel ``syn_sense`` array so
the UI can show the closest sense and put everything else under "其他义项".

Evidence comes from the target card's own senses (Chinese gloss + English
definition) or, when the target has no card, from the ECDICT fallback gloss.
A synonym with no believable sense stays in ``other``; nothing is dropped.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

from thesaurus import bigrams, clean_token, overlap

ROOT = Path(__file__).resolve().parents[2]
ENTRIES = ROOT / "public" / "atlas" / "entries"
DATA = ROOT / "data" / "word-atlas.json"
FALLBACK = ROOT / "public" / "atlas" / "fallback"
DUMP = Path(__file__).resolve().parent / "relations.json"
REPORT = ROOT / ".workbuddy" / "tmp" / "relations-report.json"

# A card sense and a target sense must share a real gloss, not a stray char.
SENSE_THRESHOLD = 0.33
# ECDICT translations are broader than a single card sense; demand more.
FALLBACK_THRESHOLD = 0.5
DISPLAY_LIMIT = 8

WORD = re.compile(r"[a-z][a-z'-]+")
EN_STOP = set(
    "the and for with that this from into you your are all words word means mean "
    "something someone person people thing things which what when where how have "
    "has had not but can could will would may might must should about after before "
    "more most very also only just like such other another used use using they them "
    "their there then than these those some any each both same different make makes "
    "making made have having".split()
)


def norm_pos(pos: str) -> str:
    return {
        "n.": "noun",
        "v.": "verb",
        "adj.": "adjective",
        "adv.": "adverb",
        "phr. v.": "phrasal verb",
    }.get(pos, pos)


def stem(word: str) -> str:
    if len(word) > 5 and word.endswith("ing"):
        return word[:-3]
    if len(word) > 4 and word.endswith("ed"):
        return word[:-2]
    if len(word) > 4 and word.endswith("es"):
        return word[:-2]
    if len(word) > 3 and word.endswith("s"):
        return word[:-1]
    return word


def english(text: str) -> set[str]:
    tokens = {
        stem(word)
        for word in WORD.findall((text or "").lower())
        if len(word) >= 3 and word not in EN_STOP
    }
    return tokens


def gloss_score(source: dict, target: dict) -> float:
    chinese = overlap(bigrams(source.get("zh", "")), bigrams(target.get("zh", "")))
    left, right = english(source.get("en", "")), english(target.get("en", ""))
    shared = len(left & right) / max(1, min(len(left), len(right))) if left and right else 0.0
    return max(chinese, shared * 0.85)


def fallback_score(source: dict, translation: str) -> float:
    return overlap(bigrams(source.get("zh", "")), bigrams(translation))


def pick(
    entry: dict,
    token: str,
    by_word: dict[str, dict],
    fallback: dict[str, list],
) -> dict | None:
    target = by_word.get(token.lower())
    best: tuple[float, int, int, str] | None = None

    if target:
        for index, source in enumerate(entry.get("senses", [])):
            for other_index, other in enumerate(target.get("senses", [])):
                if norm_pos(source.get("pos", "")) != norm_pos(other.get("pos", "")):
                    continue
                score = gloss_score(source, other)
                if score >= SENSE_THRESHOLD and (best is None or score > best[0]):
                    best = (score, index, other_index, "atlas")
        if best is None and token.lower() in fallback:
            best = pick_fallback(entry, fallback[token.lower()][3])
    elif token.lower() in fallback:
        best = pick_fallback(entry, fallback[token.lower()][3])

    if best is None:
        return None

    score, source_sense, target_sense, source = best
    if target:
        reverse = {clean_token(word).lower() for word in target.get("syn", [])}
        status = "confirmed" if entry["w"].lower() in reverse else "oneway"
    elif token.lower() in fallback:
        status = "fallback"
    else:
        status = "unresolved"

    return {
        "t": token,
        "s": source_sense,
        "ts": target_sense,
        "src": source,
        "score": round(score, 2),
        "status": status,
    }


def pick_fallback(entry: dict, translation: str) -> tuple[float, int, int, str] | None:
    best: tuple[float, int, int, str] | None = None
    for index, source in enumerate(entry.get("senses", [])):
        score = fallback_score(source, translation)
        if score >= FALLBACK_THRESHOLD and (best is None or score > best[0]):
            best = (score, index, -1, "ecdict")
    return best


def load_fallback() -> dict[str, list]:
    rows: dict[str, list] = {}
    for path in sorted(FALLBACK.glob("*.json")):
        rows.update(json.loads(path.read_text(encoding="utf-8")))
    return rows


def build(entries: list[dict], fallback: dict[str, list]) -> tuple[dict[str, list[int]], dict[str, dict], Counter]:
    by_word = {entry["w"].lower(): entry for entry in entries}
    indexes: dict[str, list[int]] = {}
    table: dict[str, dict] = {}
    report = Counter()

    for entry in entries:
        words = entry.get("syn", [])
        if not words:
            continue
        rows: list[dict] = []
        placed: list[tuple[int, int, dict]] = []
        for position, word in enumerate(words):
            row = pick(entry, word, by_word, fallback)
            if row is None:
                row = {
                    "t": word,
                    "s": -1,
                    "ts": -1,
                    "src": "none",
                    "score": 0,
                    "status": "unresolved",
                }
                report["unresolved"] += 1
            elif row["s"] < 0:
                report["unresolved"] += 1
            else:
                report[row["status"]] += 1
                placed.append((position, row["s"], row))
            rows.append(row)

        # Each sense shows at most DISPLAY_LIMIT words; the tail moves to other.
        kept = Counter()
        aligned = [-1] * len(words)
        for position, sense, row in placed:
            if kept[sense] < DISPLAY_LIMIT:
                aligned[position] = sense
                kept[sense] += 1
            else:
                report["capped"] += 1

        if len(entry.get("senses", [])) > 1:
            indexes[entry["id"]] = aligned
            report["multi"] += 1
            if any(sense >= 0 for sense in aligned):
                report["multi_with_group"] += 1
            else:
                report["multi_all_other"] += 1
        table[entry["id"]] = {"syn": rows, "idx": aligned}

    return indexes, table, report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--report", type=Path, default=REPORT)
    args = parser.parse_args()

    # Read every chunk in name order (0.json … 72.json).
    entries = []
    for path in sorted(ENTRIES.glob("*.json"), key=lambda item: int(item.stem)):
        entries.extend(json.loads(path.read_text(encoding="utf-8")))
    data = json.loads(DATA.read_text(encoding="utf-8"))
    fallback = load_fallback()

    indexes, table, report = build(entries, fallback)
    report["entries"] = len(entries)
    report["with_syn"] = sum(1 for entry in entries if entry.get("syn"))
    report["assigned_all"] = sum(
        1 for item in table.values() for row in item["syn"] if row["s"] >= 0
    )
    report["other_all"] = sum(
        1 for item in table.values() for row in item["syn"] if row["s"] < 0
    )
    report["assigned"] = sum(1 for values in indexes.values() for value in values if value >= 0)
    report["other"] = sum(1 for values in indexes.values() for value in values if value < 0)
    report["thresholds"] = {"sense": SENSE_THRESHOLD, "fallback": FALLBACK_THRESHOLD}

    if args.dry_run:
        print(json.dumps(report, ensure_ascii=False, indent=1))
        return

    for path in sorted(ENTRIES.glob("*.json"), key=lambda item: int(item.stem)):
        chunk = json.loads(path.read_text(encoding="utf-8"))
        changed = False
        for entry in chunk:
            value = indexes.get(entry["id"])
            if value is None:
                changed |= entry.pop("syn_sense", None) is not None
            elif entry.get("syn_sense") != value:
                entry["syn_sense"] = value
                changed = True
        if changed:
            path.write_text(
                json.dumps(chunk, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )

    by_id = {entry["id"]: indexes[entry["id"]] for entry in entries if entry["id"] in indexes}
    for entry in data:
        value = by_id.get(entry["id"])
        if value is None:
            entry.pop("syn_sense", None)
        else:
            entry["syn_sense"] = value
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    payload = {
        "version": 1,
        "thresholds": report["thresholds"],
        "counts": dict(report),
        "words": table,
    }
    DUMP.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
