import { Crosshair, Minus, Plus, RotateCcw, Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAtlas } from "../atlas/context";
import type { WordRef } from "../atlas/types";
import { openWord } from "../lib/router";
import { cue, playFile } from "../lib/sound";
import { isMastered } from "../store/srs";
import { store, useStore } from "../store/store";
import { Illustration } from "../ui/Illustration";
import { LIT_AT } from "./constellation";
import { detectQuality, GalaxyEngine } from "./engine";
import { layoutGalaxy, TOPIC_COLORS, type GalaxyLayout } from "./layout";
import { shareGalaxy } from "./share";

const layouts = new WeakMap<object, GalaxyLayout>();
export function useGalaxyLayout() {
  const atlas = useAtlas();
  return useMemo(() => {
    let l = layouts.get(atlas);
    if (!l) {
      l = layoutGalaxy(atlas);
      layouts.set(atlas, l);
    }
    return l;
  }, [atlas]);
}

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Brightness of every star from the learner's memory state. */
function starStates(layout: GalaxyLayout, cards: Record<string, { st: number; s: number } | undefined>, highlight?: Set<string>) {
  const out = new Float32Array(layout.n);
  layout.ids.forEach((id, i) => {
    if (highlight?.has(id)) out[i] = 3;
    else {
      const c = cards[id];
      out[i] = c ? (isMastered(c as never) ? 2 : 1) : 0;
    }
  });
  return out;
}

