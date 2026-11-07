/**
 * The theme model, with no dependencies of its own.
 *
 * It lives apart from `store` and `theme` so both can import it without a
 * cycle: the settings schema needs the types, the application layer needs the
 * two conversion functions, and neither should drag the other in.
 */

export type ThemeFamily = "ink" | "night" | "m3e";
export type ThemeMode = "system" | "light" | "dark";
export type NightSkin = "aurora" | "starlight";

/** The three fields that together decide which colours get painted. */
export type ThemeChoice = {
  themeFamily: ThemeFamily;
  themeMode: ThemeMode;
  nightSkin: NightSkin;
};

export const FAMILY_LABEL: Record<ThemeFamily, string> = {
  ink: "纸墨",
  night: "夜空",
  m3e: "Material Expressive",
};

export const MODE_LABEL: Record<ThemeMode, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
};

export const NIGHT_LABEL: Record<NightSkin, string> = {
  aurora: "极光",
  starlight: "星光",
};

export type M3Variant =
  | "monochrome"
  | "neutral"
  | "tonalSpot"
  | "vibrant"
  | "expressive"
  | "fidelity"
  | "content"
  | "rainbow"
  | "fruitSalad";

/** The variants in the order the picker shows them, tame first. */
export const VARIANTS: readonly M3Variant[] = [
  "tonalSpot",
  "monochrome",
  "neutral",
  "vibrant",
  "expressive",
  "fidelity",
  "content",
  "rainbow",
  "fruitSalad",
];

export const VARIANT_LABEL: Record<M3Variant, string> = {
  monochrome: "单色",
  neutral: "中性",
  tonalSpot: "色调对比",
  vibrant: "鲜艳",
  expressive: "表现力",
  fidelity: "忠实",
  content: "内容",
  rainbow: "彩虹",
  fruitSalad: "水果沙拉",
};

/** Curated seeds; the first five are the pigments the paper theme already uses. */
export const PALETTES: readonly { name: string; hex: string }[] = [
  { name: "陶土", hex: "#C4573A" },
  { name: "赭石", hex: "#CB922C" },
  { name: "苔绿", hex: "#6A8C63" },
  { name: "天青", hex: "#5F88A8" },
  { name: "梅紫", hex: "#9A6283" },
  { name: "石墨", hex: "#5B6068" },
  { name: "松青", hex: "#2F6B5F" },
  { name: "靛蓝", hex: "#3F51B5" },
];

/** Used when the phone will not hand over a wallpaper colour. */
export const FALLBACK_SEED = "#C4573A";

/** What older builds and the website call the theme. */
export type LegacyTheme = "system" | "light" | "dark" | "aurora" | "starlight";

const LEGACY: Record<string, ThemeChoice> = {
  system: { themeFamily: "ink", themeMode: "system", nightSkin: "aurora" },
  light: { themeFamily: "ink", themeMode: "light", nightSkin: "aurora" },
  dark: { themeFamily: "ink", themeMode: "dark", nightSkin: "aurora" },
  aurora: { themeFamily: "night", themeMode: "dark", nightSkin: "aurora" },
  starlight: {
    themeFamily: "night",
    themeMode: "dark",
    nightSkin: "starlight",
  },
};

/**
 * Reads an old `theme` value from a backup or a stored profile.
 *
 * Returns null for anything unrecognised — the caller keeps its defaults
 * rather than writing a broken value into the new five-field model.
 */
export function fromLegacyTheme(v: unknown): ThemeChoice | null {
  if (typeof v !== "string") return null;
  const hit = LEGACY[v];
  return hit ? { ...hit } : null;
}

/**
 * Folds the model back into the five words the backup format and the site
 * understand. Material Expressive has no legacy word, so it degrades to the
 * plain mode word — the backup then restores a paper theme, which is the
 * documented trade-off.
 */
export function legacyTheme(s: {
  themeFamily: ThemeFamily;
  themeMode: ThemeMode;
  nightSkin: NightSkin;
}): LegacyTheme {
  if (s.themeFamily === "night") return s.nightSkin;
  return s.themeMode;
}
