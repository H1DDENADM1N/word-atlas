/**
 * Pure data derivation for the Android home-screen widgets.
 *
 * Kept free of DOM / bridge imports so it can be unit-tested in Node and so the
 * widget never has to touch the router. The actual publishing lives in
 * `widget.ts`; the Java side reads the JSON this module describes.
 */
import type { Atlas, Entry, WordRef } from "../atlas/types";
import { hashSeed } from "./text";
import { dayKey, type Progress, type Settings } from "../store/store";
import { isMastered } from "../store/srs";
import { todayPlan } from "../store/session";

export const WIDGET_SLOT_MS = 2 * 60 * 60 * 1000;
/** The progress strip is refreshed on every local hour boundary. */
export const WIDGET_HOUR_MS = 60 * 60 * 1000;
/** Current hour plus the next 24 boundaries: a full day of offline updates. */
export const WIDGET_HOURS = 25;

/**
 * One projection of the four progress figures for a single hour boundary.
 * The launcher cannot run FSRS, so the page computes these up front and the
 * native side only ever looks up the row matching the current time.
 */
export interface WidgetHour {
  /** Epoch ms of the (local) hour boundary this row belongs to. */
  at: number;
  remaining: number;
  due: number;
  fresh: number;
  minutes: number;
}

export interface WidgetCard {
  id: string;
  word: string;
  /** Pre-wrapped spelling: syllable breaks become newlines for long headwords. */
  wordBreak: string;
  zh: string;
  topic: string;
}

export interface WidgetSentence {
  id: string;
  en: string;
  zh: string;
  enLen: number;
  topic: string;
  date: string;
}

export interface WidgetSnapshot {
  v: 1;
  date: string;
  theme: "dark" | "light";
  tough: { cards: WidgetCard[]; seedDate: string; slotMs: number };
  sentence?: WidgetSentence;
  plan: { remaining: number; due: number; fresh: number; minutes: number };
  /** Hourly projections of `plan`, used when the app itself is not running. */
  hours: WidgetHour[];
}

export function topicOf(atlas: Atlas, ref: WordRef): string {
  return atlas.topics[ref.topic]?.[0] ?? "nature";
}

/**
 * Wrap a long headword at dictionary syllable boundaries instead of letting
 * TextView cut it mid-syllable. `dotted` is OALDPEX's "ex·hib·ition" form.
 * Words without a syllable entry are left intact (Android ellipsizes them).
 */
