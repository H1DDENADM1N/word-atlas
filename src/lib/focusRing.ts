/**
 * Focus rings for keyboard users, and only for them.
 *
 * `:focus-visible` is a heuristic, and Chromium's version of it counts *any*
 * key press as keyboard navigation: moving focus to the 继续 button after a
 * spelling answer therefore painted the orange ring around a button the
 * learner had never tabbed to — on a phone the "key" was Enter on the soft
 * keyboard. Only Tab is real keyboard navigation, so only Tab arms the ring;
 * every tap disarms it. The styles live next to the base `:focus-visible`
 * rule in app.css.
 */
export function installFocusRing() {
  const root = document.documentElement;
  const set = (mode: "key" | "pointer") => {
    if (root.dataset.focusRing !== mode) root.dataset.focusRing = mode;
  };
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Tab") set("key");
    },
    true,
  );
  window.addEventListener("pointerdown", () => set("pointer"), true);
}
