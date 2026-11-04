/**
 * Wires the web layer to the Android home-screen widgets.
 *
 * Two jobs, both best-effort: publish a compact one-way snapshot whenever
 * learning state or the local date changes, and honour the one-shot
 * `waStart=1` flag the shell appends when the 4x1 "继续旅程" button is tapped.
 */
import type { Atlas } from "../atlas/types";
import { embedded } from "../atlas/embedded";
import { getSystemDark, shell } from "./native";
import { go } from "./router";
import { dayKey, store } from "../store/store";
import { buildSession } from "../store/session";
import {
  buildSnapshot,
  pickWordOfDay,
  sentenceFromEntry,
  type WidgetSentence,
} from "./widget-data";

let launched = false;
let sentenceCache: { date: string; value: WidgetSentence } | null = null;
let dotsCache: Record<string, string> | null = null;

/** OALDPEX dotted headwords, inlined into the APK; empty on the web build. */
function syllableDots(): Record<string, string> {
  if (dotsCache) return dotsCache;
  try {
    const raw = embedded()?.syllables;
    dotsCache = raw ? (JSON.parse(raw) as { dots?: Record<string, string> }).dots ?? {} : {};
  } catch {
    dotsCache = {};
  }
  return dotsCache;
}

function resolveTheme(theme: string): "dark" | "light" {
  if (theme === "light") return "light";
  if (theme === "system") return getSystemDark() ? "dark" : "light";
  return "dark"; // dark, aurora, starlight
}

/**
 * Equivalent to the Today page's `start()`: create a session if there is none,
 * then enter the learning page. A bare `#/learn` would render an empty stage.
 */
export function installWidgetLaunch(atlas: Atlas) {
  if (launched) return;
  const params = new URLSearchParams((location.hash || "").split("?")[1] || "");
  if (params.get("waStart") !== "1") return;
  launched = true;
  const { progress, settings } = store.get();
  const active = progress.session && !progress.session.finished ? progress.session : null;
  if (!active) {
    const session = buildSession(atlas, progress, settings);
    if (session.steps.length) store.progress((p) => ({ ...p, session }));
  }
  // replaceState drops the waStart flag so a later reload does not replay it.
  go({ page: "learn" }, null, true);
}

/** Returns a cleanup function; safe under React StrictMode's double mount. */
export function installWidgetPublisher(atlas: Atlas): () => void {
  if (!shell?.publishWidgetSnapshot) return () => {};
  let timer: number | undefined;
  let lastDate = dayKey();
  let disposed = false;

  const publish = async () => {
    if (disposed) return;
    try {
      const date = dayKey();
      if (!sentenceCache || sentenceCache.date !== date) {
        const ref = pickWordOfDay(atlas, date);
        if (ref) {
          const entry = await atlas.entry(ref.id);
          const sentence = sentenceFromEntry(ref, entry, atlas, date);
          if (sentence) sentenceCache = { date, value: sentence };
        }
      }
      if (disposed) return;
      const { progress, settings } = store.get();
      const snapshot = buildSnapshot({
        atlas,
        progress,
        settings,
        sentence: sentenceCache?.value ?? null,
        date,
        theme: resolveTheme(settings.theme),
        dots: syllableDots(),
      });
      shell?.publishWidgetSnapshot?.(JSON.stringify(snapshot));
    } catch {
      // A widget is never allowed to break the learning flow.
    }
  };

  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void publish(), 400);
  };

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    const date = dayKey();
    if (date !== lastDate) {
      lastDate = date;
      sentenceCache = null;
    }
    schedule();
  };

  const unsubscribe = store.subscribe(schedule);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  const interval = window.setInterval(() => {
    const date = dayKey();
    if (date !== lastDate) {
      lastDate = date;
      sentenceCache = null;
      schedule();
    }
  }, 60_000);

  schedule();
  return () => {
    disposed = true;
    window.clearTimeout(timer);
    window.clearInterval(interval);
    unsubscribe();
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
  };
}
