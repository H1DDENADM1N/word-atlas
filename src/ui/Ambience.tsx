import {
  AudioLines,
  Bell,
  BookOpen,
  Bug,
  Check,
  CloudDrizzle,
  CloudRain,
  CloudRainWind,
  Coffee,
  Disc3,
  Droplet,
  Droplets,
  Fish,
  Flame,
  Guitar,
  Lamp,
  Leaf,
  Music,
  Music2,
  Music3,
  Music4,
  Piano,
  Sailboat,
  Sparkles,
  Tent,
  TrainFront,
  TreePine,
  Trees,
  VolumeX,
  Waves,
  Wind,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AMBIENCE, type AmbienceId } from "../lib/ambience";
import { isShell } from "../lib/native";
import { primeCues, setAmbience, setAppActive } from "../lib/sound";
import { store, useStore } from "../store/store";

const ICONS: Record<AmbienceId, typeof CloudRain> = {
  stars: Sparkles,
  rain: CloudRain,
  sea: Waves,
  forest: Trees,
  fire: Flame,
  voyage: Sailboat,
  cafe: Coffee,
  brown: Droplet,
  musicbox: Music,
  guzheng: Music4,
  "crickets-night": Bug,
  "rain-window": CloudDrizzle,
  stream: Droplets,
  "rain-forest": CloudRainWind,
  bamboo: TreePine,
  frogs: Fish,
  cicadas: Leaf,
  "winter-wind": Wind,
  campfire: Tent,
  train: TrainFront,
  library: BookOpen,
  chimes: Bell,
  "piano-study": Piano,
  "piano-clouds": Music2,
  "lofi-study": Disc3,
  "lofi-lamp": Lamp,
  "bamboo-flute": Music3,
  guqin: AudioLines,
  guitar: Guitar,
  harp: Music3,
};

/** Keeps the ambience in sync with settings; browsers only allow audio after a user gesture. */
export function AmbienceController() {
  const ambience = useStore((s) => s.settings.ambience);
  const volume = useStore((s) => s.settings.ambienceVolume);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    // The APK disables setMediaPlaybackRequiresUserGesture, so the ambience can
    // come back by itself after a cold start — no tap needed. Browsers still
    // require a gesture before an AudioContext may start.
    if (isShell) {
      primeCues();
      setArmed(true);
      return;
    }
    const arm = () => {
      primeCues();
      setArmed(true);
    };
    window.addEventListener("pointerdown", arm, { once: true });
    window.addEventListener("keydown", arm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);
  useEffect(() => {
    if (armed) void setAmbience(ambience === "off" ? null : ambience, volume);
  }, [armed, ambience, volume]);

  // Leaving the app fades the loop out and stops it; coming back rebuilds it
  // at the same spot and fades in. Inside the APK the shell drives this from
  // onPause/onResume, because WebView does not reliably change
  // document.visibilityState with the activity. Browsers use visibilitychange.
  useEffect(() => {
    const pause = () => setAppActive(false);
    const resume = () => setAppActive(true);
    const onVisible = () => setAppActive(document.visibilityState === "visible");
    window.addEventListener("wa:pause", pause);
    window.addEventListener("wa:resume", resume);
    if (!isShell) document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("wa:pause", pause);
      window.removeEventListener("wa:resume", resume);
      if (!isShell) document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}

export function AmbiencePicker() {
  const [open, setOpen] = useState(false);
  const ambience = useStore((s) => s.settings.ambience);
  const volume = useStore((s) => s.settings.ambienceVolume);
  const box = useRef<HTMLDivElement>(null);
  const chosen = useRef<HTMLButtonElement>(null);
  /** On a phone the popover is wider than the space right of the button, so it
   *  is pinned to the viewport and clamped instead of hanging off the screen. */
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      if (!window.matchMedia("(max-width: 559px)").matches) {
        setPos(null);
        return;
      }
      const r = box.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(340, window.innerWidth - 24);
      const left = Math.min(Math.max(12, r.right - width), window.innerWidth - 12 - width);
      setPos({ top: r.bottom + 10, left, width });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);
  // With thirty tracks the chosen one can be well below the fold; open the list
  // where the learner left it rather than at the top every time. Scrolling is
  // done on the list itself — `scrollIntoView` would drag the page along too.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      const list = box.current?.querySelector<HTMLElement>(".amb-scroll");
      const el = chosen.current;
      if (!list || !el) return;
      const r = el.getBoundingClientRect();
      const s = list.getBoundingClientRect();
      list.scrollTop += r.top - s.top - (s.height - r.height) / 2;
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);
  const on = ambience !== "off";
  const current = AMBIENCE.find((a) => a.id === ambience);
  return (
    <div className="amb" ref={box}>
      <button
        className={`icon-btn amb-btn ${on ? "is-on" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={on ? `环境声：${current?.label ?? ""}` : "环境声：安静"}
        title={on ? `环境声：${current?.label ?? ""}` : "环境声"}
      >
        <AudioLines size={19} />
        {on && (
          <span className="amb-bars" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
      </button>
      {open && (
        <div
          className={`amb-pop ${pos ? "is-pinned" : ""}`}
          role="dialog"
          aria-label="环境声"
          style={pos ? { top: pos.top, left: pos.left, width: pos.width } : undefined}
        >
          <p className="eyebrow">环境声 · 专注陪伴</p>
          <div className="amb-scroll">
            <ul className="amb-grid">
              {AMBIENCE.map(({ id, label }) => {
                const Icon = ICONS[id];
                const sel = ambience === id;
                return (
                  <li key={id}>
                    <button
                      ref={sel ? chosen : undefined}
                      className={sel ? "is-on" : ""}
                      onClick={() => store.settings({ ambience: sel ? "off" : id })}
                      aria-pressed={sel}
                    >
                      <Icon size={17} strokeWidth={1.7} />
                      <span>{label}</span>
                      {sel && <Check size={14} className="amb-check" />}
                    </button>
                  </li>
                );
              })}
              <li>
                <button className={!on ? "is-on" : ""} onClick={() => store.settings({ ambience: "off" })} aria-pressed={!on}>
                  <VolumeX size={17} strokeWidth={1.7} />
                  <span>安静</span>
                  {!on && <Check size={14} className="amb-check" />}
                </button>
              </li>
            </ul>
          </div>
          <label className="amb-vol">
            <span>音量</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => store.settings({ ambienceVolume: Number(e.target.value) })}
              disabled={!on}
            />
          </label>
          <p className="amb-note">读单词时会自动压低环境声。</p>
        </div>
      )}
    </div>
  );
}
