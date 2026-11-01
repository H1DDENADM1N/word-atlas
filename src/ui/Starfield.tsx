import { useEffect, useRef } from "react";
import { isSkin, useStore } from "../store/store";

/**
 * The night sky behind the whole app.
 *
 * Only the two skin themes get a canvas: 星光 is defined by its stars, and a
 * repeating CSS tile of dots cannot give them parallax, twinkle or the odd
 * shooting star. Three depth layers drift at different speeds, so turning the
 * phone or scrolling the page makes the sky feel further away than the paper.
 *
 * Drawing stops when the tab is hidden, and reduced-motion users get one
 * still frame instead of a loop.
 */
export function Starfield() {
  const theme = useStore((s) => s.settings.theme);
  const canvas = useRef<HTMLCanvasElement>(null);
  const skin = isSkin(theme) ? theme : null;

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !skin) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const warm = skin === "starlight";
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let t0 = performance.now();
    let streak: { at: number; from: [number, number]; to: [number, number]; life: number } | null = null;
    let nextStreak = 6000 + Math.random() * 9000;

    type Star = { x: number; y: number; r: number; a: number; phase: number; rate: number; layer: number };
    let stars: Star[] = [];

    const seed = () => {
      // One star per ~7000 px², weighted toward the small end so the sky reads
      // as depth rather than as a dot pattern.
      const count = Math.round((w * h) / 7000);
      stars = Array.from({ length: count }, () => {
        const layer = Math.random() < 0.55 ? 0 : Math.random() < 0.75 ? 1 : 2;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          r: (layer === 2 ? 1.15 : layer === 1 ? 0.85 : 0.6) * (0.6 + Math.random() * 0.8),
          a: 0.35 + Math.random() * 0.5,
          phase: Math.random() * Math.PI * 2,
          rate: 0.5 + Math.random() * 1.6,
          layer,
        };
      });
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const palette = warm ? [255, 244, 224] : [214, 232, 255];

    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      for (const s of stars) {
        // Parallax: nearer layers slide further as the page moves.
        const drift = s.layer * 0.6;
        const x = (s.x + t * drift * 1.4) % w;
        const y = (s.y + Math.sin(t * 0.12 + s.phase) * s.layer * 0.8 + h) % h;
        const tw = reduced ? 1 : 0.62 + 0.38 * Math.sin(t * s.rate + s.phase);
        const a = s.a * tw;
        if (s.layer === 2) {
          // The few bright stars get a halo, which is what makes a sky glow.
          const g = ctx.createRadialGradient(x, y, 0, x, y, s.r * 6);
          g.addColorStop(0, `rgba(${palette[0]},${palette[1]},${palette[2]},${a * 0.9})`);
          g.addColorStop(0.45, `rgba(${palette[0]},${palette[1]},${palette[2]},${a * 0.18})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, s.r * 6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = `rgba(${palette[0]},${palette[1]},${palette[2]},${a})`;
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduced) {
        if (!streak && now - t0 > nextStreak) {
          const from: [number, number] = [w * (0.1 + Math.random() * 0.6), -20];
          const len = 120 + Math.random() * 160;
          streak = { at: now, from, to: [from[0] + len, from[1] + len * 0.55], life: 1100 };
        }
        if (streak) {
          const p = (now - streak.at) / streak.life;
          if (p >= 1) {
            streak = null;
            nextStreak = now - t0 + 9000 + Math.random() * 16000;
          } else {
            const head = [streak.from[0] + (streak.to[0] - streak.from[0]) * p, streak.from[1] + (streak.to[1] - streak.from[1]) * p];
            const tailP = Math.max(0, p - 0.18);
            const tail = [streak.from[0] + (streak.to[0] - streak.from[0]) * tailP, streak.from[1] + (streak.to[1] - streak.from[1]) * tailP];
            const grad = ctx.createLinearGradient(tail[0], tail[1], head[0], head[1]);
            const fade = Math.sin(Math.PI * p) * 0.85;
            grad.addColorStop(0, "rgba(255,248,235,0)");
            grad.addColorStop(1, `rgba(255,248,235,${fade})`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.6;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(tail[0], tail[1]);
            ctx.lineTo(head[0], head[1]);
            ctx.stroke();
          }
        }
      }
      ctx.globalCompositeOperation = "source-over";
    };

    resize();
    if (reduced) {
      draw(performance.now());
      return () => cancelAnimationFrame(raf);
    }

    const loop = (now: number) => {
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => {
      resize();
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [skin]);

  if (!skin) return null;
  return <canvas className="starfield" ref={canvas} aria-hidden="true" />;
}
