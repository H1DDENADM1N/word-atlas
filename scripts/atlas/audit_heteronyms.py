"""Audit the atlas for heteronyms: one spelling, two pronunciations, one card.

OALD splits a homograph into separate `<div class="entry">` blocks (tear1_1,
tear1_2, tear2_1). We read the first `class="phon"` and `class="pos"` of each
block, keep only blocks whose headword matches the atlas word exactly (case
included, so Polish/polish and Job/job do not count), and flag a word when its
own senses fall on two different readings.

Usage:
    python3 scripts/atlas/audit_heteronyms.py /path/to/oaldpex.mdx [--json out.json]

The mdx is not in the repo (OUP copyright); point the script at a local copy.
"""
import argparse
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
ENTRIES = ROOT / "public" / "atlas" / "entries"
PRON = pathlib.Path(__file__).resolve().parent / "pron.json"

POS = {
    "n.": "noun", "v.": "verb", "adj.": "adjective", "adv.": "adverb",
    "prep.": "preposition", "conj.": "conjunction", "pron.": "pronoun",
    "det.": "determiner", "num.": "number", "exclam.": "exclamation",
}
# A reading spelled out letter by letter (act → /ˌeɪsiːˈtiː/) is an abbreviation
# entry, not a second pronunciation of the word on the card.
LETTER_NAME = re.compile(
    r"(ˌeɪ|ˌbiː|ˌsiː|ˌdiː|ˌef|ˌdʒiː|ˌeɪtʃ|ˌaɪ|ˌkeɪ|ˌel|ˌem|ˌen|ˌəʊ|ˌpiː|ˌkjuː|ˌɑː|"
    r"ˌes|ˌtiː|ˌjuː|ˌviː|ˌdʌbljuː|ˌeks|ˌwaɪ|ˌziː|ˌzed)"
)


def norm(phon):
    return phon.replace("(r)", "").replace(" ", "").strip()


def load_entries():
    out = {}
    for path in sorted(ENTRIES.glob("*.json")):
        for entry in json.loads(path.read_text(encoding="utf-8")):
            out[entry["w"].lower()] = entry
    return out


def scan(mdx_path, words):
    from mdict_utils.base.readmdict import MDX

    blocks_by_word = {}
    for key, value in MDX(str(mdx_path)).items():
        word = key.decode("utf-8", "replace").strip().lower()
        if word not in words:
            continue
        html = value.decode("utf-8", "replace")
        blocks = []
        for part in html.split('<div class="entry"')[1:]:
            head = re.search(r'class="headword"[^>]*>([^<]*)<', part)
            phon = re.search(r'class="phon"[^>]*>([^<]*)<', part)
            pos = re.findall(r'class="pos"[^>]*>([^<]*)<', part[:4000])
            if not phon:
                continue
            # keep case: "Polish" must not merge into "polish"
            if head and head.group(1).strip() != word:
                continue
            blocks.append({"phon": norm(phon.group(1)), "pos": sorted(set(pos))})
        blocks_by_word[word] = blocks
    return blocks_by_word


def classify(entries, blocks_by_word):
    handled = {w.lower() for w in json.loads(PRON.read_text(encoding="utf-8"))["words"]}
    rows = []
    for word, blocks in blocks_by_word.items():
        entry = entries.get(word)
        if not entry:
            continue
        phons = {b["phon"] for b in blocks}
        if len(phons) < 2 or any(LETTER_NAME.search(p) for p in phons):
            continue
        pos = {POS.get(s["pos"], s["pos"]) for s in entry["senses"]}
        hit = sorted({b["phon"] for b in blocks if set(b["pos"]) & pos})
        if len(hit) > 1:
            rows.append({
                "w": entry["w"],
                "readings": hit,
                "senses": entry["senses"],
                "handled": word in handled,
            })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mdx", help="path to oaldpex.mdx")
    ap.add_argument("--json", default="", help="write the raw rows here")
    args = ap.parse_args()

    entries = load_entries()
    blocks = scan(args.mdx, set(entries))
    rows = classify(entries, blocks)

    def bare(p):
        return p.replace("ˈ", "").replace("ˌ", "")

    todo = [r for r in rows if not r["handled"]]
    seg = [r for r in todo if bare(r["readings"][0]) != bare(r["readings"][1])]
    stress = [r for r in todo if bare(r["readings"][0]) == bare(r["readings"][1])]

    print(f"atlas words           {len(entries)}")
    print(f"matched in OALD       {len(blocks)}")
    print(f"two readings on a card {len(rows)}")
    print(f"  already handled     {len(rows) - len(todo)}")
    print(f"  phoneme difference  {len(seg)}")
    print(f"  stress only         {len(stress)}")

    if args.json:
        pathlib.Path(args.json).write_text(
            json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        print(f"rows written to {args.json}")


if __name__ == "__main__":
    main()
