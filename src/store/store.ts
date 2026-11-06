import { useSyncExternalStore } from "react";
import type { Accent } from "../atlas/types";
import { asAmbienceId, type AmbienceChoice } from "../lib/ambience";
import type { CardState, Grade } from "./srs";
import { webProgress, webSettings } from "./web-backup";

export type QuizKind = "meaning" | "picture" | "listen" | "spell";

/** Light, dark, or one of the two night skies that repaint the whole palette. */
export type Theme = "system" | "light" | "dark" | "aurora" | "starlight";
/** Typeface for English words and example sentences. */
export type WordFont = "serif" | "sans" | "classic";

export const THEMES: Theme[] = ["system", "light", "dark", "aurora", "starlight"];
export const WORD_FONTS: WordFont[] = ["serif", "sans", "classic"];
/** The two themes that are dark at heart but repaint every pigment. */
export const SKINS: Theme[] = ["aurora", "starlight"];
export const isSkin = (t: Theme): t is "aurora" | "starlight" => SKINS.includes(t);

export type Step = { id: string; kind: "intro" } | { id: string; kind: QuizKind; retry?: boolean; options?: string[] };

export interface ActiveSession {
  id: string;
  started: number;
  steps: Step[];
  index: number;
  /** First-attempt grade per word; retries never change it. */
  graded: Record<string, Grade>;
  newIds: string[];
  reviewIds: string[];
  /** Answer shown but not yet continued; survives reload without double counting. */
  pending?: { correct: boolean; value: string };
  finished?: number;
}

export interface DayStat {
  n: number; // new words met
  r: number; // graded reviews (first attempts)
  c: number; // correct first attempts
  t: number; // active seconds
}

export interface TypingRound {
  at: number;
  mode: "word" | "sentence" | "dictation";
  items: number;
  wpm: number;
  accuracy: number;
}

export interface Progress {
  version: 2;
  datasetId: string;
  cards: Record<string, CardState>;
  bookmarks: string[];
  days: Record<string, DayStat>;
  typing: TypingRound[];
  session: ActiveSession | null;
  /** Rolling list of recent mistakes, newest first. */
  mistakes: string[];
}

export interface Settings {
  accent: Accent;
  autoplay: boolean;
  /** Read the daily example after the word, when it is spoken. */
  autoplayEx: boolean;
  /** Read the IELTS-context example after the word, when it is spoken. */
  autoplayEx2: boolean;
  /** Hide example translations behind a blur until they are tapped. */
  blurZh: boolean;
  dailyNew: number;
  retention: number;
  theme: Theme;
  wordFont: WordFont;
  sfx: boolean;
  /** Short vibration on presses, flips and verdicts (Android: no permission needed). */
  haptic: boolean;
  spell: boolean;
  startLevel: number;
  onboarded: boolean;
  dataset: "open" | "private";
  ambience: AmbienceChoice;
  ambienceVolume: number;
  splash: boolean;
  /** Hide the practice tab and its entry points; only today / atlas / me remain. */
  hidePractice: boolean;
}

export const defaultSettings: Settings = {
  accent: "uk",
  autoplay: true,
  autoplayEx: false,
  autoplayEx2: false,
  blurZh: false,
  dailyNew: 10,
  retention: 0.9,
  theme: "dark",
  wordFont: "serif",
  sfx: true,
  haptic: true,
  spell: true,
  startLevel: 0,
  onboarded: false,
  dataset: "open",
  ambience: "stars",
  ambienceVolume: 0.45,
  splash: true,
  hidePractice: false,
};