export function Galaxy({
  mode = "full",
  highlight,
  ignite,
  className = "",
  focus,
  focusTopic,
  constellationStat,
}: {
  mode?: "full" | "mini";
  /** Words to show as today's gold stars. */
  highlight?: string[];
  /** Light the highlighted stars one by one (session summary). */
  ignite?: boolean;
  className?: string;
  /** Fly to this word once ready. */
  focus?: string | null;
  /** Fly to this topic's constellation. */
  focusTopic?: number | null;
  /** Lit constellations, for the HUD counter. */
  constellationStat?: { lit: number; total: number };
}) {
  const atlas = useAtlas();
  const layout = useGalaxyLayout();
  const cards = useStore((s) => s.progress.cards);
  const canvas = useRef<HTMLCanvasElement>(null);
  const lineCanvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<GalaxyEngine | null>(null);
  const labels = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ ref: WordRef; x: number; y: number } | null>(null);
  const [fallback, setFallback] = useState(false);
  const highlightSet = useMemo(() => new Set(highlight ?? []), [highlight]);

  // Which topics are lit, how far each figure is drawn, and which one the panel
  // has selected — the only figures worth painting, so the sky stays readable.
  const progress = useMemo(() => {
    const totals = new Array(atlas.topics.length).fill(0);
    const done = new Array(atlas.topics.length).fill(0);
    for (const w of atlas.words) {
      totals[w.topic]++;
      if (cards[w.id]) done[w.topic]++;
    }
    return totals.map((t, i) => {
      const need = Math.ceil(t * LIT_AT);
      return { lit: t > 0 && done[i] >= need, drawn: need ? Math.min(1, done[i] / need) : 0 };
    });
  }, [atlas, cards]);
  const litTopics = useMemo(() => progress.map((p) => p.lit), [progress]);
  const litRef = useRef(litTopics);
  litRef.current = litTopics;
  const focusTopicRef = useRef(focusTopic);
  focusTopicRef.current = focusTopic ?? null;

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const eng = new GalaxyEngine(cv, layout, {
      quality: detectQuality(),
      reducedMotion: reduced(),
      preserve: mode === "full",
      autoRotate: mode === "mini" ? 0.06 : 0.025,
    });
    engine.current = eng;
    setFallback(!eng.webgl);
    eng.resize();
    if (mode === "mini") eng.cam.dist = eng.baseDist() * 1.1;
    const overlay = lineCanvas.current;
    const g2 = overlay?.getContext("2d") ?? null;
    let ow = 0;
    let oh = 0;
    let odpr = 1;
    const sizeOverlay = () => {
      if (!overlay) return;
      const r = cv.getBoundingClientRect();
      ow = r.width;
      oh = r.height;
      odpr = Math.min(window.devicePixelRatio || 1, 2);
      overlay.width = Math.round(ow * odpr);
      overlay.height = Math.round(oh * odpr);
    };
    const ro = new ResizeObserver(() => {
      eng.resize();
      sizeOverlay();
    });
    ro.observe(cv);
    sizeOverlay();
    // Only animate while visible.
    const io = new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? eng.start() : eng.stop()));
    io.observe(cv);
    const vis = () => (document.hidden ? eng.stop() : eng.start());
    document.addEventListener("visibilitychange", vis);
    if (mode === "full") {
      eng.onFrame = () => {
        const box = labels.current;
        if (box) {
          const kids = box.children as HTMLCollectionOf<HTMLElement>;
          layout.topicCenters.forEach(([x, y, z], t) => {
            const el = kids[t];
            const p = eng.toScreen(x, y, z);
            if (!el) return;
            if (!p) {
              el.style.opacity = "0";
              return;
            }
            el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
            el.style.opacity = String(Math.max(0, Math.min(0.9, 3.4 - p.depth)));
          });
        }
        // Constellations: the lit ones, and the one being inspected.
        if (g2 && overlay) {
          g2.setTransform(odpr, 0, 0, odpr, 0, 0);
          g2.clearRect(0, 0, ow, oh);
          g2.lineCap = "round";
          const sel = focusTopicRef.current;
          if (layout.topicPaths.some((_, t) => litRef.current[t] || sel === t)) {
            // `vp` is already current: the engine rebuilds it just before this
            // callback, so `projectPoint` needs nothing else.
            layout.topicPaths.forEach((pts, t) => {
              const on = litRef.current[t];
              const isSel = sel === t;
              if (!on && !isSel) return;
              const links = layout.topicLinks[t];
              if (!pts.length || !links.length) return;
              const color = on ? "#ffd998" : TOPIC_COLORS[t % TOPIC_COLORS.length];
              const fade = isSel ? 1 : 0.72;
              const at = (i: number) => eng.projectPoint(pts[i][0], pts[i][1], pts[i][2]);

              const path = () => {
                g2.beginPath();
                for (const [i, j] of links) {
                  const a = at(i);
                  const b = at(j);
                  if (a.depth <= 0.02 || b.depth <= 0.02) continue;
                  g2.moveTo(a.x, a.y);
                  g2.lineTo(b.x, b.y);
                }
              };

              if (on) {
                // Lit: one solid gold figure with a soft bloom under it.
                path();
                g2.strokeStyle = "#ffb85c";
                g2.lineWidth = 6;
                g2.globalAlpha = 0.14 * fade;
                g2.stroke();
                g2.strokeStyle = color;
                g2.lineWidth = 1.6;
                g2.globalAlpha = 0.95 * fade;
                g2.stroke();
              } else {
                // Unlit: dotted, in the topic's own colour — the same single
                // style the card uses, so a figure is never half dashed and
                // half solid.
                path();
                g2.setLineDash([1.2, 4.2]);
                g2.strokeStyle = color;
                g2.lineWidth = 1;
                g2.globalAlpha = (isSel ? 0.72 : 0.4) * fade;
                g2.stroke();
                g2.setLineDash([]);
              }

              // A halo and a core dot on each vertex, so the figure reads as
              // "these stars", not as a wireframe floating in front of them.
              const r = on ? 1.9 : 1.4;
              g2.fillStyle = color;
              g2.globalAlpha = (on ? 0.22 : 0.16) * fade;
              g2.beginPath();
              for (let i = 0; i < pts.length; i++) {
                const q = at(i);
                if (q.depth <= 0.02) continue;
                g2.moveTo(q.x + r * 2.9, q.y);
                g2.arc(q.x, q.y, r * 2.9, 0, Math.PI * 2);
              }
              g2.fill();
              g2.globalAlpha = fade;
              g2.beginPath();
              for (let i = 0; i < pts.length; i++) {
                const q = at(i);
                if (q.depth <= 0.02) continue;
                g2.moveTo(q.x + r, q.y);
                g2.arc(q.x, q.y, r, 0, Math.PI * 2);
              }
              g2.fill();
            });
            g2.globalAlpha = 1;
          }
        }
      };
    }
    return () => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
      eng.destroy();
      engine.current = null;
    };
  }, [layout, mode]);

  // Brightness follows memory state; in ignite mode today's stars start dark.
  useEffect(() => {
    const eng = engine.current;
    if (!eng) return;
    const states = starStates(layout, cards, ignite ? undefined : highlightSet);
    if (ignite) highlightSet.forEach((id) => {
      const i = layout.index.get(id);
      if (i !== undefined) states[i] = 0;
    });
    eng.setStates(states);
  }, [layout, cards, highlightSet, ignite]);

  // Session summary: stars light up one after another, then a soft voice line.
  useEffect(() => {
    const eng = engine.current;
    if (!eng || !ignite || !highlightSet.size) return;
    const ids = [...highlightSet].filter((id) => layout.index.has(id));
    eng.frameStars(ids.map((id) => layout.index.get(id)!));
    eng.autoRotate = 0.02;
    const sfx = store.get().settings.sfx;
    const timers = ids.map((id, k) =>
      window.setTimeout(() => {
        eng.setState(layout.index.get(id)!, 3);
        if (sfx && k < 12) void cue("ignite");
      }, 1400 + k * 180),
    );
    const voice = window.setTimeout(() => sfx && void playFile("voice-galaxy-lit.mp3", 0.9), 1600 + ids.length * 180);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(voice);
    };
  }, [ignite, highlightSet, layout]);

  useEffect(() => {
    if (!focus) return;
    const i = layout.index.get(focus);
    if (i !== undefined) {
      engine.current?.flyTo(i);
      if (store.get().settings.sfx) void cue("fly");
    }
  }, [focus, layout]);

  // The constellation panel asked for a topic: frame its whole figure.
  useEffect(() => {
    if (focusTopic == null) return;
    const chain = layout.topicPaths[focusTopic];
    if (!chain?.length) return;
    engine.current?.flyToFigure(chain);
    if (store.get().settings.sfx) void cue("fly");
  }, [focusTopic, layout]);

  // First visit to the full galaxy: one quiet sentence explaining what it is.
  useEffect(() => {
    if (mode !== "full") return;
    try {
      if (localStorage.getItem("word-atlas:galaxy-hello")) return;
      localStorage.setItem("word-atlas:galaxy-hello", "1");
    } catch {
      return;
    }
    const t = window.setTimeout(() => store.get().settings.sfx && void playFile("voice-galaxy-hello.mp3", 0.9), 900);
    return () => clearTimeout(t);
  }, [mode]);

  /* ---------- interaction (full mode) ---------- */
  const drag = useRef<{ x: number; y: number; moved: number; pinch?: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastTwinkle = useRef(0);
  const dwell = useRef(0);
  useEffect(() => () => window.clearTimeout(dwell.current), []);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onMove = (e: React.PointerEvent) => {
    const eng = engine.current;
    if (!eng) return;
    const p = local(e);
    const ps = pointers.current;
    if (ps.has(e.pointerId)) {
      const prev = ps.get(e.pointerId)!;
      ps.set(e.pointerId, p);
      if (ps.size === 2) {
        const [a, b] = [...ps.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (drag.current?.pinch) eng.cam.dist = clampDist(eng.cam.dist * (drag.current.pinch / dist));
        if (drag.current) drag.current.pinch = dist;
        return;
      }
      if (drag.current) {
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        drag.current.moved += Math.abs(dx) + Math.abs(dy);
        // A drag is a rotation, not a tap on the star it started from.
        if (drag.current.moved > 8 && hover) setHover(null);
        eng.cam.yaw -= dx * 0.006;
        eng.cam.pitch = Math.max(0.12, Math.min(1.45, eng.cam.pitch + dy * 0.005));
      }
      return;
    }
    if (e.pointerType !== "mouse") return;
    // Only reveal a star once the cursor rests on it, so sweeping across the
    // galaxy doesn't flicker through dozens of cards (and sounds).
    const i = eng.pick(p.x, p.y);
    eng.hover = i;
    window.clearTimeout(dwell.current);
    if (i < 0) {
      dwell.current = window.setTimeout(() => setHover(null), 260);
      return;
    }
    const ref = atlas.words[i];
    if (hover?.ref.id === ref.id) return;
    dwell.current = window.setTimeout(() => {
      setHover({ ref, x: p.x, y: p.y });
      const now = performance.now();
      if (store.get().settings.sfx && now - lastTwinkle.current > 400) {
        lastTwinkle.current = now;
        void cue("twinkle");
      }
    }, 120);
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    drag.current = { ...local(e), moved: 0 };
  };

  const onUp = (e: React.PointerEvent) => {
    const eng = engine.current;
    const d = drag.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size) return;
    drag.current = null;
    if (!eng || !d || d.moved > 8) return;
    const p = local(e);
    const i = eng.pick(p.x, p.y, e.pointerType === "mouse" ? 16 : 26);
    if (i < 0) {
      // Tapping empty space dismisses the preview.
      if (hover) setHover(null);
      return;
    }
    const ref = atlas.words[i];
    // A tap on another star only moves the preview there; the same star — or
    // the same spot, since the core is dense enough that a fresh pick can land
    // on a neighbour — opens it. Without this, every tap after the first jumped
    // straight into a word card.
    const sameStar = !!hover && (hover.ref.id === ref.id || Math.hypot(p.x - hover.x, p.y - hover.y) < 28);
    if (e.pointerType !== "mouse" && !sameStar) {
      // The preview has to outlive the finger lift (see onPointerLeave): it used
      // to be set and cleared in the same frame, so no second tap could open.
      eng.hover = i;
      setHover({ ref, x: p.x, y: p.y });
      if (store.get().settings.sfx) void cue("twinkle");
      return;
    }
    // Open what the tip is showing when the tap confirms it, not whatever the
    // picker happened to land on next to it.
    const openId = sameStar ? hover!.ref.id : ref.id;
    eng.flyTo(layout.index.get(openId) ?? i);
    setHover(null);
    if (store.get().settings.sfx) void cue("fly");
    window.setTimeout(() => openWord(openId), 350);
  };

  const onWheel = (e: React.WheelEvent) => {
    const eng = engine.current;
    if (!eng) return;
    eng.cam.dist = clampDist(eng.cam.dist * Math.exp(e.deltaY * 0.0012));
  };

  useEffect(() => {
    // Wheel zoom must not scroll the page while over the galaxy.
    const cv = canvas.current;
    if (!cv || mode !== "full") return;
    const stop = (e: WheelEvent) => e.preventDefault();
    cv.addEventListener("wheel", stop, { passive: false });
    return () => cv.removeEventListener("wheel", stop);
  }, [mode]);

  const lit = useMemo(() => layout.ids.reduce((n, id) => n + (cards[id] ? 1 : 0), 0), [layout, cards]);

  if (mode === "mini")
    return (
      <div className={`galaxy galaxy-mini ${className}`}>
        <canvas ref={canvas} aria-hidden="true" />
        {fallback && <span className="galaxy-fallback" />}
      </div>
    );

  return (
    <div className={`galaxy galaxy-full ${className}`}>
      <canvas
        ref={canvas}
        onPointerMove={onMove}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={(e) => {
          // A touch pointer reports `pointerleave` the moment the finger lifts,
          // which wiped the preview in the same frame it appeared. Only a mouse
          // leaving the canvas should hide the tip.
          if (e.pointerType !== "mouse") return;
          if (engine.current) engine.current.hover = -1;
          setHover(null);
        }}
        onWheel={onWheel}
        role="img"
        aria-label={`词汇星图：${layout.n} 颗星，已点亮 ${lit} 颗。可拖动旋转、滚动缩放，选择星星查看词卡。`}
        tabIndex={0}
        onKeyDown={(e) => {
          const eng = engine.current;
          if (!eng) return;
          if (e.key === "ArrowLeft") eng.cam.yaw -= 0.12;
          if (e.key === "ArrowRight") eng.cam.yaw += 0.12;
          if (e.key === "ArrowUp") eng.cam.pitch = Math.min(1.45, eng.cam.pitch + 0.08);
          if (e.key === "ArrowDown") eng.cam.pitch = Math.max(0.12, eng.cam.pitch - 0.08);
          if (e.key === "+" || e.key === "=") eng.cam.dist = clampDist(eng.cam.dist * 0.85);
          if (e.key === "-") eng.cam.dist = clampDist(eng.cam.dist * 1.18);
        }}
      />
      <canvas className="galaxy-lines" ref={lineCanvas} aria-hidden="true" />
      <div className="galaxy-labels" ref={labels} aria-hidden="true">
        {atlas.topics.map(([key, name], t) => (
          <span key={key} style={{ "--c": TOPIC_COLORS[t % TOPIC_COLORS.length] } as React.CSSProperties}>
            {name}
          </span>
        ))}
      </div>
      {hover && (
        <div
          className="galaxy-tip"
          aria-hidden="true"
          style={{ transform: `translate(${Math.min(hover.x + 18, (canvas.current?.clientWidth ?? 0) - 260)}px, ${Math.max(8, hover.y - 46)}px)` }}
        >
          <Illustration src={atlas.img(hover.ref, "thumb")} word={hover.ref.word} topic={hover.ref.topic} />
          <span>
            <b lang="en">{hover.ref.word}</b>
            <small>{hover.ref.zh}</small>
          </span>
        </div>
      )}
      <div className="galaxy-hud">
        <p>
          <b>{lit.toLocaleString()}</b> / {layout.n.toLocaleString()} 颗星已点亮
        </p>
        {constellationStat && (
          <button
            className="galaxy-cstat"
            onClick={() => document.getElementById("topic-constellations")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            aria-label={`已点亮星座 ${constellationStat.lit} / ${constellationStat.total}，查看全部话题星座`}
          >
            已点亮星座 <b>{constellationStat.lit}</b> / {constellationStat.total}
          </button>
        )}
        <ul className="galaxy-legend" aria-hidden="true">
          <li>
            <i className="lg-dust" />
            未学
          </li>
          <li>
            <i className="lg-learning" />
            学习中
          </li>
          <li>
            <i className="lg-mastered" />
            较熟悉
          </li>
        </ul>
      </div>
      <div className="galaxy-controls">
        <button className="icon-btn" onClick={() => engine.current && (engine.current.cam.dist = clampDist(engine.current.cam.dist * 0.8))} aria-label="放大">
          <Plus size={18} />
        </button>
        <button className="icon-btn" onClick={() => engine.current && (engine.current.cam.dist = clampDist(engine.current.cam.dist * 1.25))} aria-label="缩小">
          <Minus size={18} />
        </button>
        <button
          className="icon-btn"
          onClick={() => {
            engine.current?.reset();
            engine.current?.replayIntro();
            if (store.get().settings.sfx) void cue("fly");
          }}
          aria-label="回到全景"
        >
          <RotateCcw size={17} />
        </button>
        <button
          className="icon-btn"
          onClick={() => {
            const ids = Object.keys(cards);
            const pick = ids[Math.floor(Math.random() * ids.length)] ?? atlas.words[0].id;
            const i = layout.index.get(pick);
            if (i !== undefined) {
              engine.current?.flyTo(i);
              if (store.get().settings.sfx) void cue("fly");
            }
          }}
          aria-label="随机查看已学单词"
        >
          <Crosshair size={17} />
        </button>
        <button className="icon-btn" onClick={() => canvas.current && shareGalaxy(canvas.current, lit, layout.n)} aria-label="分享我的星图">
          <Share2 size={17} />
        </button>
      </div>
      <p className="galaxy-hint">拖动旋转 · 缩放星图 · 选择星星查看词卡</p>
    </div>
  );
}

const clampDist = (d: number) => Math.max(0.35, Math.min(4.2, d));
