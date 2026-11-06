"""Parse the synonym learner's dictionary (同义词学习词典) into a compact JSON.

The source is an MDict 2.0 file with ``Encrypted="2"``: only the key table is
locked, the record blocks are ordinary zlib streams. Every record is a run of
``entry-content`` groups (``olect_<head>_<n>``), each holding one synonym set:

    <div class="entry-content" id="olect_abandon_0">
      <h>abandon</h><p-blk><p>verb</p></p-blk>
      <syn-g>
        <syn><a href="#abandon_2">abandon</a></syn> …
        <d>These words all mean …<chnsep> </chnsep><chn>这些词均表示…。</chn></d>
      </syn-g>
      <sh-g>… per-word gloss …</sh-g>

The same group appears in several records (index pages repeat it), so groups are
deduplicated by id. The per-word ``sh-g`` glosses are not needed: the card picks
groups by part of speech, keeps only those whose Chinese gloss overlaps the card
gloss enough (``MIN_RELEVANCE``), and ranks them closest sense first.

Run once, then merge with ``import_thesaurus.py``:

    python scripts/atlas/thesaurus.py
"""

from __future__ import annotations

import argparse
import html
import json
import re
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MDX = ROOT / "同义词学习词典" / "同义词学习词典.mdx"
DUMP = Path(__file__).resolve().parent / "thesaurus.json"

ENTRY = re.compile(
    r'<div class="entry-content" id="olect_([^"]*)">(.*?)(?=<div class="entry-content"|$)',
    re.S,
)
HEAD = re.compile(r"<h>(.*?)</h>", re.S)
POS = re.compile(r"<p-blk><p>(.*?)</p></p-blk>", re.S)
GROUP = re.compile(r"<syn-g[^>]*>(.*?)</syn-g>", re.S)
SYN = re.compile(r'<syn[^>]*><a href="#[^"]*">(.*?)</a></syn>', re.S)
DEF = re.compile(r"<d[^>]*>(.*?)</d>", re.S)
CHN = re.compile(r"<chn>(.*?)</chn>", re.S)
TAG = re.compile(r"<[^>]+>")

POS_MAP = {
    "n.": "noun",
    "v.": "verb",
    "adj.": "adjective",
    "adv.": "adverb",
    "phr. v.": "phrasal verb",
    "noun": "noun",
    "verb": "verb",
    "adjective": "adjective",
    "adverb": "adverb",
    "phrasal verb": "phrasal verb",
}

# Minimum Chinese-gloss overlap for a group to be merged into a card. 0.3 keeps
# the groups whose definition genuinely names the card's sense (the score is a
# bigram overlap normalised by the shorter gloss), and drops the ones that only
# share a stray character or belong to another sense of the headword.
MIN_RELEVANCE = 0.3
# Characters that carry no discriminating meaning in the one-line group gloss
# ("这些词均表示…"). Dropping them keeps the overlap score on content words.
STOP = set(
    "的了是在和与或等这些词均表示指某种及以为对于中而也都就很非常更最所被把让使得着过其之该各每"
)
HAN = re.compile(r"[^\u4e00-\u9fff]")


