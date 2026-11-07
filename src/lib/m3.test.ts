import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Hct,
  MaterialDynamicColors,
  SchemeTonalSpot,
} from "@material/material-color-utilities";
import { buildPalette, M3_VARS, normalizeSeed } from "./m3";
import { PALETTES, VARIANTS } from "./theme-model";

test("is deterministic and covers every variable", () => {
  const a = buildPalette("#C4573A", true, "tonalSpot");
  const b = buildPalette("#C4573A", true, "tonalSpot");
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a).sort(), [...M3_VARS].sort());
  for (const v of M3_VARS) assert.match(a[v], /^(#[0-9a-f]{6,8}|rgba?\()/i, v);
});

test("every variant and mode yields a full palette", () => {
  for (const variant of VARIANTS) {
    for (const isDark of [false, true]) {
      const p = buildPalette("#5F88A8", isDark, variant);
      assert.equal(
        Object.keys(p).length,
        M3_VARS.length,
        `${variant}/${isDark}`,
      );
      for (const v of M3_VARS) assert.ok(p[v], `${variant}/${isDark} ${v}`);
    }
  }
});

test("keeps body text readable in both modes", () => {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1, 7), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  for (const isDark of [false, true]) {
    const p = buildPalette("#C4573A", isDark, "tonalSpot");
    const [hi, lo] = [lum(p["--paper"]), lum(p["--ink"])].sort((x, y) => y - x);
    assert.ok((hi + 0.05) / (lo + 0.05) >= 4.5, `contrast ${isDark}`);
  }
});

test("a different seed moves the accent", () => {
  const a = buildPalette(PALETTES[0].hex, false, "tonalSpot");
  const b = buildPalette(PALETTES[3].hex, false, "tonalSpot");
  assert.notEqual(a["--terra"], b["--terra"]);
});

test("derives --sky about 150 degrees away from the accent", () => {
  const p = buildPalette("#C4573A", false, "tonalSpot");
  const hex = (s: string) => parseInt(s.slice(1, 7), 16);
  const d = Math.abs(
    Hct.fromInt(hex(p["--terra"])).hue - Hct.fromInt(hex(p["--sky"])).hue,
  );
  const delta = Math.min(d, 360 - d);
  assert.ok(Math.abs(delta - 150) <= 6, `delta ${delta}`);
});

test("paints with the 2025 spec rather than the library's 2021 default", () => {
  const hex = (argb: number) =>
    `#${(argb & 0xffffff).toString(16).padStart(6, "0").toUpperCase()}`;
  const older = new SchemeTonalSpot(Hct.fromInt(0xffc4573a), false, 0, "2021");
  const ours = buildPalette("#C4573A", false, "tonalSpot");
  // The two specs disagree on the container tones for this seed, so matching
  // the old one would mean we silently fell back to the library's default.
  assert.notEqual(
    ours["--paper-3"],
    hex(MaterialDynamicColors.surfaceContainer.getArgb(older)),
  );
  assert.equal(
    ours["--paper-3"],
    hex(
      MaterialDynamicColors.surfaceContainer.getArgb(
        new SchemeTonalSpot(Hct.fromInt(0xffc4573a), false, 0, "2025"),
      ),
    ),
  );
});

test("keeps right, wrong and seen apart on every seed", () => {
  const of = (hex: string) => Hct.fromInt(parseInt(hex.slice(1, 7), 16) | 0xff000000);
  const gap = (a: Hct, b: Hct) => {
    const d = Math.abs(a.hue - b.hue) % 360;
    return Math.min(d, 360 - d);
  };
  for (const seed of ["#C4573A", "#5B8C5A", "#2F6B9F"]) {
    for (const isDark of [false, true]) {
      for (const variant of ["tonalSpot", "vibrant"] as const) {
        const p = buildPalette(seed, isDark, variant);
        const right = of(p["--sage"]);
        const wrong = of(p["--bad"]);
        const seen = of(p["--ochre"]);
        const where = `${seed}/${isDark}/${variant}`;
        // The quiz verdicts are the pair that has to be unmistakable: the
        // scheme's secondary and primary shared a hue, one degree apart.
        assert.ok(gap(right, wrong) >= 60, `right/wrong ${gap(right, wrong)} ${where}`);
        // Two kinds of "progress" on the atlas may sit closer, but not so
        // close that the legend reads as one colour.
        assert.ok(gap(right, seen) >= 25, `right/seen ${gap(right, seen)} ${where}`);
        for (const [name, c] of [["right", right], ["seen", seen]] as const) {
          assert.ok(c.chroma >= 24, `${name} chroma ${c.chroma.toFixed(0)} ${where}`);
        }
        assert.notEqual(p["--bad"], p["--terra"]);
      }
    }
  }
});

test("rejects malformed seeds instead of throwing", () => {
  assert.equal(normalizeSeed("#c4573a"), "#C4573A");
  assert.equal(normalizeSeed("#GGGGGG"), "");
  assert.equal(normalizeSeed("red"), "");
  assert.equal(normalizeSeed("#12345"), "");
  assert.equal(normalizeSeed(42), "");
  assert.equal(normalizeSeed(undefined), "");
  // A bad seed must still produce a usable palette via the fallback.
  assert.ok(buildPalette(normalizeSeed("nope"), true, "expressive")["--ink"]);
});
