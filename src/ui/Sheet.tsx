import { useEffect, useRef } from "react";
import { SHEET_ARM } from "../lib/pull";

/** Accessible dialog: centered panel on desktop, bottom sheet on phones. */
export function Sheet({
  open,
  onClose,
  label,
  children,
  wide = false,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // The drag timer outlives a render, and `onClose` is replaced by callers that
  // pass an inline arrow; a ref keeps the latest one without re-binding.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("is-locked");
    requestAnimationFrame(() => panel.current?.focus({ preventScroll: true }));
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("is-locked");
      prev?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  /**
   * Pull the card down from its top edge to close it.
   *
   * A word card can be twice as tall as the screen, so "scroll to the top" is
   * already a journey; once there, dragging further down is the fastest way
   * out and matches every other sheet on the phone. The panel follows the
   * finger and falls back if the pull was a mistake.
   *
   * This is the one place that has to cancel the browser's own scroll: the
   * `.sheet` scroller would otherwise swallow the gesture as overscroll. The
   * listener is therefore registered by hand — React's touch listeners are
   * passive and cannot preventDefault.
   */
  useEffect(() => {
    if (!open) return;
    const el = panel.current;
    const fr = frame.current;
    const rt = root.current;
    if (!el || !fr || !rt) return;
    let y0 = 0;
    let dy = 0;
    let tracking = false;
    let drag = false;
    let timer: number | undefined;

    const settle = () => {
      fr.classList.remove("is-dragging");
      fr.style.transition = "";
      fr.style.transform = "";
      fr.style.opacity = "";
      rt.classList.remove("is-closing");
      rt.style.removeProperty("--drag");
      drag = false;
    };

    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      // Only a card already at its top edge can be pulled down; anywhere else
      // the finger belongs to the entry's own scrolling.
      if (el.scrollTop > 0) return;
      y0 = e.touches[0].clientY;
      dy = 0;
      tracking = true;
    };

    const move = (e: TouchEvent) => {
      if (!tracking) return;
      if (e.touches.length !== 1) {
        tracking = false;
        settle();
        return;
      }
      dy = e.touches[0].clientY - y0;
      // Upward means the reader wants the rest of the card: hand it back.
      if (dy <= 0 || el.scrollTop > 0) {
        tracking = false;
        settle();
        return;
      }
      if (e.cancelable) e.preventDefault();
      if (!drag) {
        drag = true;
        fr.classList.add("is-dragging");
        fr.style.transition = "none";
      }
      fr.style.transform = `translateY(${dy}px)`;
      rt.style.setProperty("--drag", String(Math.min(0.55, dy / 620)));
    };

    const end = () => {
      if (!tracking) return;
      tracking = false;
      if (!drag) return;
      if (dy < SHEET_ARM) {
        settle();
        return;
      }
      // Far enough: let the card fall out of the way, then unmount it. The
      // timeout is shorter than the transition on purpose — by then the card is
      // already past the bottom edge and the dismissal reads as instant.
      // The scrim fades out with it; clearing `--drag` here instead would
      // bring it back to full strength for the fall.
      fr.style.transition =
        "transform 0.2s cubic-bezier(0.4, 0, 1, 1), opacity 0.18s";
      fr.style.transform = "translateY(102%)";
      fr.style.opacity = "0";
      rt.classList.add("is-closing");
      timer = window.setTimeout(() => closeRef.current(), 170);
    };

    /** A cancelled touch is not a dismissal: the card goes back where it was. */
    const cancel = () => {
      tracking = false;
      if (drag) settle();
    };

    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", cancel);
      window.clearTimeout(timer);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="sheet-root"
      ref={root}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`sheet-frame ${wide ? "sheet-wide" : ""}`} ref={frame}>
        <div
          ref={panel}
          className={`sheet ${className}`}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
        >
          <span className="sheet-grip" aria-hidden="true" />
          {children}
        </div>
      </div>
    </div>
  );
}