export const emptyProgress = (datasetId: string): Progress => ({
  version: 2,
  datasetId,
  cards: {},
  bookmarks: [],
  days: {},
  typing: [],
  session: null,
  mistakes: [],
});

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const SETTINGS_KEY = "word-atlas:settings";
const progressKey = (id: string) => `word-atlas:v2:${id}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* ---------- validation (backups and stored data are untrusted) ---------- */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, lo = -Infinity, hi = Infinity) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

const QUIZ_KINDS = new Set<QuizKind>(["meaning", "picture", "listen", "spell"]);

function validStep(v: unknown): v is Step {
  if (!isObj(v) || typeof v.id !== "string" || typeof v.kind !== "string") return false;
  if (v.kind === "intro") return true;
  if (!QUIZ_KINDS.has(v.kind as QuizKind)) return false;
  return v.options === undefined || (Array.isArray(v.options) && v.options.every((x) => typeof x === "string"));
}

function validCard(v: unknown): v is CardState {
  return (
    isObj(v) &&
    num(v.due, 0) &&
    num(v.s, 0) &&
    num(v.d, 0, 11) &&
    num(v.el, 0) &&
    num(v.sd, 0) &&
    num(v.ls, 0) &&
    num(v.reps, 0) &&
    num(v.lapses, 0) &&
    [0, 1, 2, 3].includes(v.st as number) &&
    (v.last === undefined || num(v.last, 0)) &&
    num(v.seen, 0)
  );
}

export function sanitizeProgress(v: unknown, datasetId: string): Progress {
  const out = emptyProgress(datasetId);
  if (!isObj(v) || v.version !== 2) return out;
  if (isObj(v.cards)) for (const [k, c] of Object.entries(v.cards)) if (validCard(c)) out.cards[k] = c;
  if (Array.isArray(v.bookmarks)) out.bookmarks = v.bookmarks.filter((x): x is string => typeof x === "string").slice(0, 20000);
  if (Array.isArray(v.mistakes)) out.mistakes = v.mistakes.filter((x): x is string => typeof x === "string").slice(0, 300);
  if (isObj(v.days))
    for (const [k, d] of Object.entries(v.days))
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && isObj(d) && num(d.n, 0) && num(d.r, 0) && num(d.c, 0) && num(d.t, 0))
        out.days[k] = { n: d.n as number, r: d.r as number, c: d.c as number, t: d.t as number };
  if (Array.isArray(v.typing))
    out.typing = v.typing
      .filter(
        (t): t is TypingRound =>
          isObj(t) && num(t.at, 0) && ["word", "sentence", "dictation"].includes(t.mode as string) && num(t.items, 0) && num(t.wpm, 0, 400) && num(t.accuracy, 0, 100),
      )
      .slice(-500);
  const s = v.session;
  if (isObj(s) && typeof s.id === "string" && Array.isArray(s.steps) && num(s.index, 0) && isObj(s.graded)) {
    // A half-finished quiz is device state and can come from an older build or
    // a hand-edited file. Drop malformed steps instead of crashing on them.
    const steps = s.steps.filter(validStep);
    if (steps.length) {
      const graded = Object.fromEntries(Object.entries(s.graded).filter(([, g]) => [0, 1, 2, 3].includes(g as number)));
      const pending =
        isObj(s.pending) && typeof s.pending.correct === "boolean" && typeof s.pending.value === "string"
          ? { correct: s.pending.correct, value: s.pending.value }
          : undefined;
      out.session = {
        id: s.id,
        started: num(s.started, 1) ? (s.started as number) : Date.now(),
        steps,
        index: Math.min(Math.floor(s.index as number), steps.length),
        graded: graded as Record<string, Grade>,
        newIds: Array.isArray(s.newIds) ? s.newIds.filter((x): x is string => typeof x === "string") : [],
        reviewIds: Array.isArray(s.reviewIds) ? s.reviewIds.filter((x): x is string => typeof x === "string") : [],
        pending,
        finished: num(s.finished, 0) ? (s.finished as number) : undefined,
      };
    }
  }
  return out;
}

export function sanitizeSettings(v: unknown): Settings {
  const s = { ...defaultSettings };
  if (!isObj(v)) return s;
  if (v.accent === "uk" || v.accent === "us") s.accent = v.accent;
  if (typeof v.autoplay === "boolean") s.autoplay = v.autoplay;
  if (typeof v.autoplayEx === "boolean") s.autoplayEx = v.autoplayEx;
  if (typeof v.autoplayEx2 === "boolean") s.autoplayEx2 = v.autoplayEx2;
  if (typeof v.blurZh === "boolean") s.blurZh = v.blurZh;
  if (num(v.dailyNew, 0, 100)) s.dailyNew = Math.round(v.dailyNew as number);
  if (num(v.retention, 0.7, 0.97)) s.retention = v.retention as number;
  if (THEMES.includes(v.theme as Theme)) s.theme = v.theme as Theme;
  if (WORD_FONTS.includes(v.wordFont as WordFont)) s.wordFont = v.wordFont as WordFont;
  if (typeof v.sfx === "boolean") s.sfx = v.sfx;
  if (typeof v.haptic === "boolean") s.haptic = v.haptic;
  if (typeof v.spell === "boolean") s.spell = v.spell;
  if (num(v.startLevel, 0, 5)) s.startLevel = Math.round(v.startLevel as number);
  if (typeof v.onboarded === "boolean") s.onboarded = v.onboarded;
  if (v.dataset === "open" || v.dataset === "private") s.dataset = v.dataset;
  const ambience = asAmbienceId(v.ambience);
  if (v.ambience === "off" || ambience) s.ambience = ambience ?? "off";
  if (num(v.ambienceVolume, 0, 1)) s.ambienceVolume = v.ambienceVolume as number;
  if (typeof v.splash === "boolean") s.splash = v.splash;
  if (typeof v.hidePractice === "boolean") s.hidePractice = v.hidePractice;
  return s;
}

/* ---------- store ---------- */

interface State {
  progress: Progress;
  settings: Settings;
  saveError: boolean;
}

let state: State = {
  progress: emptyProgress("word-atlas-open"),
  settings: sanitizeSettings(read(SETTINGS_KEY)),
  saveError: false,
};
const listeners = new Set<() => void>();
let saveTimer: number | undefined;
/** Only write when this tab changed something, so idle tabs never clobber newer data. */
let dirty = false;
/** Progress is written only after it has been read from storage for this dataset. */
let loadedId: string | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function scheduleSave() {
  dirty = true;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flush, 250);
}

export function flush() {
  // Headless (tests, scripts) there is no timer and nowhere to save.
  if (typeof window === "undefined") {
    dirty = false;
    return;
  }
  window.clearTimeout(saveTimer);
  if (!dirty) return;
  dirty = false;
  const progressOk = loadedId !== state.progress.datasetId || write(progressKey(state.progress.datasetId), state.progress);
  const ok = progressOk && write(SETTINGS_KEY, state.settings);
  if (ok === state.saveError) {
    state = { ...state, saveError: !ok };
    emit();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
  // Another tab saved: adopt its data instead of keeping a stale copy.
  window.addEventListener("storage", (e) => {
    if (!e.newValue) return;
    try {
      if (e.key === SETTINGS_KEY) state = { ...state, settings: sanitizeSettings(JSON.parse(e.newValue)) };
      else if (e.key === progressKey(state.progress.datasetId))
        state = { ...state, progress: sanitizeProgress(JSON.parse(e.newValue), state.progress.datasetId) };
      else return;
      emit();
    } catch {
      /* ignore malformed writes */
    }
  });
}

export const store = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  useDataset(datasetId: string) {
    flush();
    state = { ...state, progress: sanitizeProgress(read(progressKey(datasetId)), datasetId) };
    loadedId = datasetId;
    emit();
  },
  progress(fn: (p: Progress) => Progress) {
    state = { ...state, progress: fn(state.progress) };
    emit();
    scheduleSave();
  },
  settings(patch: Partial<Settings>) {
    state = { ...state, settings: { ...state.settings, ...patch } };
    emit();
    scheduleSave();
  },
};

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(state), () => select(state));
}

export function bumpDay(p: Progress, patch: Partial<DayStat>): Progress {
  const k = dayKey();
  const d = p.days[k] ?? { n: 0, r: 0, c: 0, t: 0 };
  return {
    ...p,
    days: {
      ...p.days,
      [k]: { n: d.n + (patch.n ?? 0), r: d.r + (patch.r ?? 0), c: d.c + (patch.c ?? 0), t: d.t + (patch.t ?? 0) },
    },
  };
}

export function toggleBookmark(id: string) {
  store.progress((p) => ({
    ...p,
    bookmarks: p.bookmarks.includes(id) ? p.bookmarks.filter((x) => x !== id) : [id, ...p.bookmarks],
  }));
}

/* ---------- backup ---------- */

/** This app's own file: everything it knows, for another install of this app. */
export function exportBackup() {
  flush();
  const { progress, settings } = state;
  return JSON.stringify({ app: "word-atlas", version: 2, exported: new Date().toISOString(), progress: { ...progress, session: null }, settings }, null, 1);
}

/**
 * The same progress in the upstream site's dialect.
 *
 * The site re-checks the whole file and refuses it outright if one setting it knows about is missing — `progress.drills`, `examDate`, `illus` and five more. `web-backup.ts` holds its rules; this is only the envelope.
 */
export function exportWebBackup() {
  flush();
  const { progress, settings } = state;
  return JSON.stringify({ app: "word-atlas", version: 2, exported: new Date().toISOString(), progress: webProgress(progress), settings: webSettings(settings) }, null, 1);
}

function markDirty() {
  dirty = true;
}

export type ImportReport = { ok: true; cards: number; days: number; web: boolean } | { ok: false; error: string };

/** A file from the site is the one carrying `drills`, or the reader's book state. */
function looksWeb(data: Record<string, unknown>) {
  const p = data.progress;
  return isObj(p) && (isObj(p.drills) || "books" in data || "booksReader" in data);
}

/**
 * Restore from either dialect.
 *
 * The site writes fields this app has no room for (`drills`, `books`, the exam plan); `sanitizeProgress` drops them, and the settings only this app has keep their current value instead of falling back to a default.
 */
export function importAnyBackup(text: string): ImportReport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "文件不是有效的 JSON。" };
  }
  if (!isObj(data) || data.app !== "word-atlas" || data.version !== 2 || !isObj(data.progress))
    return { ok: false, error: "这不是词光的学习备份。" };
  const id = state.progress.datasetId;
  if (data.progress.datasetId !== id) return { ok: false, error: "备份来自另一个词库，请先切换到对应词库。" };
  const web = looksWeb(data);
  const progress = sanitizeProgress({ ...data.progress, session: null }, id);
  const settings = sanitizeSettings(data.settings);
  state = {
    ...state,
    progress,
    settings: {
      ...settings,
      ...(web ? { autoplayEx: state.settings.autoplayEx, autoplayEx2: state.settings.autoplayEx2, blurZh: state.settings.blurZh, haptic: state.settings.haptic, hidePractice: state.settings.hidePractice } : {}),
      onboarded: true,
    },
  };
  emit();
  markDirty();
  flush();
  return { ok: true, cards: Object.keys(progress.cards).length, days: Object.keys(progress.days).length, web };
}

/** The plain 导入备份 button: one summary line, whichever dialect the file is in. */
export function importBackup(text: string): { ok: true; cards: number } | { ok: false; error: string } {
  const r = importAnyBackup(text);
  return r.ok ? { ok: true, cards: r.cards } : r;
}

export function resetProgress() {
  state = { ...state, progress: emptyProgress(state.progress.datasetId) };
  emit();
  markDirty();
  flush();
}
