import assert from "node:assert/strict";
import { test } from "node:test";
import { AMBIENCE } from "../lib/ambience";
import { sanitizeProgress, sanitizeSettings } from "./store";

const card = {
  due: 1,
  s: 2,
  d: 5,
  el: 0,
  sd: 1,
  ls: 0,
  reps: 1,
  lapses: 0,
  st: 2,
  seen: 1,
};

test("keeps valid progress and drops malformed records", () => {
  const p = sanitizeProgress(
    {
      version: 2,
      cards: { ok: card, bad: { ...card, d: 99 }, worse: "x" },
      bookmarks: ["ok", 3],
      days: {
        "2026-10-25": { n: 1, r: 2, c: 1, t: 30 },
        nope: { n: 1, r: 1, c: 1, t: 1 },
      },
      typing: [
        { at: 1, mode: "word", items: 10, wpm: 40, accuracy: 98 },
        { at: 1, mode: "hack", items: 1, wpm: 1, accuracy: 1 },
      ],
    },
    "word-atlas-open",
  );
  assert.deepEqual(Object.keys(p.cards), ["ok"]);
  assert.deepEqual(p.bookmarks, ["ok"]);
  assert.deepEqual(Object.keys(p.days), ["2026-10-25"]);
  assert.equal(p.typing.length, 1);
});

test("rejects other versions and unknown settings", () => {
  assert.deepEqual(
    sanitizeProgress({ version: 1, cards: { ok: card } }, "x").cards,
    {},
  );
  const s = sanitizeSettings({
    accent: "fr",
    dailyNew: 1e9,
    theme: "dark",
    retention: 0.5,
  });
  assert.equal(s.accent, "uk");
  assert.equal(s.dailyNew, 10);
  assert.equal(s.themeFamily, "ink");
  assert.equal(s.themeMode, "dark");
  assert.equal(s.retention, 0.9);
});

test("界面震动 survives a backup and defaults to on", () => {
  assert.equal(sanitizeSettings({}).haptic, true);
  assert.equal(sanitizeSettings({ haptic: false }).haptic, false);
  assert.equal(sanitizeSettings({ haptic: "yes" }).haptic, true);
});

test("隐藏练习 survives a backup and defaults to off", () => {
  assert.equal(sanitizeSettings({}).hidePractice, false);
  assert.equal(sanitizeSettings({ hidePractice: true }).hidePractice, true);
  assert.equal(sanitizeSettings({ hidePractice: "yes" }).hidePractice, false);
});

test("drops malformed quiz steps and clamps the index instead of crashing", () => {
  const p = sanitizeProgress(
    {
      version: 2,
      session: {
        id: "s1",
        started: 1,
        index: 9,
        graded: { soup: 2, bad: 99 },
        steps: [
          { id: "soup", kind: "listen", options: ["so", "soup"] },
          null,
          { id: "x", kind: "nope" },
          { id: "y", kind: "spell" },
        ],
        newIds: ["soup", 3],
        reviewIds: ["y"],
        pending: { correct: true, value: "soup" },
      },
    },
    "word-atlas-open",
  );
  assert.equal(p.session?.steps.length, 2);
  assert.equal(p.session?.index, 2);
  assert.deepEqual(Object.keys(p.session!.graded), ["soup"]);
  assert.deepEqual(p.session?.newIds, ["soup"]);
  assert.deepEqual(p.session?.pending, { correct: true, value: "soup" });
});

test("maps the five legacy themes and drops unknown ones", () => {
  assert.deepEqual(
    [
      sanitizeSettings({ theme: "aurora" }).themeFamily,
      sanitizeSettings({ theme: "aurora" }).nightSkin,
    ],
    ["night", "aurora"],
  );
  assert.deepEqual(
    [
      sanitizeSettings({ theme: "starlight" }).themeFamily,
      sanitizeSettings({ theme: "starlight" }).nightSkin,
    ],
    ["night", "starlight"],
  );
  assert.equal(sanitizeSettings({ theme: "light" }).themeMode, "light");
  assert.equal(sanitizeSettings({ theme: "system" }).themeMode, "system");
  const d = sanitizeSettings({});
  assert.equal(d.themeFamily, "ink");
  assert.equal(d.themeMode, "dark");
  assert.equal(sanitizeSettings({ theme: "sepia" }).themeFamily, "ink");
  assert.equal(sanitizeSettings({ theme: "sepia" }).m3Variant, "tonalSpot");
});

test("keeps the three English faces", () => {
  assert.equal(sanitizeSettings({ wordFont: "sans" }).wordFont, "sans");
  assert.equal(sanitizeSettings({ wordFont: "classic" }).wordFont, "classic");
  assert.equal(sanitizeSettings({ wordFont: "comic" }).wordFont, "serif");
  assert.equal(sanitizeSettings({}).wordFont, "serif");
});

test("accepts the new fields and rejects junk in each", () => {
  const s = sanitizeSettings({
    themeFamily: "m3e",
    themeMode: "system",
    nightSkin: "starlight",
    m3Variant: "expressive",
    m3Accent: "#5f88a8",
  });
  assert.equal(s.themeFamily, "m3e");
  assert.equal(s.themeMode, "system");
  assert.equal(s.nightSkin, "starlight");
  assert.equal(s.m3Variant, "expressive");
  assert.equal(s.m3Accent, "#5F88A8");

  assert.equal(sanitizeSettings({ themeFamily: "neon" }).themeFamily, "ink");
  assert.equal(sanitizeSettings({ themeMode: "dim" }).themeMode, "dark");
  assert.equal(sanitizeSettings({ nightSkin: "milky" }).nightSkin, "aurora");
  assert.equal(
    sanitizeSettings({ m3Variant: "pastel" }).m3Variant,
    "tonalSpot",
  );
  assert.equal(sanitizeSettings({ m3Accent: "red" }).m3Accent, "wallpaper");
  assert.equal(sanitizeSettings({ m3Accent: "#GGG" }).m3Accent, "wallpaper");
});

test("keeps every ambience track the app ships, and silence", () => {
  for (const { id } of AMBIENCE)
    assert.equal(sanitizeSettings({ ambience: id }).ambience, id);
  assert.equal(sanitizeSettings({ ambience: "off" }).ambience, "off");
  // A track removed from the list must fall back rather than play nothing.
  assert.equal(
    sanitizeSettings({ ambience: "thunderstorm" }).ambience,
    "stars",
  );
  assert.equal(sanitizeSettings({ ambience: 7 }).ambience, "stars");
});

test("follows a track that has been renamed instead of forgetting the choice", () => {
  // The upstream ids arrived with the real audio; an older build saved "crickets".
  assert.equal(
    sanitizeSettings({ ambience: "crickets" }).ambience,
    "crickets-night",
  );
});
