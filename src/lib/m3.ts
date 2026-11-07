import {
  Hct,
  MaterialDynamicColors,
  SchemeContent,
  SchemeExpressive,
  SchemeFidelity,
  SchemeFruitSalad,
  SchemeMonochrome,
  SchemeNeutral,
  SchemeRainbow,
  SchemeTonalSpot,
  SchemeVibrant,
} from "@material/material-color-utilities";
import type { DynamicScheme } from "@material/material-color-utilities";
import { FALLBACK_SEED } from "./theme-model";
import type { M3Variant } from "./theme-model";

/** Every CSS custom property the M3E family owns. Nothing else may be written. */
export const M3_VARS = [
  "--paper",
  "--paper-2",
  "--paper-3",
  "--card",
  "--card-2",
  "--ink",
  "--ink-2",
  "--ink-3",
  "--ink-4",
  "--line",
  "--line-strong",
  "--terra",
  "--terra-ink",
  "--terra-soft",
  "--ochre",
  "--ochre-soft",
  "--sage",
  "--sage-ink",
  "--sage-soft",
  "--bad",
  "--bad-soft",
  "--sky",
  "--glow",
  "--mark",
] as const;

export type M3Var = (typeof M3_VARS)[number];
export type M3Palette = Record<M3Var, string>;

const SCHEMES: Record<
  M3Variant,
  new (hct: Hct, dark: boolean, contrast: number, spec: "2025") => DynamicScheme
> = {
  tonalSpot: SchemeTonalSpot as never,
  monochrome: SchemeMonochrome as never,
  neutral: SchemeNeutral as never,
  vibrant: SchemeVibrant as never,
  expressive: SchemeExpressive as never,
  fidelity: SchemeFidelity as never,
  content: SchemeContent as never,
  rainbow: SchemeRainbow as never,
  fruitSalad: SchemeFruitSalad as never,
};

const SEED_RE = /^#[0-9a-f]{6}$/i;

/** Returns an uppercase `#RRGGBB`, or "" when the value is not a clean hex colour. */
export function normalizeSeed(value: unknown): string {
  return typeof value === "string" && SEED_RE.test(value)
    ? value.toUpperCase()
    : "";
}

function hexOf(argb: number): string {
  return `#${(argb & 0xffffff).toString(16).padStart(6, "0").toUpperCase()}`;
}

function rgba(argb: number, alpha: number): string {
  const r = (argb >> 16) & 255;
  const g = (argb >> 8) & 255;
  const b = argb & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function wrapHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

/**
 * The three meanings the quiz and the atlas hang on colour — right, wrong and
 * already-seen — cannot come from the scheme's secondary/tertiary partners:
 * those two share the seed's hue (secondary differs from primary by chroma
 * alone) and sit at chroma 16–28, so a green "right" and a green "wrong" were
 * one degree apart. These anchors are fixed hues, tuned per mode for contrast,
 * so the meanings survive any wallpaper.
 */
const ANCHORS = {
  right: { hue: 145, chroma: 40 },
  seen: { hue: 72, chroma: 55 },
} as const;

function anchor(
  spec: { hue: number; chroma: number },
  tone: number,
  chromaScale = 1,
): string {
  return hexOf(
    Hct.from(spec.hue, spec.chroma * chromaScale, tone).toInt(),
  );
}

/**
 * Builds the 22 palette variables for one seed, mode and palette style.
 * Pure and deterministic: the same inputs always return the same object.
 */
export function buildPalette(
  seed: string,
  isDark: boolean,
  variant: M3Variant,
): M3Palette {
  const clean = normalizeSeed(seed) || FALLBACK_SEED;
  const source = Hct.fromInt(parseInt(clean.slice(1), 16) | 0xff000000);
  const Scheme = SCHEMES[variant];
  const scheme = new (
    Scheme as new (h: Hct, d: boolean, c: number, s: "2025") => DynamicScheme
  )(source, isDark, 0, "2025");

  const argb = (role: { getArgb(s: DynamicScheme): number }) =>
    role.getArgb(scheme);
  const primary = argb(MaterialDynamicColors.primary);
  const tertiary = argb(MaterialDynamicColors.tertiary);
  const outlineVariant = argb(MaterialDynamicColors.outlineVariant);

  // --sky keeps the old "cool counterweight" job: a muted tone 150° from the accent.
  const skyTone = Hct.from(wrapHue(source.hue - 150), 20, isDark ? 72 : 55);

  return {
    "--paper": hexOf(argb(MaterialDynamicColors.surface)),
    "--paper-2": hexOf(argb(MaterialDynamicColors.surfaceContainerLow)),
    "--paper-3": hexOf(argb(MaterialDynamicColors.surfaceContainer)),
    "--card": hexOf(
      argb(
        isDark
          ? MaterialDynamicColors.surfaceContainerLow
          : MaterialDynamicColors.surfaceContainerLowest,
      ),
    ),
    "--card-2": hexOf(argb(MaterialDynamicColors.surfaceContainer)),
    "--ink": hexOf(argb(MaterialDynamicColors.onSurface)),
    "--ink-2": hexOf(argb(MaterialDynamicColors.onSurfaceVariant)),
    "--ink-3": hexOf(argb(MaterialDynamicColors.outline)),
    "--ink-4": hexOf(outlineVariant),
    "--line": rgba(outlineVariant, 0.6),
    "--line-strong": rgba(outlineVariant, 0.9),
    "--terra": hexOf(primary),
    "--terra-ink": hexOf(argb(MaterialDynamicColors.onPrimaryContainer)),
    "--terra-soft": hexOf(argb(MaterialDynamicColors.primaryContainer)),
    "--ochre": anchor(ANCHORS.seen, isDark ? 82 : 42),
    "--ochre-soft": anchor(ANCHORS.seen, isDark ? 26 : 92, 0.7),
    "--sage": anchor(ANCHORS.right, isDark ? 80 : 38),
    "--sage-ink": anchor(ANCHORS.right, isDark ? 92 : 18, 0.75),
    "--sage-soft": anchor(ANCHORS.right, isDark ? 26 : 92, 0.75),
    "--bad": hexOf(argb(MaterialDynamicColors.error)),
    "--bad-soft": hexOf(argb(MaterialDynamicColors.errorContainer)),
    "--sky": hexOf(skyTone.toInt()),
    "--glow": rgba(primary, isDark ? 0.14 : 0.26),
    "--mark": rgba(tertiary, isDark ? 0.28 : 0.32),
  };
}
