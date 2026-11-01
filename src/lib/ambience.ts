/**
 * The ambience tracks, kept in their own module so the store (which has to
 * validate a saved `ambience` value) can see the ids without pulling in the
 * Web Audio player.
 *
 * The audio is not made here — `scripts/fetch_ambience.py` pulls the same files
 * the reference site plays from its open-source repository, at a pinned commit,
 * and records each one's SHA-256 in `scripts/ambience-sources.json`. Most are
 * Pixabay recordings under the Pixabay Content Licence; `brown`, `musicbox` and
 * `guzheng` are the three upstream synthesises.
 *
 * `db` is upstream's own trim. Every track is already mastered to roughly the
 * same loudness, so this is the small artistic offset on top — the music boxes
 * sit far lower than the noise beds, because a tune asks for attention in a way
 * rain does not.
 */

export const AMBIENCE = [
  { id: "stars", label: "星河入梦", db: -2.9 },
  { id: "rain", label: "书窗听雨", db: -0.5 },
  { id: "sea", label: "晨海潮声", db: 0.8 },
  { id: "forest", label: "林间晨光", db: -0.6 },
  { id: "fire", label: "炉火微温", db: -0.1 },
  { id: "voyage", label: "夜航舟中", db: -0.3 },
  { id: "cafe", label: "午后咖啡", db: 0.3 },
  { id: "brown", label: "静水深流", db: 2.6 },
  { id: "musicbox", label: "八音旧梦", db: -12.5 },
  { id: "guzheng", label: "弦上清音", db: -7.7 },
  { id: "crickets-night", label: "夏夜虫吟", db: 0.0 },
  { id: "rain-window", label: "檐雨敲窗", db: -0.8 },
  { id: "stream", label: "石上清泉", db: 0.0 },
  { id: "rain-forest", label: "夜雨空山", db: 0.4 },
  { id: "bamboo", label: "竹林听风", db: 3.4 },
  { id: "frogs", label: "稻花蛙声", db: -0.2 },
  { id: "cicadas", label: "蝉鸣盛夏", db: -1.5 },
  { id: "winter-wind", label: "风雪夜归", db: -1.2 },
  { id: "campfire", label: "篝火星野", db: 2.5 },
  { id: "train", label: "列车远行", db: 0.0 },
  { id: "library", label: "书页静翻", db: 0.0 },
  { id: "chimes", label: "风铃轻响", db: -1.0 },
  { id: "piano-study", label: "琴键伴读", db: 0.0 },
  { id: "piano-clouds", label: "云上琴音", db: 0.0 },
  { id: "lofi-study", label: "慢拍自习室", db: 0.0 },
  { id: "lofi-lamp", label: "灯下慢拍", db: 0.0 },
  { id: "bamboo-flute", label: "竹笛牧歌", db: 0.0 },
  { id: "guqin", label: "高山流水", db: -0.5 },
  { id: "guitar", label: "木吉他午后", db: 0.0 },
  { id: "harp", label: "竖琴星光", db: 0.0 },
] as const;

export type AmbienceId = (typeof AMBIENCE)[number]["id"];

/** `off` is a setting, not a track: silence is chosen from the same list. */
export type AmbienceChoice = AmbienceId | "off";

export const AMBIENCE_IDS: AmbienceId[] = AMBIENCE.map((a) => a.id);

/** Ids an older build shipped, so a saved choice survives the change. */
const RENAMED: Record<string, AmbienceId> = {
  crickets: "crickets-night",
};

export function isAmbienceId(v: unknown): v is AmbienceId {
  return typeof v === "string" && (AMBIENCE_IDS as string[]).includes(v);
}

/** Accept a saved value, following an id that has since been renamed. */
export function asAmbienceId(v: unknown): AmbienceId | null {
  if (isAmbienceId(v)) return v;
  if (typeof v === "string" && v in RENAMED) return RENAMED[v];
  return null;
}

/** Linear gain multiplier for a track's loudness trim. */
export function trim(id: AmbienceId | undefined) {
  const db = AMBIENCE.find((a) => a.id === id)?.db ?? 0;
  return 10 ** (db / 20);
}