export function breakWord(word: string, dotted: string | null, maxChars = 10): string {
  if (word.length <= maxChars) return word;
  const parts = dotted?.split("·").map((s) => s.trim()).filter(Boolean);
  if (!parts || parts.length < 2) return word;
  const lines: string[] = [];
  let current = "";
  for (const part of parts) {
    if (!current) current = part;
    else if (current.length + part.length <= maxChars) current += part;
    else {
      lines.push(current);
      current = part;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3).join("\n");
}

/**
 * How stubborn a word is. `progress.mistakes` is only a rolling history of
 * wrong answers — a correct answer never removes an entry — so it cannot be
 * used on its own; FSRS memory state has to carry most of the weight.
 */
export function toughScore(id: string, p: Progress): number {
  const c = p.cards[id];
  if (c && isMastered(c)) return -Infinity;
  const idx = p.mistakes.indexOf(id);
  // A word can be in the mistake list without a card (practised outside the
  // review flow). Keep it, ranked by recency alone, so the widget pool matches
  // what the in-app 错词本 actually offers.
  if (!c && idx < 0) return -Infinity;
  const base = c ? 3 * c.lapses + 0.8 * (c.d - 5) + 0.3 * Math.max(0, 12 - c.s) : 1;
  const recency = idx < 0 ? 0 : 2 / (1 + idx / 10);
  return base + recency;
}

/** How many tough words the widget walks through in one day (one per 2h slot). */
export const TOUGH_PER_DAY = 12;

/** Hard bound on the snapshot payload; the mistake list itself caps at 300. */
export const TOUGH_POOL_MAX = 300;

/**
 * The whole stubborn pool, ordered by how stubborn a word is, rotated by date.
 *
 * The card shows one word per two-hour slot, i.e. twelve a day, so the window
 * slides by twelve positions each day and the entire pool cycles over roughly
 * `pool / 12` days. Capping the list at twelve (as the first version did) meant
 * the same dozen words for ever, no matter how many were in the 错词本.
 */
export function toughCards(atlas: Atlas, p: Progress, date = dayKey(), dots: Record<string, string> = {}): WidgetCard[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  const consider = (id: string) => {
    if (seen.has(id) || !atlas.byId.has(id) || !Number.isFinite(toughScore(id, p))) return;
    seen.add(id);
    ids.push(id);
  };
  p.mistakes.forEach(consider);
  // Words that were forgotten but have since rolled out of the 300-entry
  // mistake list still count; words never answered wrong are not "tough".
  for (const [id, c] of Object.entries(p.cards)) if (c.lapses > 0) consider(id);
  ids.sort((a, b) => toughScore(b, p) - toughScore(a, p) || a.localeCompare(b));
  const pool = ids.slice(0, TOUGH_POOL_MAX);
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const start = pool.length && Number.isFinite(day) ? (((day * TOUGH_PER_DAY) % pool.length) + pool.length) % pool.length : 0;
  const ordered = pool.slice(start).concat(pool.slice(0, start));
  return ordered.map((id) => {
    const ref = atlas.byId.get(id)!;
    return {
      id,
      word: ref.word,
      wordBreak: breakWord(ref.word, dots[id] ?? null),
      zh: ref.zh,
      topic: topicOf(atlas, ref),
    };
  });
}

/** Same deterministic pick as the in-app "今日一词" panel. */
export function pickWordOfDay(atlas: Atlas, date = dayKey()): WordRef | null {
  const pool = atlas.words.filter((w) => w.cefr >= 2 && (w.media & 1) !== 0);
  const list = pool.length ? pool : atlas.words;
  return list.length ? list[hashSeed(date) % list.length] : null;
}

/** `ex[0]` is the everyday example; `ex[1]` is the IELTS-context sentence. */
export function sentenceFromEntry(ref: WordRef, entry: Entry, atlas: Atlas, date: string): WidgetSentence | null {
  const example = entry.ex?.[1];
  if (!example?.en) return null;
  return {
    id: ref.id,
    en: example.en,
    zh: example.zh ?? "",
    enLen: example.en.length,
    topic: topicOf(atlas, ref),
    date,
  };
}

export function planOf(
  atlas: Atlas,
  p: Progress,
  s: Settings,
  now = Date.now(),
  date = dayKey(),
): WidgetSnapshot["plan"] {
  // Same numbers as the Today page: "复习 N · 新词 M · 约 N 分钟" comes from
  // todayPlan(), and while a session is open "还剩 N 步" is the session's
  // remaining steps, not a fresh plan (which would not decrease as you answer).
  const plan = todayPlan(atlas, p, s, now, date);
  const active = p.session && !p.session.finished ? p.session : null;
  return {
    remaining: active ? Math.max(0, active.steps.length - active.index) : plan.due.length + plan.fresh.length,
    due: plan.due.length,
    fresh: plan.fresh.length,
    minutes: plan.minutes,
  };
}

/**
 * Project the four progress figures onto the next 25 hour boundaries.
 *
 * `dueIds()` counts cards with `due <= now`, so the review pile grows on its
 * own while the app is closed — that is exactly what the hourly widget refresh
 * is meant to show. The projections are computed here, in the only layer that
 * owns FSRS state; Java merely picks the row for the current hour. Future days
 * get a full daily-new allowance (`p.days[date]` has no entry yet), and an
 * open session keeps its own remaining step count.
 */
export function planHours(atlas: Atlas, p: Progress, s: Settings, now: number): WidgetHour[] {
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  const hours: WidgetHour[] = [];
  for (let i = 0; i < WIDGET_HOURS; i++) {
    // Advance the wall clock rather than adding 3_600_000 ms: on a DST switch
    // the local hour boundary is not an hour away in epoch milliseconds.
    const boundary = new Date(start);
    boundary.setHours(boundary.getHours() + i);
    const at = boundary.getTime();
    // The first row describes the moment of publishing, not the hour boundary
    // that may already be a few minutes in the past.
    const stamp = i === 0 ? now : at;
    hours.push({
      at,
      ...planOf(atlas, p, s, stamp, dayKey(new Date(stamp))),
    });
  }
  return hours;
}

export function buildSnapshot(args: {
  atlas: Atlas;
  progress: Progress;
  settings: Settings;
  sentence: WidgetSentence | null;
  date: string;
  theme: "dark" | "light";
  dots?: Record<string, string>;
  /** Injectable clock for tests; defaults to now. */
  now?: number;
}): WidgetSnapshot {
  const now = args.now ?? Date.now();
  return {
    v: 1,
    date: args.date,
    theme: args.theme,
    tough: {
      cards: toughCards(args.atlas, args.progress, args.date, args.dots),
      seedDate: args.date,
      slotMs: WIDGET_SLOT_MS,
    },
    ...(args.sentence ? { sentence: args.sentence } : {}),
    plan: planOf(args.atlas, args.progress, args.settings, now, args.date),
    hours: planHours(args.atlas, args.progress, args.settings, now),
  };
}
