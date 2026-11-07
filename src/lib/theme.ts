/**
 * Theme resolution shared by the shell chrome and the page.
 *
 * `settings.themeFamily` / `themeMode` are what the user picked; `mode` is what
 * actually gets painted. Three cases need care:
 *
 * - "system" is resolved from the operating system (see `lib/native`), because
 *   a WebView answers `prefers-color-scheme` from the app's own theme.
 * - The two night skies (极光 / 星光) are dark palettes that repaint every
 *   pigment, so they keep `data-theme="dark"` and add `data-skin`.
 * - The expressive family has no authored colours: its palette is computed from
 *   one seed at runtime, so the chrome colour has to come from that palette.
 */
import { useMemo, useSyncExternalStore } from "react";
import { useStore } from "../store/store";
import { buildPalette, normalizeSeed, type M3Palette } from "./m3";
import { getSystemDark, subscribeSystemTheme, wallpaperSeed } from "./native";
import {
  FALLBACK_SEED,
  type NightSkin,
  type ThemeFamily,
  type ThemeMode,
} from "./theme-model";

export type Mode = "light" | "dark";

/** Colour of the Android status/navigation bars for each authored palette. */
const CHROME: Record<Mode | NightSkin, string> = {
  light: "#F6F1E7",
  dark: "#0D1120",
  aurora: "#05060F",
  starlight: "#080B18",
};

export function resolveMode(
  family: ThemeFamily,
  mode: ThemeMode,
  systemDark: boolean,
): Mode {
  if (family === "night") return "dark";
  if (mode === "system") return systemDark ? "dark" : "light";
  return mode;
}

export function chromeColor(
  family: ThemeFamily,
  mode: Mode,
  nightSkin: NightSkin,
  palette: M3Palette | null,
) {
  if (family === "m3e" && palette) return palette["--paper"];
  return family === "night" ? CHROME[nightSkin] : CHROME[mode];
}

/**
 * The seed the expressive family paints with: the swatch the user picked, else
 * the phone's wallpaper accent, else the brand terracotta. Used by the settings
 * screen too, so its chips preview exactly what the page will show.
 */
export function resolveSeed(accent: string): string {
  return normalizeSeed(accent) || wallpaperSeed() || FALLBACK_SEED;
}

export function useThemeSettings() {
  const settings = useStore((s) => s.settings);
  const systemDark = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemDark,
    getSystemDark,
  );
  const {
    themeFamily: family,
    themeMode: themeMode,
    nightSkin,
    m3Variant: variant,
    m3Accent: accent,
  } = settings;
  const mode = resolveMode(family, themeMode, systemDark);
  const palette = useMemo(() => {
    if (family !== "m3e") return null;
    // mode folds in the resolved system preference, so it belongs here.
    return buildPalette(resolveSeed(accent), mode === "dark", variant);
  }, [family, accent, variant, mode]);
  return { family, mode, nightSkin, variant, accent, palette };
}