class ThesaurusMDX:
    """Read record blocks of an Encrypted="2" MDict without touching its key table."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.fp = open(self.path, "rb")
        self._header()
        self._locate_records()

    def _header(self) -> None:
        fp = self.fp
        size = struct.unpack(">I", fp.read(4))[0]
        header = fp.read(size).decode("utf-16le").strip("\x00 \t\r\n")
        fp.read(4)
        self.header = header

    def _locate_records(self) -> None:
        fp = self.fp
        self.data_start = fp.tell()
        fp.read(8)  # number of key blocks
        self.num_entries = struct.unpack(">Q", fp.read(8))[0]
        fp.seek(self.data_start)
        head = fp.read(600_000)
        total = self.path.stat().st_size
        for off in range(0, len(head) - 32):
            n1, n2, n3, n4 = struct.unpack(">4Q", head[off : off + 32])
            if n2 != self.num_entries or n3 != n1 * 16 or not (0 < n4 <= total):
                continue
            if not (0 < n1 < 100_000):
                continue
            self.record_header = self.data_start + off
            self.num_record_blocks = n1
            self.record_info_size = n3
            self.record_bytes = n4
            return
        raise RuntimeError("record block header not found")

    def text(self) -> str:
        """The concatenated HTML of every record, in dictionary order."""
        fp = self.fp
        fp.seek(self.record_header)
        n1, _, n3, _ = struct.unpack(">4Q", fp.read(32))
        info = fp.read(n3)
        sizes = [struct.unpack(">Q", info[i * 16 : i * 16 + 8])[0] for i in range(n1)]
        buf = bytearray()
        for size in sizes:
            buf += zlib.decompress(fp.read(size)[8:])
        return bytes(buf).decode("utf-8", "replace")

    def close(self) -> None:
        self.fp.close()


def plain(s: str) -> str:
    """Tags → space, collapse whitespace (for English glosses)."""
    return re.sub(r"\s+", " ", html.unescape(TAG.sub(" ", s))).strip()


def chinese(s: str) -> str:
    """Tags → nothing, so a wrapped Chinese gloss does not gain spaces."""
    return re.sub(r"\s+", " ", html.unescape(TAG.sub("", s))).strip()


def parse_body(body: str) -> dict | None:
    h = HEAD.search(body)
    if not h:
        return None
    head = plain(h.group(1))
    pm = POS.search(body)
    pos = plain(pm.group(1)) if pm else ""
    sg = GROUP.search(body)
    if not head or not sg:
        return None
    syns: list[str] = []
    for raw in SYN.findall(sg.group(1)):
        word = plain(raw)
        if word and word.lower() not in {s.lower() for s in syns}:
            syns.append(word)
    if not syns:
        return None
    zh = en = ""
    dm = DEF.search(sg.group(1))
    if dm:
        definition = dm.group(1)
        before, sep, _ = definition.partition("<chnsep>")
        en = plain(before)
        cm = CHN.search(definition)
        if cm:
            zh = chinese(cm.group(1))
    return {"h": head, "pos": pos, "zh": zh, "en": en, "syns": syns}


def parse(text: str) -> tuple[dict[str, dict], dict[str, list[str]]]:
    """Deduplicate groups by id, preferring the copy that carries the synonym set."""
    best: dict[str, str] = {}
    for m in ENTRY.finditer(text):
        eid, body = m.group(1), m.group(2)
        has_group = GROUP.search(body) is not None
        old = best.get(eid)
        if old is None:
            best[eid] = body
        elif has_group and GROUP.search(old) is None:
            best[eid] = body
        elif has_group and len(body) > len(old):
            best[eid] = body

    groups: dict[str, dict] = {}
    for eid, body in best.items():
        group = parse_body(body)
        if group:
            groups[eid] = group

    words: dict[str, list[str]] = {}
    for eid in sorted(groups):
        group = groups[eid]
        for word in [group["h"], *group["syns"]]:
            key = word.lower()
            if not key:
                continue
            bucket = words.setdefault(key, [])
            if eid not in bucket:
                bucket.append(eid)
    return groups, words


def build(mdx_path: str | Path = MDX, out: str | Path = DUMP) -> tuple[int, int]:
    mdx = ThesaurusMDX(mdx_path)
    try:
        groups, words = parse(mdx.text())
    finally:
        mdx.close()
    payload = {
        "v": 1,
        "source": "牛津英语同义词学习词典 英汉双解版",
        "entries": mdx.num_entries,
        "groups": groups,
        "words": words,
    }
    Path(out).write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return len(groups), len(words)


def load(path: str | Path = DUMP) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def positions(entry: dict) -> set[str]:
    return {
        POS_MAP.get(s.get("pos", ""), s.get("pos", "")) for s in entry.get("senses", [])
    }


def bigrams(s: str) -> set[str]:
    s = HAN.sub("", s)
    s = "".join(ch for ch in s if ch not in STOP)
    return {s[i : i + 2] for i in range(len(s) - 1)} or ({s} if s else set())


def overlap(a: set[str], b: set[str]) -> float:
    return len(a & b) / max(1, min(len(a), len(b)))


def relevance(entry: dict, group: dict) -> float:
    """How well the group gloss matches the card's glosses of the same part of speech."""
    gloss = bigrams(group.get("zh", ""))
    if not gloss:
        return 0.0
    target = POS_MAP.get(group.get("pos", ""), group.get("pos", ""))
    scores = [
        overlap(gloss, bigrams(s.get("zh", "")))
        for s in entry.get("senses", [])
        if POS_MAP.get(s.get("pos", ""), s.get("pos", "")) == target
    ]
    return max(scores) if scores else 0.0


def clean_token(token: str) -> str:
    token = plain(token)
    token = re.sub(r"\((?:sb|sth)[^)]*\)", "", token, flags=re.I)
    token = re.sub(r"\b(?:sb|sth)\b", "", token, flags=re.I)
    return re.sub(r"\s+", " ", token).strip(" ,;.")


def canonical(entries: list[dict]) -> dict[str, str]:
    """Atlas headword spelling per lowercase form (the card links by exact label)."""
    out: dict[str, str] = {}
    for entry in entries:
        out.setdefault(entry["w"].lower(), entry["w"])
    return out


def new_synonyms(
    entry: dict,
    data: dict,
    canon: dict[str, str],
    min_relevance: float = MIN_RELEVANCE,
) -> list[str]:
    """Same-part-of-speech synonyms from the dictionary that the card does not have.

    A group is used only when its Chinese gloss overlaps the card's gloss of the
    same part of speech by at least ``min_relevance``: this keeps the sense the
    card actually defines and drops the headword's other senses. Groups are then
    ordered closest sense first, with no per-card cap. Every word is filtered to
    a headword that exists in the atlas, so the lookup buttons always resolve.
    """
    word = entry["w"].lower()
    eids = data["words"].get(word, [])
    if not eids:
        return []
    groups = data["groups"]
    allowed = positions(entry)
    ranked = sorted(
        (
            eid
            for eid in eids
            if groups[eid].get("pos") in allowed
            and relevance(entry, groups[eid]) >= min_relevance
        ),
        key=lambda eid: (-relevance(entry, groups[eid]), eid),
    )
    seen = {word}
    seen.update(s.lower() for s in entry.get("syn", []))
    out: list[str] = []
    for eid in ranked:
        for token in groups[eid]["syns"]:
            token = clean_token(token)
            key = token.lower()
            if not token or key in seen:
                continue
            display = canon.get(key)
            if not display:
                continue
            seen.add(key)
            out.append(display)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="parse 同义词学习词典 into thesaurus.json")
    ap.add_argument("--mdx", type=Path, default=MDX)
    ap.add_argument("--out", type=Path, default=DUMP)
    a = ap.parse_args()
    groups, words = build(a.mdx, a.out)
    print(
        f"parsed {groups} groups · {words} words · {a.out.stat().st_size / 1024:.0f} KB"
    )


if __name__ == "__main__":
    main()
