/**
 * Lookup history — "最近查过" / recently looked-up words.
 *
 * Kept deliberately outside the learning-progress store. Backups describe
 * study state (cards, days, settings) and have to stay byte-compatible with
 * the upstream web app, so history lives in its own localStorage key and is
 * never exported, imported or reset together with progress.
 *
 * The value is a plain `string[]` of word IDs, most-recent first, capped at
 * 20. No timestamps, no counts, no metadata: the order *is* the recency.
 */
import type { Atlas, WordRef } from "../atlas/types";

/** Same key as the upstream site, so a web backup never has to know about it. */
export const RECENT_KEY = "word-atlas:recent-search";
export const RECENT_CAP = 20;
/** Fired on every local write so open views can re-read without polling. */
export const RECENT_EVENT = "wa:recent";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

const NULL_STORAGE: StorageLike = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/** `localStorage` is missing in Node (tests) and can throw under `file://`. */
function fallbackStorage(): StorageLike {
  try {
    return typeof localStorage === "undefined" ? NULL_STORAGE : localStorage;
  } catch {
    return NULL_STORAGE;
  }
}

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RECENT_EVENT));
}

/** Tolerant read: bad JSON, foreign shapes and oversized arrays all degrade to []. */
export function readRecent(storage: StorageLike = fallbackStorage()): string[] {
  try {
    const raw: unknown = JSON.parse(storage.getItem(RECENT_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const value of raw) {
      if (typeof value !== "string" || !value || seen.has(value)) continue;
      seen.add(value);
      ids.push(value);
      if (ids.length === RECENT_CAP) break;
    }
    return ids;
  } catch {
    return [];
  }
}

function write(ids: string[], storage: StorageLike) {
  try {
    storage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    /* private mode / quota: history is optional, never break a lookup */
  }
  emit();
}

/** Move `id` to the front (MRU), drop duplicates, evict the oldest past the cap. */
export function pushRecent(id: string, storage: StorageLike = fallbackStorage()): string[] {
  if (!id) return readRecent(storage);
  const next = [id, ...readRecent(storage).filter((x) => x !== id)].slice(0, RECENT_CAP);
  write(next, storage);
  return next;
}

export function clearRecent(storage: StorageLike = fallbackStorage()): void {
  try {
    if (storage.removeItem) storage.removeItem(RECENT_KEY);
    else storage.setItem(RECENT_KEY, "[]");
  } catch {
    /* optional */
  }
  emit();
}

/**
 * Turn stored IDs into rows. IDs from another dataset or an older build simply
 * vanish from the view; storage is left alone so switching word lists back
 * restores them.
 */
export function resolveRecent(atlas: Atlas, storage: StorageLike = fallbackStorage()): WordRef[] {
  const out: WordRef[] = [];
  for (const id of readRecent(storage)) {
    const w = atlas.byId.get(id);
    if (w) out.push(w);
  }
  return out;
}

/** Subscribe to local writes and to changes made in another tab. */
export function subscribeRecent(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key === RECENT_KEY) listener();
  };
  window.addEventListener(RECENT_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(RECENT_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * A handful of words to try when there is no history yet. Seeded by the local
 * day number so the row is stable within a day and rotates the next one —
 * the seed is never persisted, it is only a starting point for browsing.
 */
export function dailyPicks(atlas: Atlas, count = 6, day = Math.floor(Date.now() / 86_400_000)): WordRef[] {
  const total = atlas.words.length;
  if (!total) return [];
  const n = Math.min(count, total);
  const out: WordRef[] = [];
  const seen = new Set<number>();
  for (let i = 0; out.length < n && i < total * 2; i++) {
    const k = (((day * 7919 + i * 1543) % total) + total) % total;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(atlas.words[k]);
  }
  return out;
}
