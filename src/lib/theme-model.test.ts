import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fromLegacyTheme,
  legacyTheme,
  PALETTES,
  VARIANTS,
} from "./theme-model";

test("maps every legacy theme value onto family + mode", () => {
  assert.deepEqual(fromLegacyTheme("system"), {
    themeFamily: "ink",
    themeMode: "system",
    nightSkin: "aurora",
  });
  assert.deepEqual(fromLegacyTheme("light"), {
    themeFamily: "ink",
    themeMode: "light",
    nightSkin: "aurora",
  });
  assert.deepEqual(fromLegacyTheme("dark"), {
    themeFamily: "ink",
    themeMode: "dark",
    nightSkin: "aurora",
  });
  assert.deepEqual(fromLegacyTheme("aurora"), {
    themeFamily: "night",
    themeMode: "dark",
    nightSkin: "aurora",
  });
  assert.deepEqual(fromLegacyTheme("starlight"), {
    themeFamily: "night",
    themeMode: "dark",
    nightSkin: "starlight",
  });
  assert.equal(fromLegacyTheme("sepia"), null);
  assert.equal(fromLegacyTheme(undefined), null);
});

test("folds the new model back into the five legacy values", () => {
  assert.equal(
    legacyTheme({
      themeFamily: "ink",
      themeMode: "system",
      nightSkin: "aurora",
    }),
    "system",
  );
  assert.equal(
    legacyTheme({ themeFamily: "ink", themeMode: "dark", nightSkin: "aurora" }),
    "dark",
  );
  assert.equal(
    legacyTheme({
      themeFamily: "night",
      themeMode: "dark",
      nightSkin: "aurora",
    }),
    "aurora",
  );
  assert.equal(
    legacyTheme({
      themeFamily: "night",
      themeMode: "dark",
      nightSkin: "starlight",
    }),
    "starlight",
  );
  // Material Expressive has no legacy word: it degrades to the plain mode word.
  assert.equal(
    legacyTheme({
      themeFamily: "m3e",
      themeMode: "light",
      nightSkin: "aurora",
    }),
    "light",
  );
  assert.equal(
    legacyTheme({
      themeFamily: "m3e",
      themeMode: "system",
      nightSkin: "aurora",
    }),
    "system",
  );
});

test("ships nine variants and eight curated palettes", () => {
  assert.equal(VARIANTS.length, 9);
  assert.equal(new Set(VARIANTS).size, 9);
  assert.equal(PALETTES.length, 8);
  for (const p of PALETTES) assert.match(p.hex, /^#[0-9A-F]{6}$/i);
  assert.equal(PALETTES[0].hex.toUpperCase(), "#C4573A");
});
