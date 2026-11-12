import { Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { isPullDown, pullOffset, pullProgress, PULL_ARM } from "../lib/pull";

/**
 * Elements that own a vertical drag themselves. The star map pans under the
 * finger and a sheet already handles its own pull, so a page-level pull must
 * not steal those gestures.
 */
const OWNS_THE_DRAG =
  "canvas, .galaxy-panel, .galaxy-full, .sheet-root, [data-no-pull]";

/**
 * Pull-down-at-the-top to search.
 *
 * The three root tabs (今日 / 图鉴 / 我的) are long pages, and the search field
 * is at the top — on a phone that means scrolling all the way back before you
 * can type. Dragging down while already at the top raises the palette instead,
 * with a hint pill that emerges from under the header so the gesture is
 * discoverable the first time it happens by accident.
 *
 * The gesture is deliberately passive: at `scrollY === 0` a downward drag has
 * nothing to scroll, so there is no scroll to cancel and no `preventDefault`
 * that could fight the WebView. The action fires on release, never mid-drag,
 * so a pull that changes its mind can simply be let go.
 */
export function PullToSearch({
  enabled,
  onOpen,
}: {
  enabled: boolean;
  onOpen: () => void;
}) {
  const hint = useRef<HTMLDivElement>(null);
  // The listeners are attached once; a ref keeps them reading the latest props
  // instead of being torn down and rebuilt on every render.
  const latest = useRef({ enabled, onOpen });
  latest.current = { enabled, onOpen };

  useEffect(() => {
    const el = hint.current;
    if (!el) return;
    let x0 = 0;
    let y0 = 0;
    let dy = 0;
    let tracking = false;
    let painted = false;

    /** Follow the finger 1:1 while the drag is live (no easing, no lag). */
    const paint = () => {
      el.style.setProperty("--pull", String(pullOffset(dy)));
      el.style.setProperty("--pull-p", String(pullProgress(dy)));
      el.dataset.armed = dy >= PULL_ARM ? "1" : "";
    };

    /** Let the pill fall back under the header with its own transition. */
    const settle = () => {
      tracking = false;
      el.style.transition = "";
      el.style.removeProperty("--pull");
      el.style.removeProperty("--pull-p");
      delete el.dataset.armed;
      painted = false;
    };

    const start = (e: TouchEvent) => {
      if (!latest.current.enabled || e.touches.length !== 1) return;
      if (window.scrollY > 0) return;
      if ((e.target as Element | null)?.closest?.(OWNS_THE_DRAG)) return;
      const t = e.touches[0];
      x0 = t.clientX;
      y0 = t.clientY;
      dy = 0;
      tracking = true;
    };

    const move = (e: TouchEvent) => {
      if (!tracking) return;
      if (e.touches.length !== 1) return settle();
      // A pull that turned into a scroll belongs to the scroller, not to us.
      if (window.scrollY > 0) return settle();
      const t = e.touches[0];
      dy = t.clientY - y0;
      if (!isPullDown(t.clientX - x0, dy)) {
        // Sideways drags through the chips, or a scroll back up the page.
        if (dy <= 0 || Math.abs(t.clientX - x0) > 12) settle();
        return;
      }
      if (!painted) {
        el.style.transition = "none";
        painted = true;
      }
      paint();
    };

    const end = () => {
      if (!tracking) return;
      const armed = dy >= PULL_ARM;
      const open = latest.current.onOpen;
      settle();
      if (armed) open();
    };

    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end, { passive: true });
    // A cancelled touch (a system gesture took over) is not a release: put the
    // pill back without opening anything.
    window.addEventListener("touchcancel", settle, { passive: true });
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", settle);
    };
  }, []);

  return (
    <div className="pull-hint" ref={hint} aria-hidden="true">
      <Search size={14} />
      <span className="pull-hint-idle">下拉搜索</span>
      <span className="pull-hint-armed">松开搜索</span>
    </div>
  );
}
