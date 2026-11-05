import assert from "node:assert/strict";
import { test } from "node:test";
import type { Atlas, WordRef } from "../atlas/types";
import { RECENT_CAP, RECENT_KEY, clearRecent, dailyPicks, pushRecent, readRecent, resolveRecent, type StorageLike } from "./recent";

function mem() {
  const data = new Map<string, string>();
  let fail = false;
  const storage: StorageLike = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (fail) throw new Error("quota exceeded");
      data.set(k, v);
    },
    removeItem: (k) => {
      if (fail) throw new Error("quota exceeded");
      data.delete(k);
    },
  };
  return { storage, data, setFail: (v: boolean) => (fail = v) };
}

const ref = (id: string): WordRef => ({
  id,
  word: id,
  zh: `释义 ${id}`,
  ipa: "",
  cefr: 1,
  topic: 0,
  media: 0,
  order: 0,
});

function fakeAtlas(ids: string[]): Atlas {
  const words = ids.map(ref);
  return { words, byId: new Map(words.map((w) => [w.id, w])) } as unknown as Atlas;
}

test("empty and malformed storage both read as no history", () => {
  const m = mem();
  assert.deepEqual(readRecent(m.storage), []);
  m.data.set(RECENT_KEY, "{not json");
  assert.deepEqual(readRecent(m.storage), []);
  m.data.set(RECENT_KEY, '{"a":1}');
  assert.deepEqual(readRecent(m.storage), []);
});

test("non-string entries are dropped and the read is capped", () => {
  const m = mem();
  const ids = Array.from({ length: RECENT_CAP + 5 }, (_, i) => `w${i}`);
  m.data.set(RECENT_KEY, JSON.stringify([null, 42, ids[0], ...ids.slice(1), { id: "x" }]));
  assert.equal(readRecent(m.storage).length, RECENT_CAP);
  assert.equal(readRecent(m.storage)[0], "w0");
});

test("a lookup moves to the front and never duplicates", () => {
  const m = mem();
  pushRecent("a", m.storage);
  pushRecent("b", m.storage);
  pushRecent("c", m.storage);
  assert.deepEqual(readRecent(m.storage), ["c", "b", "a"]);
  assert.deepEqual(pushRecent("a", m.storage), ["a", "c", "b"]);
  assert.deepEqual(readRecent(m.storage), ["a", "c", "b"]);
});

test(`the 21st lookup evicts the oldest; cap stays at ${RECENT_CAP}`, () => {
  const m = mem();
  for (let i = 0; i < RECENT_CAP + 1; i++) pushRecent(`w${i}`, m.storage);
  const ids = readRecent(m.storage);
  assert.equal(ids.length, RECENT_CAP);
  assert.equal(ids[0], `w${RECENT_CAP}`);
  assert.equal(ids[ids.length - 1], "w1");
  assert.ok(!ids.includes("w0"));
});

test("the stored value is a bare string array with no timestamps or metadata", () => {
  const m = mem();
  pushRecent("wind", m.storage);
  pushRecent("breeze", m.storage);
  const raw: unknown = JSON.parse(m.data.get(RECENT_KEY) || "[]");
  assert.ok(Array.isArray(raw));
  assert.deepEqual(raw, ["breeze", "wind"]);
  for (const item of raw as unknown[]) assert.equal(typeof item, "string");
  assert.ok(!/time|date|ts|count/i.test(m.data.get(RECENT_KEY) || ""));
});

test("clear removes the key entirely", () => {
  const m = mem();
  pushRecent("wind", m.storage);
  clearRecent(m.storage);
  assert.equal(m.data.has(RECENT_KEY), false);
  assert.deepEqual(readRecent(m.storage), []);
});

test("a read-only storage without removeItem still clears", () => {
  const m = mem();
  const legacy: StorageLike = { getItem: m.storage.getItem, setItem: m.storage.setItem };
  pushRecent("wind", legacy);
  clearRecent(legacy);
  assert.deepEqual(readRecent(legacy), []);
});

test("write failures never break a lookup or clear, and keep the old value", () => {
  const m = mem();
  pushRecent("wind", m.storage);
  m.setFail(true);
  assert.doesNotThrow(() => pushRecent("breeze", m.storage));
  assert.doesNotThrow(() => clearRecent(m.storage));
  assert.deepEqual(readRecent(m.storage), ["wind"]);
});

test("stale IDs disappear from the view without rewriting storage", () => {
  const m = mem();
  pushRecent("wind", m.storage);
  pushRecent("gone", m.storage);
  pushRecent("breeze", m.storage);
  const atlas = fakeAtlas(["wind", "breeze"]);
  assert.deepEqual(resolveRecent(atlas, m.storage).map((w) => w.id), ["breeze", "wind"]);
  assert.deepEqual(readRecent(m.storage), ["breeze", "gone", "wind"]);
});

test("daily picks are stable within a day, rotate across days, and never repeat", () => {
  const atlas = fakeAtlas(Array.from({ length: 40 }, (_, i) => `w${i}`));
  const a = dailyPicks(atlas, 6, 20000);
  assert.equal(a.length, 6);
  assert.equal(new Set(a.map((w) => w.id)).size, 6);
  assert.deepEqual(a, dailyPicks(atlas, 6, 20000));
  assert.notDeepEqual(a, dailyPicks(atlas, 6, 20001));
});
