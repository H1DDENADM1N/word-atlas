import assert from "node:assert/strict";
import { test } from "node:test";
import { AMBIENCE } from "../lib/ambience";
import { sanitizeProgress, sanitizeSettings } from "./store";

const card = { due: 1, s: 2, d: 5, el: 0, sd: 1, ls: 0, reps: 1, lapses: 0, st: 2, seen: 1 };

test("keeps valid progress and drops malformed records", () => {
  const p = sanitizeProgress(
    {
      version: 2,
      cards: { ok: card, bad: { ...card, d: 99 }, worse: "x" },
      bookmarks: ["ok", 3],
      days: { "2026-10-25": { n: 1, r: 2, c: 1, t: 30 }, nope: { n: 1, r: 1, c: 1, t: 1 } },
      typing: [{ at: 1, mode: "word", items: 10, wpm: 40, accuracy: 98 }, { at: 1, mode: "hack", items: 1, wpm: 1, accuracy: 1 }],
    },
    "word-atlas-open",
  );
  assert.deepEqual(Object.keys(p.cards), ["ok"]);
  assert.deepEqual(p.bookmarks, ["ok"]);
  assert.deepEqual(Object.keys(p.days), ["2026-10-25"]);
  assert.equal(p.typing.length, 1);
});

test("rejects other versions and unknown settings", () => {
  assert.deepEqual(sanitizeProgress({ version: 1, cards: { ok: card } }, "x").cards, {});
  const s = sanitizeSettings({ accent: "fr", dailyNew: 1e9, theme: "dark", retention: 0.5 });
  assert.equal(s.accent, "uk");
  assert.equal(s.dailyNew, 10);
  assert.equal(s.theme, "dark");
  assert.equal(s.retention, 0.9);
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
        steps: [{ id: "soup", kind: "listen", options: ["so", "soup"] }, null, { id: "x", kind: "nope" }, { id: "y", kind: "spell" }],
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

test("accepts the night skies and the three English faces", () => {
  assert.equal(sanitizeSettings({ theme: "aurora" }).theme, "aurora");
  assert.equal(sanitizeSettings({ theme: "starlight" }).theme, "starlight");
  assert.equal(sanitizeSettings({ theme: "sepia" }).theme, "dark");
  assert.equal(sanitizeSettings({ wordFont: "sans" }).wordFont, "sans");
  assert.equal(sanitizeSettings({ wordFont: "classic" }).wordFont, "classic");
  assert.equal(sanitizeSettings({ wordFont: "comic" }).wordFont, "serif");
  assert.equal(sanitizeSettings({}).wordFont, "serif");
});

test("keeps every ambience track the app ships, and silence", () => {
  for (const { id } of AMBIENCE) assert.equal(sanitizeSettings({ ambience: id }).ambience, id);
  assert.equal(sanitizeSettings({ ambience: "off" }).ambience, "off");
  // A track removed from the list must fall back rather than play nothing.
  assert.equal(sanitizeSettings({ ambience: "thunderstorm" }).ambience, "stars");
  assert.equal(sanitizeSettings({ ambience: 7 }).ambience, "stars");
});

test("follows a track that has been renamed instead of forgetting the choice", () => {
  // The upstream ids arrived with the real audio; an older build saved "crickets".
  assert.equal(sanitizeSettings({ ambience: "crickets" }).ambience, "crickets-night");
});
