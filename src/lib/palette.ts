/**
 * The search palette is owned by `Shell`, but a couple of pages (the empty
 * history state) need to open it without threading a callback through props.
 * A one-way DOM event keeps that dependency out of the component tree.
 */
export const PALETTE_EVENT = "wa:palette";

export function openPalette() {
  window.dispatchEvent(new Event(PALETTE_EVENT));
}
