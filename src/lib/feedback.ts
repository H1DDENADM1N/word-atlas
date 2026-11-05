/**
 * Press feedback, shared by the site and the APK.
 *
 * A tap is only a tap when the finger goes down and comes back up in roughly
 * the same place. Firing on `pointerdown` (the earlier behaviour) meant every
 * scroll that happened to start on a button produced a click and a buzz. Now
 * the gesture is classified on release: movement over DRAG_PX, a long press,
 * a cancelled pointer or a second finger all cancel it.
 *
 * Only real controls respond: buttons, links, switches/segmented controls,
 * sliders and selects. Blank space, canvas drags and non-button cards stay
 * silent. One press produces exactly one sound and one short vibration.
 *
 * 界面音效 gates the sound, 界面震动 gates the vibration — independently.
 */
import { vibrate } from "./native";
import { cue, playTap } from "./sound";
import { store } from "../store/store";

export type HapticKind = "tick" | "click" | "success" | "error";

const PRESSABLE = [
  "button",
  "a[href]",
  "[role='button']",
  "[role='tab']",
  "[role='switch']",
  "input[type='checkbox']",
  "input[type='radio']",
  "input[type='range']",
  "select",
  "summary",
  "label",
  "[data-tap]",
].join(",");

const SKIP = [
  "textarea",
  "[contenteditable]",
  "[data-no-tap]",
  ":disabled",
  "[aria-disabled='true']",
  "input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='button']):not([type='submit'])",
].join(",");

/** A swipe starts small; 10 px is below a deliberate drag and above finger jitter. */
const DRAG_PX = 10;
/** Holding still is a long press, not a tap. */
const TAP_MAX_MS = 600;
/** One feedback per gesture, and never a machine-gun on rapid taps. */
const FEEDBACK_GAP_MS = 130;
/** Event-level haptics (keyboard flip/verdict) stand down after any pointer use. */
const POINTER_QUIET_MS = 350;
/** A fast typist must not turn the phone into a continuous buzz. */
const TYPING_HAPTIC_GAP_MS = 110;

type Pending = { x: number; y: number; at: number; id: number } | null;
let pending: Pending = null;
let lastFeedbackAt = 0;
let lastTypingHapticAt = 0;
let lastPointerAt = 0;
let installed = false;

function fire(kind: HapticKind, sound: boolean) {
  const now = performance.now();
  if (now - lastFeedbackAt < FEEDBACK_GAP_MS) return;
  lastFeedbackAt = now;
  const s = store.get().settings;
  if (sound && s.sfx) playTap();
  if (s.haptic) vibrate(kind);
}

/** One confirmed tap. */
export function tapFeedback() {
  fire("tick", true);
}

/** Flip / verdict reached from the keyboard (a touch already buzzed on release). */
export function haptic(kind: HapticKind) {
  if (performance.now() - lastPointerAt < POINTER_QUIET_MS) return;
  fire(kind, false);
}

/** One sample buzz when 界面震动 is switched on. The toggle's own press did
 *  not vibrate (it was still off), so this bypasses the gesture cooldown. */
export function previewHaptic() {
  if (store.get().settings.haptic) vibrate("click");
}

/**
 * A keystroke from an IME produces no pointer events, so the tap listener
 * never sees it. Both typing surfaces (the spell quiz in Learn and the typing
 * page in Practice) call this instead: the key cue plays at full typing cadence,
 * while the buzz is throttled so fast typing stays subtle.
 */
export function typingFeedback() {
  const s = store.get().settings;
  if (s.sfx) void cue("key");
  if (!s.haptic) return;
  const now = performance.now();
  if (now - lastTypingHapticAt < TYPING_HAPTIC_GAP_MS) return;
  lastTypingHapticAt = now;
  vibrate("tick");
}

function onDown(e: PointerEvent) {
  lastPointerAt = performance.now();
  if (!e.isTrusted || e.button !== 0 || pending) return;
  const el = e.target instanceof Element ? e.target : null;
  if (!el || el.closest(SKIP)) return;
  const pressable = el.closest(PRESSABLE);
  if (!pressable) return;
  pending = { x: e.clientX, y: e.clientY, at: performance.now(), id: e.pointerId };
}

function onMove(e: PointerEvent) {
  if (!pending || e.pointerId !== pending.id) return;
  if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > DRAG_PX) pending = null;
}

function onUp(e: PointerEvent) {
  lastPointerAt = performance.now();
  const p = pending;
  pending = null;
  if (!p || !e.isTrusted || e.pointerId !== p.id) return;
  if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_PX) return;
  if (performance.now() - p.at > TAP_MAX_MS) return;
  tapFeedback();
}

function onCancel() {
  pending = null;
}

/** Enter/Space activation has no pointer events (detail === 0). Mouse and
 *  touch activations were already handled on pointerup. */
function onClick(e: MouseEvent) {
  if (!e.isTrusted || e.detail !== 0) return;
  const el = e.target instanceof Element ? e.target : null;
  if (!el || el.closest(SKIP)) return;
  if (el.closest(PRESSABLE)) tapFeedback();
}

/** Install once at boot, before React mounts. Idempotent under StrictMode. */
export function installTapFeedback() {
  if (installed) return;
  installed = true;
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("pointermove", onMove, true);
  document.addEventListener("pointerup", onUp, true);
  document.addEventListener("pointercancel", onCancel, true);
  document.addEventListener("click", onClick, true);
}
