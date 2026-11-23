"""Import the etymology dictionary (etymology.mdx) into the word cards.

The 2026-11 edition covers COCA's 40,000 headwords (39,875 records, up from
19,996) and lays every section out as one `<td>label：</td><td>value</td>` table
row instead of the plain, hard-wrapped text of the first edition. Each record
carries the same nine sections:

  【词义】       (no heading — the senses that open the record)
  【词源图景】   词根 / 画面 / 小结
  【词源】       本意 / 故事 / 演变
  【词根词缀】   词根 / 含义 / 前缀 / 后缀 / 说明
  【核心语义】   概念 / 感觉 / 逻辑
  【核心特质】   …
  【近义词辨析】  1. word — 辨析
  【固定搭配】   …
  【同根词】     word /ipa/ gloss

The card only wants three of them:

  【词源图景】  小结        → `ety`, the note between the IPA and the senses
  【近义词辨析】- word list  → appended to `syn`
  【同根词】    - word      → the `root` list

The MDX is Encrypted="2" but only its key table is locked; the record blocks are
plain zlib, so `mdx_records.py` decodes them and reads the headword from the
`<font size=3>` banner that opens each record.

Two data defects in the source are repaired on the way in:

  * a little over a hundred 小结 were left as the generator's own instruction
    ("严格按照“…”这样的句式，把 root_breakdown 和 literal_image 组织成…") —
    the quoted sentence inside is the real summary, so it is unwrapped;
  * British spellings and regular inflections are filed under the American or
    the base form, so `ALIAS` points those at the headword that carries the
    etymology. Only true spelling variants and regular inflections belong here:
    `arms` is not `arm` (Latin arma, not *armaz) and `tyre` is not `tire`.

Usage:
  python scripts/etymology/import_etymology.py --dump   # parse only, write JSON
  python scripts/etymology/import_etymology.py          # merge into atlas chunks
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mdx_records import EtymMDX  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
MDX = ROOT / "etymology" / "etymology.mdx"
ENTRIES = ROOT / "public" / "atlas" / "entries"
DUMP = Path(__file__).resolve().parent / "etymology.json"

HEADING = re.compile(r"【([^】]{1,10})】")
TAG = re.compile(r"<[^>]+>")
CELL = re.compile(r"<td[^>]*>\s*(.*?)</td>\s*<td[^>]*>(.*?)</td>", re.S)
ITEM = re.compile(r"^\s{2}- (.*)$")
LEAK = re.compile(r"^\s*严格按照[:：]?\s*")
LEAK_TAIL = re.compile(r"[”\"]?\s*这样的句式.*$", re.S)
QUOTED = re.compile(r"^[“\"](.+?)[”\"]?$", re.S)

# Atlas headword → the headword the dictionary files its etymology under.
ALIAS = {
    # British spellings
    "centre": "center", "theatre": "theater", "metre": "meter", "litre": "liter",
    "centimetre": "centimeter", "millimetre": "millimeter", "neighbour": "neighbor",
    "behaviour": "behavior", "flavour": "flavor", "humour": "humor", "colour": "color",
    "armour": "armor", "odour": "odor", "vapour": "vapor", "tumour": "tumor",
    "glamour": "glamor", "dishonour": "dishonor", "organisation": "organization",
    "realise": "realize", "recognise": "recognize", "apologise": "apologize",
    "specialised": "specialized", "organise": "organize", "utilise": "utilize",
    "jeopardise": "jeopardize", "paralyse": "paralyze", "programme": "program",
    "maths": "math", "pyjamas": "pajamas", "woollen": "woolen", "suncream": "sunscreen",
    "chilli": "chili", "enrol": "enroll", "despatch": "dispatch", "reflexion": "reflection",
    "sulphide": "sulfide", "fibreglass": "fiberglass", "manoeuvre": "maneuver",
    "cheque/check": "check", "self-defence": "self-defense", "mid-day": "midday",
    "easy-going": "easygoing", "hardworking": "hard-working", "ladybird": "ladybug",
    "bread-earner": "breadwinner", "postmortem": "post-mortem",
    # hyphen and solid-compound variants
    "p.m.": "pm", "check-out": "checkout", "check-up": "checkup", "make-up": "makeup",
    "take-off": "takeoff", "take away": "takeaway", "secondhand": "second-hand",
    "bestseller": "best-seller", "post office": "post-office", "email": "e-mail",
    # regular inflections filed under the base form
    "chips": "chip", "leaves": "leaf", "children": "child", "women": "woman",
    "feet": "foot", "glasses": "glass", "goods": "good", "customs": "custom",
    "contents": "content", "arts": "art", "findings": "finding", "tactics": "tactic",
    "graphics": "graphic", "mechanics": "mechanic", "phonetics": "phonetic",
    "persuading": "persuade", "carbohydrates": "carbohydrate", "antibiotics": "antibiotic",
    "futures": "future", "built": "build", "stripes": "stripe", "firework": "fireworks",
    "outskirt": "outskirts", "congratulation": "congratulations", "sneaker": "sneakers",
    "farther": "far", "latest": "late", "alga": "algae", "criterion": "criteria",
    "bacterium": "bacteria",
    # derivations the dictionary keeps as their own headword
    "orientate": "orient", "dissatisfy": "dissatisfied", "proofreading": "proofread",
    "babysitter": "baby-sitter", "hold-up": "holdup", "non-refundable": "nonrefundable",
    "telecommunication": "telecommunications", "poliomyelitis": "polio",
    "superintend": "superintendent", "mincer": "mince", "hairdress": "hairdresser",
}


def sections(body: str) -> dict[str, str]:
    """Split a record into 【heading】 → raw text, stopping at the trailing images."""
    body = body.split("<img", 1)[0]
    out: dict[str, str] = {}
    hits = list(HEADING.finditer(body))
    for i, hit in enumerate(hits):
        end = hits[i + 1].start() if i + 1 < len(hits) else len(body)
        out[hit.group(1)] = body[hit.end():end]
    return out


def unwrap(text: str) -> str:
    """Undo the dictionary's hard wrapping and inline tags.

    Lines were broken by display width, so a break inside Chinese joins with
    nothing while a break between two Latin words keeps one space ("clove / of
    garlic"). Tags and blank lines go first.
    """
    text = TAG.sub("", text).replace("\r", "")
    out = ""
    for line in (l.strip() for l in text.split("\n")):
        if not line:
            continue
        if not out:
            out = line
        elif re.search(r"[A-Za-z0-9]$", out) and re.match(r"[A-Za-z0-9']", line):
            out += " " + line
        else:
            out += line
    return re.sub(r"\s{2,}", " ", out).strip()


def cells(section: str) -> dict[str, str]:
    """`label：` / `value` pairs of a section, in document order."""
    out: dict[str, str] = {}
    for label, value in CELL.findall(section):
        label = TAG.sub("", label).strip().strip("：: ")
        if label and label not in out:
            out[label] = unwrap(value)
    return out


def field(text: str, label: str) -> str:
    """The value of `词根：…` in the first edition's plain-text layout."""
    m = re.search(
        rf"{label}：(.+?)(?=\s*(?:词根|画面|小结|本词强调|概念|感觉|逻辑|概括|维度|含义|前缀|后缀|说明)：|$)",
        text, re.S,
    )
    return unwrap(m.group(1)) if m else ""


def items(section: str) -> list[tuple[str, str]]:
    """`  - head` entries with the lines that follow them."""
    out: list[tuple[str, str]] = []
    for line in section.replace("\r", "").split("\n"):
        m = ITEM.match(line)
        if m:
            out.append((m.group(1).strip(), ""))
        elif out and line.strip() and not line.strip().startswith("<"):
            head, tail = out[-1]
            out[-1] = (head, (tail + " " + line.strip()).strip())
    return out


def head_word(raw: str) -> str:
    """The headword of a bullet — `1. resist`, `- an  /ən/  art.…` → `resist`, `an`."""
    word = re.sub(r"^\d+[.、)]\s*", "", raw.strip())
    word = re.split(r"\s{2,}|\s+/", word)[0]
    return word.strip(" .。:：-")


def parse_syn(section: str, head: str) -> list[str]:
    words = []
    for raw, _ in items(section):
        word = re.sub(r"\s*\(.*?\)\s*$", "", head_word(raw))
        if not word or word.lower() == head.lower():
            continue
        if not re.fullmatch(r"[A-Za-z][A-Za-z' -]{0,30}", word):
            continue
        if word.lower() not in (w.lower() for w in words):
            words.append(word)
    return words


def parse_root(section: str, head: str) -> list[str]:
    """Just the headwords: the gloss is a tap away in the lookup card."""
    out = []
    for raw, _ in items(section):
        word = head_word(raw)
        if not re.fullmatch(r"[A-Za-z][A-Za-z' -]{0,30}", word) or word.lower() == head.lower():
            continue
        if word.lower() not in (w.lower() for w in out):
            out.append(word)
    return out


def clean(summary: str) -> str:
    """Drop the generator's instruction that a few summaries still carry.

    Those records read `严格按照“<the real summary>”这样的句式，把 root_breakdown
    和 literal_image 组织成…`, so the quoted sentence is what belongs on the card.
    """
    summary = summary.strip()
    if not (LEAK.match(summary) or re.search(r"root_breakdown|literal_image|话术|速写小结", summary)):
        return summary
    text = LEAK_TAIL.sub("", summary)
    text = LEAK.sub("", text).strip()
    quoted = QUOTED.match(text)
    if quoted:
        text = quoted.group(1).strip()
    return text.strip("“”\" ")


def parse(word: str, body: str) -> dict | None:
    sec = sections(body)
    scene = sec.get("词源图景", "")
    row = cells(scene)
    summary = clean(row.get("小结") or field(scene, "小结"))
    if not summary:
        return None
    return {
        "r": row.get("词根") or field(scene, "词根"),
        "s": summary,
        "syn": parse_syn(sec.get("近义词辨析", ""), word),
        "root": parse_root(sec.get("同根词", ""), word),
    }


def dedupe(words: list[str], head: str) -> list[str]:
    """Case-insensitive unique, and never the headword itself."""
    out: list[str] = []
    seen = {head.lower()}
    for w in words:
        w = w.strip()
        if w and w.lower() not in seen:
            seen.add(w.lower())
            out.append(w)
    return out


def lookup(words: dict[str, dict], head: str) -> tuple[dict, str] | None:
    """The record for a card: the headword itself, else its spelling twin."""
    key = head.lower()
    if key in words:
        return words[key], key
    twin = ALIAS.get(key)
    if twin and twin in words:
        return words[twin], twin
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", action="store_true", help="only write the parsed JSON")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()

    mdx = EtymMDX(MDX)
    words: dict[str, dict] = {}
    empty = []
    for i, (word, body) in enumerate(mdx.records()):
        if a.limit and i >= a.limit:
            break
        data = parse(word, body)
        if data:
            words[word.lower()] = data
        else:
            empty.append(word)

    DUMP.write_text(
        json.dumps(
            {"v": 2, "source": "词源词典 etymology.mdx (COCA 40,000)", "words": words},
            ensure_ascii=False, separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"parsed {len(words)} entries · {len(empty)} without a 词源图景 {empty[:5]} · {DUMP.stat().st_size / 1024 / 1024:.1f} MB")
    if a.dump:
        return

    # Merge into the shipped chunks, which the card already loads one at a time.
    total = hit = alias = 0
    fresh = refreshed = 0
    syn_added = root_added = 0
    for path in sorted(ENTRIES.glob("*.json")):
        chunk = json.loads(path.read_text(encoding="utf-8"))
        changed = False
        for e in chunk:
            total += 1
            found = lookup(words, e["w"])
            if not found:
                continue
            data, key = found
            hit += 1
            if key != e["w"].lower():
                alias += 1
            had = bool(e.get("ety"))
            if e.get("ety") != data["s"]:
                e["ety"] = data["s"]
                changed = True
                if had:
                    refreshed += 1
                else:
                    fresh += 1
            if had:
                # 词族, 近义 and 同根词 were settled when the card first got its
                # etymology; a re-import must not re-rank them against the
                # thesaurus rows that were appended afterwards.
                continue
            if data["syn"]:
                have = {s.lower() for s in e.get("syn", [])}
                # Six is what the card shows without wrapping into a wall; a
                # card the thesaurus already filled keeps the list it has.
                room = max(0, 6 - len(e.get("syn", [])))
                extra = [s for s in data["syn"] if s.lower() not in have][:min(4, room)]
                if extra:
                    # The 近义 row and `syn_sense` are parallel arrays: the new
                    # words go in front, so their sense index is "unmapped".
                    if e.get("syn_sense"):
                        e["syn_sense"] = [-1] * len(extra) + e["syn_sense"]
                    e["syn"] = extra + e.get("syn", [])
                    syn_added += len(extra)
                    changed = True
            if data["root"]:
                # 词族 already lists the inflections ("librarian (n.)"), and a
                # synonym is rarely worth repeating as a cognate too.
                skip = {re.sub(r"\s*\(.*\)\s*$", "", f).strip().lower() for f in e.get("fam", [])}
                skip |= {s.lower() for s in e.get("syn", [])}
                roots = [w for w in data["root"] if w.lower() not in skip][:6]
                if roots:
                    e["root"] = roots
                    root_added += len(roots)
                    changed = True
        if changed:
            path.write_text(json.dumps(chunk, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"covered {hit}/{total} entries ({hit / total:.1%}) · {fresh} new · {refreshed} refreshed"
        f" · +{syn_added} synonyms · {root_added} same-root links"
    )


if __name__ == "__main__":
    main()
