import assert from "node:assert/strict";
import { test } from "node:test";
import type { Atlas, Entry, WordRef } from "../atlas/types";
import type { CardState } from "../store/srs";
import type { Progress, Settings } from "../store/store";
import { hashSeed } from "./text";
import {
  WIDGET_SLOT_MS,
  breakWord,
  buildSnapshot,
  pickWordOfDay,
  planOf,
  sentenceFromEntry,
  toughCards,
  toughScore,
} from "./widget-data";

const DATE = "2026-11-04";

const card = (patch: Partial<CardState> = {}): CardState => ({
  due: 0, s: 1, d: 5, el: 0, sd: 0, ls: 0, reps: 1, lapses: 0, st: 1, seen: 0, ...patch,
});
const ref = (id: string, cefr = 2): WordRef => ({
  id, word: id, zh: `释义 ${id}`, ipa: "", cefr, topic: 0, media: 1, order: 0,
});
const atlasWith = (words: WordRef[]): Atlas => ({
  words,
  byId: new Map(words.map((w) => [w.id, w])),
  topics: [["nature", "自然"]],
}) as unknown as Atlas;
const progressWith = (cards: Record<string, CardState>, mistakes: string[] = []): Progress =>
  ({ cards, mistakes, days: {} }) as unknown as Progress;
const settings = { dailyNew: 3, startLevel: 0 } as unknown as Settings;

test("hashSeed is FNV-1a 32-bit, matching WidgetData.fnv() in Java", () => {
  assert.equal(hashSeed("2026-11-04"), 1847467203);
  assert.equal(hashSeed("library"), 2432105424);
  assert.equal(hashSeed("abc"), 440920331);
});

test("toughScore weighs lapses and difficulty and excludes mastered cards", () => {
  const p = progressWith({
    easy: card({ lapses: 0, d: 5, s: 1 }),
    hard: card({ lapses: 3, d: 8, s: 1 }),
    mastered: card({ lapses: 9, st: 2, s: 21 }),
  }, ["easy"]);
  assert.ok(toughScore("hard", p) > toughScore("easy", p));
  assert.equal(toughScore("mastered", p), -Infinity);
  assert.equal(toughScore("unknown", p), -Infinity);
  // A recent mistake adds a small recency bonus.
  const bumped = progressWith({ easy: card() }, ["easy"]);
  assert.ok(toughScore("easy", bumped) > toughScore("easy", progressWith({ easy: card() })));
});

test("toughCards keeps the whole stubborn pool and rotates the daily window", () => {
  const words = Array.from({ length: 20 }, (_, i) => ref(`w${i}`));
  const cards: Record<string, CardState> = {};
  words.forEach((w, i) => { cards[w.id] = card({ lapses: i % 4 }); });
  cards.w0 = card({ st: 2, s: 21 });
  const atlas = atlasWith(words);
  const p = progressWith(cards, words.map((w) => w.id));

  const a = toughCards(atlas, p, DATE);
  const b = toughCards(atlas, p, DATE);
  assert.deepEqual(a, b);
  // 19 non-mastered words: the pool is no longer cut down to a dozen.
  assert.equal(a.length, 19);
  assert.ok(!a.some((c) => c.id === "w0"));
  assert.equal(new Set(a.map((c) => c.id)).size, a.length);
  const nextDay = toughCards(atlas, p, "2026-11-05");
  assert.notDeepEqual(nextDay.map((c) => c.id), a.map((c) => c.id), "window slides by 12 each day");
  assert.deepEqual(new Set(nextDay.map((c) => c.id)), new Set(a.map((c) => c.id)), "same pool");
  assert.ok(a.every((c) => c.topic === "nature"));
});

test("a mistake without a review card still enters the tough pool", () => {
  const atlas = atlasWith([ref("a"), ref("b")]);
  // `a` qualifies through its FSRS lapses, `b` only through the mistake list.
  const p = progressWith({ a: card({ lapses: 1 }) }, ["b"]);
  const ids = toughCards(atlas, p, DATE).map((c) => c.id).sort();
  assert.deepEqual(ids, ["a", "b"]);
});

test("a word never answered wrong stays out of the tough pool", () => {
  const atlas = atlasWith([ref("clean"), ref("wrong")]);
  const p = progressWith({ clean: card(), wrong: card({ lapses: 2 }) }, ["wrong"]);
  assert.deepEqual(toughCards(atlas, p, DATE).map((c) => c.id), ["wrong"]);
});

