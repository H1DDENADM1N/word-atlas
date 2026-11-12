/**
 * Gesture maths for the two pull gestures: "pull down at the top of a page to
 * search" and "pull down at the top of a word card to close it".
 *
 * Kept apart from the components so the numbers can be checked without a DOM,
 * and so both gestures share one definition of what a downward pull is.
 */

/** Finger travel, in px, that arms the search pull. */
export const PULL_ARM = 64;
/** Furthest the hint pill travels below the header. */
export const PULL_MAX = 104;
/** Finger travel that dismisses the word card. A whole panel is heavier than a hint. */
export const SHEET_ARM = 96;

/**
 * A pull is only a pull when it is more vertical than horizontal. Nineteen
 * topic chips, the star map and the week strip all sit under the finger, and a
 * sideways drag has to stay theirs.
 */
export function isPullDown(dx: number, dy: number) {
  return dy > 0 && Math.abs(dx) <= Math.abs(dy);
}

/**
 * Rubber band for the hint: the first 40 px follow the finger exactly, the
 * rest at 45%, so a long drag cannot throw the pill across the page.
 */
export function pullOffset(dy: number) {
  if (dy <= 0) return 0;
  const free = 40;
  if (dy <= free) return dy;
  return Math.min(PULL_MAX, free + (dy - free) * 0.45);
}

/** 0 → 1 as the finger approaches the arm point; 1 means "release to fire". */
export function pullProgress(dy: number, arm = PULL_ARM) {
  return Math.min(1, Math.max(0, dy / arm));
}
