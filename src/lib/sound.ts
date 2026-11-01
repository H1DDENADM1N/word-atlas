/**
 * Sound design: short UI cues and looping ambience, played through Web Audio so
 * loops are gapless and the ambience can duck under pronunciations.
 */
import { embedded } from "../atlas/embedded";
import { AMBIENCE, trim, type AmbienceId } from "./ambience";

const BASE = `${import.meta.env.BASE_URL}sfx/`;

export type Cue = "correct" | "wrong" | "flip" | "page" | "complete" | "streak" | "start" | "tap" | "key" | "twinkle" | "fly" | "ignite";
export { AMBIENCE, type AmbienceId };

const CUE_GAIN: Record<Cue, number> = {
  correct: 0.55,
  wrong: 0.5,
  flip: 0.45,
  page: 0.4,
  complete: 0.6,
  streak: 0.5,
  start: 0.5,
  tap: 0.3,
  key: 0.18,
  twinkle: 0.22,
  fly: 0.4,
  ignite: 0.45,
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** Decoded cues are tiny and there are a dozen of them, so they stay. */
const buffers = new Map<string, Promise<AudioBuffer | null>>();

/**
 * Decoded ambience is *not* tiny: a three-minute stereo loop is roughly 60 MB
 * as Float32, and there are thirty tracks. Keeping them all would exhaust a
 * phone's WebView, so only the last couple are held — enough to make flipping
 * between two tracks instant, not enough to accumulate.
 */
const ambBuffers = new Map<string, Promise<AudioBuffer | null>>();
const AMB_KEEP = 2;

function audio() {
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function decodeInline(text: string): ArrayBuffer {
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Fetch and decode one file, with no caching policy of its own. */
function decode(file: string) {
  const c = audio();
  if (!c) return Promise.resolve(null);
  // In the APK the page runs from `file://`, where `fetch()` is blocked: the
  // cues are already in `data.js`, and each ambience loop is its own script.
  const bytes = embedded()
    ? payload(file).then((b64) => (b64 ? decodeInline(b64) : null))
    : fetch(BASE + file)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
  return bytes
    .then((b) => (b ? c.decodeAudioData(b) : null))
    .catch(() => null);
}

/**
 * The base64 for one sound, from the APK.
 *
 * Cues are in `data.js` and cost nothing. Ambience is one script per track,
 * added only when that track is chosen — a 2 MB string that is parsed once and
 * then released, so browsing the list never pays for thirty loops.
 */
const payloads = new Map<string, Promise<string | null>>();

function payload(file: string): Promise<string | null> {
  const inline = embedded()?.sfx[file];
  if (inline) return Promise.resolve(inline);
  const pending = payloads.get(file);
  if (pending) return pending;
  const p = new Promise<string | null>((resolve) => {
    const s = document.createElement("script");
    s.src = `${BASE}${file}.js`;
    s.onload = () => {
      const store = (window as unknown as { __WA_SFX?: Record<string, string> }).__WA_SFX;
      const value = store?.[file] ?? null;
      // Hand the string to the promise and let the global go: the decoded
      // buffer is what gets reused, not the base64.
      if (store) delete store[file];
      resolve(value);
    };
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  }).finally(() => payloads.delete(file));
  payloads.set(file, p);
  return p;
}

function load(file: string) {
  let p = buffers.get(file);
  if (!p) {
    p = decode(file);
    buffers.set(file, p);
  }
  return p;
}

function loadAmb(file: string) {
  let p = ambBuffers.get(file);
  if (!p) {
    p = decode(file);
    // Re-insert so the map's order stays least-recently-used first.
    ambBuffers.delete(file);
    ambBuffers.set(file, p);
    while (ambBuffers.size > AMB_KEEP) {
      const oldest = ambBuffers.keys().next().value as string;
      if (oldest === file) break;
      ambBuffers.delete(oldest);
    }
  }
  return p;
}

/** Warm the cue buffers after the first user gesture so the first answer isn't silent. */
export function primeCues() {
  (Object.keys(CUE_GAIN) as Cue[]).forEach((c) => void load(`${c}.mp3`));
}

/** Fetch and decode files ahead of time (decoding works before the first user gesture). */
export function preloadFiles(files: string[]) {
  files.forEach((f) => void load(f));
}

/** Play any file from the sound folder; call from a user gesture so audio is allowed. */
export async function playFile(file: string, gain = 0.6, delay = 0) {
  const c = audio();
  if (!c || !master) return;
  const buf = await load(file);
  if (!buf) return;
  const src = c.createBufferSource();
  const g = c.createGain();
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(g).connect(master);
  src.start(c.currentTime + delay);
}

export async function cue(name: Cue) {
  const c = audio();
  if (!c || !master) return;
  const buf = await load(`${name}.mp3`);
  if (!buf) return;
  const src = c.createBufferSource();
  const g = c.createGain();
  g.gain.value = CUE_GAIN[name];
  src.buffer = buf;
  src.connect(g).connect(master);
  src.start();
}

/* ---------- ambience ---------- */

let amb: { id: AmbienceId; src: AudioBufferSourceNode; gain: GainNode } | null = null;
let ambVolume = 0.5;
let ducked = false;
/** What the last call actually asked for; a slow fetch must not win a later one. */
let wanted: AmbienceId | null = null;
const level = () => ambVolume * (ducked ? 0.35 : 1) * 0.9 * trim(amb?.id);

function fadeTo(g: GainNode, v: number, seconds: number) {
  const c = ctx!;
  g.gain.cancelScheduledValues(c.currentTime);
  g.gain.setValueAtTime(g.gain.value, c.currentTime);
  g.gain.linearRampToValueAtTime(v, c.currentTime + seconds);
}

export async function setAmbience(id: AmbienceId | null, volume = ambVolume) {
  ambVolume = volume;
  wanted = id;
  if (amb && amb.id === id) {
    fadeTo(amb.gain, level(), 0.4);
    return;
  }
  const old = amb;
  amb = null;
  if (old) {
    fadeTo(old.gain, 0, 1.2);
    old.src.stop(ctx!.currentTime + 1.3);
  }
  if (!id) return;
  const c = audio();
  if (!c || !master) return;
  const buf = await loadAmb(`amb-${id}.mp3`);
  // The track can be 400 KB over the network: by the time it arrives the
  // learner may have picked another one, or gone quiet.
  if (!buf || amb || wanted !== id) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  // Skip the decoder's padding at both ends so the loop is seamless.
  src.loopStart = 0.06;
  src.loopEnd = buf.duration - 0.06;
  const gain = c.createGain();
  gain.gain.value = 0;
  src.connect(gain).connect(master);
  src.start(0, 0.06);
  amb = { id, src, gain };
  fadeTo(gain, level(), 2);
}

/** Lower the ambience while a word or sentence is being spoken. */
export function duck(on: boolean) {
  ducked = on;
  if (amb) fadeTo(amb.gain, level(), on ? 0.15 : 0.6);
}

export const ambienceId = () => amb?.id ?? null;
