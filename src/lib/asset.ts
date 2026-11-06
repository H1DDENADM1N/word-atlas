/**
 * Read a packaged asset as a `data:` URL, or null on the web.
 *
 * The page runs from `file://` inside the APK, and drawing such an image into a
 * canvas taints it — `canvas.toBlob()` then throws, so the share card could
 * never be exported. A `data:` URL is origin-clean, so the card renders from
 * the same bytes the page displays.
 *
 * This lives apart from `native.ts` because that module also owns the router
 * bridge, which reads `location` while loading; pure helpers can then import
 * asset access without pulling in the whole shell.
 */
export function assetDataUrl(src: string): string | null {
  if (typeof window === "undefined") return null;
  const shell = window.WordAtlasAndroid;
  if (!shell?.assetDataUrl) return null;
  try {
    return shell.assetDataUrl(new URL(src, location.href).href);
  } catch {
    return null;
  }
}
