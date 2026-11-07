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
  "--sky",
  "--glow",
  "--mark",
] as const;

export type M3Var = (typeof M3_VARS)[number];
export type Palette = Record<M3Var, string>;

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
 * Builds the 22 palette variables for one seed, mode and palette style.
 * Pure and deterministic: the same inputs always return the same object.
 */
export function buildPalette(
  seed: string,
  isDark: boolean,
  variant: M3Variant,
): Palette {
  const clean = normalizeSeed(seed) || FALLBACK_SEED;
  const source = Hct.fromInt(parseInt(clean.slice(1), 16) | 0xff000000);
  const Scheme = SCHEMES[variant] ?? (SchemeTonalSpot as never);
  const scheme = new (
    Scheme as new (h: Hct, d: boolean, c: number, s: "2025") => DynamicScheme
  )(source, isDark, 0, "2025");

  const c = (role: { getArgb(s: DynamicScheme): number }) =>
    role.getArgb(scheme);
  const primary = c(MaterialDynamicColors.primary);
  const tertiary = c(MaterialDynamicColors.tertiary);
  const outlineVariant = c(MaterialDynamicColors.outlineVariant);

  // --sky keeps the old "cool counterweight" job: a muted tone 150° from the accent.
  const skyTone = Hct.from(wrapHue(source.hue - 150), 20, isDark ? 72 : 55);

  return {
    "--paper": hexOf(c(MaterialDynamicColors.surface)),
    "--paper-2": hexOf(c(MaterialDynamicColors.surfaceContainerLow)),
    "--paper-3": hexOf(c(MaterialDynamicColors.surfaceContainer)),
    "--card": hexOf(
      c(
        isDark
          ? MaterialDynamicColors.surfaceContainerLow
          : MaterialDynamicColors.surfaceContainerLowest,
      ),
    ),
    "--card-2": hexOf(c(MaterialDynamicColors.surfaceContainer)),
    "--ink": hexOf(c(MaterialDynamicColors.onSurface)),
    "--ink-2": hexOf(c(MaterialDynamicColors.onSurfaceVariant)),
    "--ink-3": hexOf(c(MaterialDynamicColors.outline)),
    "--ink-4": hexOf(outlineVariant),
    "--line": rgba(outlineVariant, 0.6),
    "--line-strong": rgba(outlineVariant, 0.9),
    "--terra": hexOf(primary),
    "--terra-ink": hexOf(c(MaterialDynamicColors.onPrimaryContainer)),
    "--terra-soft": hexOf(c(MaterialDynamicColors.primaryContainer)),
    "--ochre": hexOf(tertiary),
    "--ochre-soft": hexOf(c(MaterialDynamicColors.tertiaryContainer)),
    "--sage": hexOf(c(MaterialDynamicColors.secondary)),
    "--sage-ink": hexOf(c(MaterialDynamicColors.onSecondaryContainer)),
    "--sage-soft": hexOf(c(MaterialDynamicColors.secondaryContainer)),
    "--sky": hexOf(skyTone.toInt()),
    "--glow": rgba(primary, isDark ? 0.14 : 0.26),
    "--mark": rgba(tertiary, isDark ? 0.28 : 0.32),
  };
}
