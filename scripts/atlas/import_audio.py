"""Replace the atlas' UK/US word recordings with the ones from OALDPEX.

OALDPEX is an MDict pair: `oaldpex.mdx` holds the entries, `oaldpex.1-3.mdd` the
6.8 GB of audio and pictures. Every headword carries two sound buttons —

    <h1 class="headword" headword="abandon">abandon</h1>
    <span class="phonetics">
      <div class="phons_br"><a class="sound pron-uk" href="sound://abandon__gb_2.mp3"></a>…
      <div class="phons_n_am"><a class="sound pron-us" href="sound://abandon__us_2.mp3"></a>…

— and those names are keys in the resource container. So the job is two
lookups: headword → file names in the `.mdx`, file names → bytes in the `.mdd`.

Both containers are MDict 2.0, but written by a tool ("MDTT") that pads every
compressed section with an 8-byte header the usual readers do not expect: a
4-byte version marker (`02 00 00 00`) followed by the section's adler32. The
parser below is therefore written against the bytes rather than against a
library: locate each section's zlib stream, let `decompressobj` tell us where it
ended, and walk forward. Two further quirks matter:

  * `.mdx` keys are UTF-8 (its header says `Encoding="UTF-8"`); `.mdd` paths are
    UTF-16. Both are NUL-terminated, with the terminator one or two bytes wide.
  * Records carry no length prefix. A record ends where the next one starts, so
    the key offsets double as a size table — including records that straddle a
    block boundary.

The atlas stores one file per entry per accent. The public/share build reads
upstream's originals from `public/atlas/audio/{uk,us}`; this script writes a
separate private set to `private/audio/oaldpex/{uk,us}` so importing OALDPEX
never overwrites the shareable recordings.

Rights: OALDPEX is a commercial dictionary. The recordings it carries are
Oxford University Press's, not this project's — unlike the files the repo ships
(ElevenLabs voices, CC BY 4.0). Run this only for a private build; do not
publish an APK or a commit that contains what it writes.

Usage:
    python3 scripts/atlas/import_audio.py --report      # coverage only, no writes
    python3 scripts/atlas/import_audio.py               # write private/audio/oaldpex
    python3 scripts/atlas/import_audio.py --only abandon,abide --report
    python3 scripts/atlas/import_audio.py --heteronyms  # the 14 two-reading words

`--heteronyms` is the one place a headword needs two recordings. `pron.json`
says which OALDPEX file belongs to which reading, so this mode copies by name
instead of by "first match": `uk/<id>.mp3` gets reading 1, `uk2/<id>.mp3` gets
reading 2. It also rewrites reading 1 for those words, because the first match
is not always the reading the atlas teaches first — `bow` is filed noun-second.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import struct
import zlib
from bisect import bisect_right
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "public" / "atlas"
OUT = ROOT / "private" / "audio" / "oaldpex"
PRON = Path(__file__).resolve().parent / "pron.json"

ZLIB_MAGIC = (b"\x78\x01", b"\x78\x9c", b"\x78\xda")
CHUNK = 1 << 16

# The sound button is not always the first child: "your" puts a
# `<span class="prefix">strong form</span>` in front of it, so allow a short run
# of markup between the accent container and the link.
UK = re.compile(r'class="phons_br".{0,400}?sound://([^"]+)', re.S)
US = re.compile(r'class="phons_n_am".{0,400}?sound://([^"]+)', re.S)
LINK = re.compile(rb"@@@LINK=([^\r\n\x00]+)")
WORD = re.compile(r"^[A-Za-z][A-Za-z'\u2019\-]*$")


def zread(f, offset: int) -> tuple[bytes, int]:
    """Decompress the zlib stream at `offset`; return (bytes, end offset)."""
    f.seek(offset)
    d = zlib.decompressobj()
    out = bytearray()
    read = 0
    while True:
        buf = f.read(CHUNK)
        if not buf:
            return bytes(out), offset + read
        read += len(buf)
        out += d.decompress(buf)
        if d.eof:
            return bytes(out), offset + read - len(d.unused_data)


def find_zlib(f, start: int, limit: int = 32) -> int:
    """The next zlib stream within `limit` bytes of `start`."""
    f.seek(start)
    window = f.read(limit + 2)
    for i in range(len(window) - 1):
        if window[i : i + 2] in ZLIB_MAGIC:
            return start + i
    raise ValueError(f"no zlib stream within {limit} bytes of {start}")


class Container:
    """An MDict file: keys → record offsets, blocks → record bytes."""

    def __init__(self, path: Path):
        self.path = path
        self.f = path.open("rb")
        size = struct.unpack(">I", self.f.read(4))[0]
        self.header = self.f.read(size).decode("utf-16-le", "replace")
        self.encoding = "utf-8" if 'Encoding="UTF-8"' in self.header else "utf-16-le"
        self.nul = b"\x00" if self.encoding == "utf-8" else b"\x00\x00"
        self.f.read(4)  # adler32 of the header

        base = 4 + size + 4
        self.f.seek(base)
        num_key_blocks, self.num_entries, _, _, _ = struct.unpack(">5Q", self.f.read(40))

        # Key block info, then one zlib block per key block, back to back.
        end = self._skip_zlib(base + 40)
        self.keys: dict[str, int] = {}
        for _ in range(num_key_blocks):
            at = find_zlib(self.f, end)
            block, end = zread(self.f, at)
            i = 0
            while i + 8 <= len(block):
                rec = struct.unpack(">Q", block[i : i + 8])[0]
                j = i + 8
                while j + len(self.nul) <= len(block) and block[j : j + len(self.nul)] != self.nul:
                    j += len(self.nul)
                if j + len(self.nul) > len(block):
                    break  # a block that ends without a terminator: stop here
                self.keys[block[i + 8 : j].decode(self.encoding, "replace")] = rec
                i = j + len(self.nul)

        # Record section: header, then (compressed, decompressed) per block,
        # then the blocks themselves, each behind the same 8-byte padding.
        self.f.seek(end)
        records_at = end
        num_blocks, entries, info_size, _ = struct.unpack(">4Q", self.f.read(32))
        pairs = [struct.unpack(">2Q", self.f.read(16)) for _ in range(num_blocks)]
        at = records_at + 32 + info_size
        self.blocks: list[tuple[int, int]] = []  # (file offset, stream offset)
        stream = 0
        for comp, decomp in pairs:
            self.blocks.append((at + 8, stream))
            stream += decomp
            at += comp
        self.starts = [b[1] for b in self.blocks]
        self.stream_size = stream
        self.offsets = sorted(set(self.keys.values()))
        self._cache: tuple[int, bytes] | None = None

    def _skip_zlib(self, start: int) -> int:
        at = find_zlib(self.f, start)
        _, end = zread(self.f, at)
        return end

    def _block(self, i: int) -> bytes:
        if self._cache and self._cache[0] == i:
            return self._cache[1]
        data, _ = zread(self.f, self.blocks[i][0])
        self._cache = (i, data)
        return data

    def read(self, key: str) -> bytes | None:
        start = self.keys.get(key)
        if start is None:
            return None
        i = bisect_right(self.offsets, start)
        end = self.offsets[i] if i < len(self.offsets) else self.stream_size
        first = max(0, bisect_right(self.starts, start) - 1)
        last = max(0, bisect_right(self.starts, end - 1) - 1)
        out = bytearray()
        for b in range(first, last + 1):
            block = self._block(b)
            lo = start - self.starts[b] if b == first else 0
            hi = end - self.starts[b] if b == last else len(block)
            out += block[lo:hi]
        return bytes(out)

    def close(self) -> None:
        self.f.close()


def entry(c: Container, key: str) -> str | None:
    """The entry's HTML, following `@@@LINK=` cross-references."""
    body = c.read(key)
    for _ in range(3):
        if body is None:
            return None
        m = LINK.match(body.lstrip())
        if not m:
            return body.decode("utf-8", "replace")
        body = c.read(m.group(1).decode("utf-8", "replace").strip())
    return None