test("pickWordOfDay matches the in-app 今日一词 rule", () => {
  const words = [ref("low", 1), ref("a"), ref("b"), ref("c")];
  words[1].media = 0; // no illustration, excluded from the pool
  const atlas = atlasWith(words);
  const pick = pickWordOfDay(atlas, DATE)!;
  const pool = words.filter((w) => w.cefr >= 2 && (w.media & 1) !== 0);
  assert.equal(pick.id, pool[hashSeed(DATE) % pool.length].id);
});

test("sentenceFromEntry uses the IELTS example (ex[1]), not the everyday one", () => {
  const atlas = atlasWith([ref("bush")]);
  const entry = {
    ex: [
      { en: "everyday example", zh: "日常" },
      { en: "Planting native bushes in urban gardens can provide shelter and food for local wildlife.", zh: "在城市花园中种植本地灌木，可以为当地野生动物提供庇护和食物。" },
    ],
  } as unknown as Entry;
  const s = sentenceFromEntry(ref("bush"), entry, atlas, DATE)!;
  assert.equal(s.id, "bush");
  assert.ok(s.en.startsWith("Planting"));
  assert.ok(s.zh.startsWith("在城市"));
  assert.equal(s.enLen, s.en.length);
  assert.equal(s.topic, "nature");
  assert.equal(s.date, DATE);
});

test("planOf reports due + fresh as the remaining steps", () => {
  const words = Array.from({ length: 8 }, (_, i) => ref(`w${i}`));
  const atlas = atlasWith(words);
  const p = progressWith({ w0: card(), w1: card() });
  const plan = planOf(atlas, p, settings);
  assert.equal(plan.due, 2);
  assert.equal(plan.fresh, 3);
  assert.equal(plan.remaining, 5);
  assert.ok(plan.minutes >= 1);
});

test("breakWord wraps long headwords at syllable boundaries", () => {
  assert.equal(breakWord("library", "li·brary"), "library"); // fits on one line
  assert.equal(breakWord("internationalisation", "in·ter·na·tion·al·i·sa·tion", 10).includes("\n"), true);
  const wrapped = breakWord("internationalisation", "in·ter·na·tion·al·i·sa·tion", 10);
  assert.ok(wrapped.replace(/\n/g, "") === "internationalisation");
  assert.ok(wrapped.split("\n").every((line) => line.length <= 10));
  // No dictionary entry: leave the word intact rather than inventing a split.
  assert.equal(breakWord("extraordinarily", null, 10), "extraordinarily");
});

test("toughCards carries a pre-wrapped spelling from the syllable dictionary", () => {
  const words = [ref("internationalisation"), ref("library")];
  const atlas = atlasWith(words);
  const p = progressWith({ internationalisation: card({ lapses: 2 }), library: card() }, ["internationalisation", "library"]);
  const dots = { internationalisation: "in·ter·na·tion·al·i·sa·tion" };
  const cards = toughCards(atlas, p, DATE, dots);
  const long = cards.find((c) => c.id === "internationalisation")!;
  assert.ok(long.wordBreak.includes("\n"));
  assert.equal(cards.find((c) => c.id === "library")!.wordBreak, "library");
});

test("planOf follows the Today page while a session is open", () => {
  const words = Array.from({ length: 8 }, (_, i) => ref(`w${i}`));
  const atlas = atlasWith(words);
  const p = progressWith({ w0: card(), w1: card() });
  const idle = planOf(atlas, p, settings);
  assert.equal(idle.remaining, 5);
  const withSession = {
    ...p,
    session: {
      id: "s", started: 0,
      steps: Array.from({ length: 7 }, (_, i) => ({ id: `w${i}`, kind: "meaning" })),
      index: 3, graded: {}, newIds: [], reviewIds: [],
    },
  } as unknown as Progress;
  const active = planOf(atlas, withSession, settings);
  assert.equal(active.remaining, 4, "session steps left, matching the Today page");
  assert.equal(active.due, idle.due);
  assert.equal(active.fresh, idle.fresh);
  assert.equal(active.minutes, idle.minutes);
});

test("buildSnapshot has the exact one-way payload shape", () => {
  const atlas = atlasWith([ref("w0"), ref("w1")]);
  const p = progressWith({ w0: card() });
  const snap = buildSnapshot({ atlas, progress: p, settings, sentence: null, date: DATE, theme: "dark" });
  assert.equal(snap.v, 1);
  assert.equal(snap.date, DATE);
  assert.equal(snap.tough.slotMs, WIDGET_SLOT_MS);
  assert.equal(snap.tough.seedDate, DATE);
  assert.ok(Array.isArray(snap.tough.cards));
  assert.equal("sentence" in snap, false);
  assert.equal(Object.keys(snap.plan).join(","), "remaining,due,fresh,minutes");
});