def mdx_sounds(path: Path, wanted: set[str] | None = None) -> dict[str, tuple[str, str]]:
    """headword → (UK file name, US file name) for every entry that has both."""
    out: dict[str, tuple[str, str]] = {}
    c = Container(path)
    # Walk keys in record order so each block is decompressed once.
    for key in sorted(c.keys, key=lambda k: c.keys[k]):
        word = html.unescape(key).strip().lower()
        if not WORD.match(word) or word in out:
            continue
        if wanted is not None and word not in wanted:
            continue
        text = entry(c, key)
        if not text:
            continue
        uk = UK.search(text)
        us = US.search(text)
        if uk and us:
            out[word] = (html.unescape(uk.group(1)), html.unescape(us.group(1)))
    c.close()
    return out


def letters(text: str) -> str:
    return re.sub(r"[^a-z]", "", text.lower())


def import_heteronyms(d: Path, out: Path, report: bool) -> None:
    """Copy both readings of the words in pron.json, by the names it lists.

    Reading 1 goes to `uk/<id>.mp3` / `us/<id>.mp3` — overwriting whatever the
    first-match import put there, which for `bow` is the other reading. Reading
    2 goes to `uk2/` and `us2/`, the folders the app looks in for `pron[1]`.
    """
    table = json.loads(PRON.read_text(encoding="utf-8"))["words"]
    parts = [Container(d / n) for n in ("oaldpex.mdd", "oaldpex.1.mdd", "oaldpex.2.mdd", "oaldpex.3.mdd")]
    where: dict[str, int] = {}
    for i, part in enumerate(parts):
        for key in part.keys:
            where.setdefault(key.rsplit("\\", 1)[-1], i)

    jobs: dict[int, list[tuple[str, str, str]]] = {}
    missing: list[str] = []
    for word, spec in table.items():
        for group, pron in enumerate(spec["pron"]):
            for accent in ("uk", "us"):
                name = pron["src"][accent]
                i = where.get(name)
                if i is None:
                    missing.append(f"{word} 读音{group + 1} {accent}: {name}")
                    continue
                folder = accent if group == 0 else f"{accent}2"
                jobs.setdefault(i, []).append((folder, name, word))

    pairs = sum(len(v) for v in jobs.values())
    print(f"{len(table)} words · {pairs} recordings found, {len(missing)} missing")
    for line in missing:
        print(f"  MISSING {line}")
    if report:
        for part in parts:
            part.close()
        return

    written = 0
    total = 0
    for i, batch in sorted(jobs.items()):
        part = parts[i]
        batch.sort(key=lambda j: part.keys.get("\\" + j[1], 0))
        for folder, name, word in batch:
            data = part.read("\\" + name)
            if not data:
                print(f"  EMPTY {word} {name}")
                continue
            (out / folder).mkdir(parents=True, exist_ok=True)
            (out / folder / f"{word}.mp3").write_bytes(data)
            written += 1
            total += len(data)
    for part in parts:
        part.close()
    print(f"wrote {written} files, {total / 1024 / 1024:.1f} MB -> {out}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dict", default=str(ROOT / "OALDPEX"))
    ap.add_argument("--out", default=str(OUT), help="destination root for uk/ and us/")
    ap.add_argument("--report", action="store_true", help="report coverage, write nothing")
    ap.add_argument("--only", default="", help="comma-separated atlas ids, for a quick look")
    ap.add_argument("--heteronyms", action="store_true", help="copy both readings of the 14 words in pron.json")
    a = ap.parse_args()

    d = Path(a.dict)
    if a.heteronyms:
        import_heteronyms(d, Path(a.out), a.report)
        return
    index = json.loads((PUB / "index.json").read_text(encoding="utf-8"))
    id_at = index["fields"].index("id")
    word_at = index["fields"].index("word")
    entries = index["words"]
    if a.only:
        keep = {x.strip() for x in a.only.split(",") if x.strip()}
        entries = [r for r in entries if r[id_at] in keep]

    wanted = {r[word_at].lower() for r in entries}
    wanted |= {letters(w) for w in list(wanted)}
    print("reading oaldpex.mdx …")
    sounds = mdx_sounds(d / "oaldpex.mdx", wanted)
    print(f"{len(sounds)} headwords with both accents")

    # Match each atlas entry to a dictionary headword.
    by_letters: dict[str, tuple[str, str]] = {}
    for k, v in sounds.items():
        by_letters.setdefault(letters(k), v)
    want: dict[str, tuple[str, str]] = {}
    exact = loose = 0
    for row in entries:
        eid, word = row[id_at], row[word_at]
        hit = sounds.get(word.lower())
        if hit:
            want[eid] = hit
            exact += 1
            continue
        alt = by_letters.get(letters(word))
        if alt:
            want[eid] = alt
            loose += 1
    total = len(index["words"])
    print(f"matched {len(want)}/{total} entries ({len(want) / total * 100:.1f}%) · {exact} exact + {loose} re-spelled")

    # Which container holds each file name?
    parts = [Container(d / n) for n in ("oaldpex.mdd", "oaldpex.1.mdd", "oaldpex.2.mdd", "oaldpex.3.mdd")]
    where: dict[str, int] = {}
    for i, part in enumerate(parts):
        for key in part.keys:
            where.setdefault(key.rsplit("\\", 1)[-1], i)

    todo: dict[int, list[tuple[str, str, str]]] = {}
    missing = 0
    for eid, (uk, us) in want.items():
        for kind, name in (("uk", uk), ("us", us)):
            i = where.get(name)
            if i is None:
                missing += 1
                continue
            todo.setdefault(i, []).append((kind, name, eid))
    print(f"container lookups: {sum(len(v) for v in todo.values())} hits, {missing} misses")
    if a.report:
        for part in parts:
            part.close()
        return

    written = 0
    written_bytes = 0
    out = Path(a.out)
    for i, jobs in sorted(todo.items()):
        part = parts[i]
        # In record order, so each block is decompressed once.
        jobs.sort(key=lambda j: part.keys.get("\\" + j[1], 0))
        for kind, name, eid in jobs:
            data = part.read("\\" + name)
            if not data:
                continue
            (out / kind).mkdir(parents=True, exist_ok=True)
            (out / kind / f"{eid}.mp3").write_bytes(data)
            written += 1
            written_bytes += len(data)
    for part in parts:
        part.close()
    print(f"wrote {written} files, {written_bytes / 1024 / 1024:.1f} MB -> {out}")


if __name__ == "__main__":
    main()
