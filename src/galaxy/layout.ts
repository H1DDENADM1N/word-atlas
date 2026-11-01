import type { Atlas } from "../atlas/types";
import { hashSeed } from "../lib/text";
import { figuresFor, type TopicFigure } from "./constellation";

/** Nineteen star colours, one per IELTS topic, tuned to glow on deep navy. */
export const TOPIC_COLORS = [
  "#f2c46d", "#ef8f6b", "#8fd0c8", "#9fb8ff", "#9be38f", "#ff9fa8", "#f7d9a8", "#c6a7ff", "#ffd36b", "#7fc4ff",
  "#ffb38a", "#86e0b5", "#d8c3a5", "#b5e48c", "#ffe6b0", "#ff8fc3", "#a8d8ff", "#ffcf7a", "#e0b0ff",
];

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** Deterministic pseudo-random numbers per word, so the galaxy looks the same everywhere. */
function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A point in galaxy space. */
export type Vec3 = [number, number, number];

export interface GalaxyLayout {
  n: number;
  positions: Float32Array;
  colors: Float32Array;
  seeds: Float32Array;
  ids: string[];
  index: Map<string, number>;
  /** Centre of each topic cluster, for floating labels. */
  topicCenters: Vec3[];
  /** The figure's vertices are real stars; these are their indices. */
  topicAnchors: number[][];
  /** Links between them, as index pairs into `topicAnchors`, in drawing order. */
  topicLinks: [number, number][][];
  /** The same vertices in world space, for framing the camera and drawing. */
  topicPaths: Vec3[][];
  /** Flattened copy of each figure, for the panel card. */
  figures: TopicFigure[];
}

/**
 * A spiral galaxy: each IELTS topic owns an arm, easy words sit near the core and
 * the hardest at the rim, so learning visibly travels outward.
 */
export function layoutGalaxy(atlas: Atlas): GalaxyLayout {
  const words = atlas.words;
  const n = words.length;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const seeds = new Float32Array(n);
  const arms = atlas.topics.length;
  // Big topics get a wider arm so every arm has a similar star density.
  const counts = new Array(arms).fill(0);
  words.forEach((w) => counts[w.topic]++);
  const avg = n / arms;

  // Each topic also owns a *cloud*: a soft two-dimensional knot in the disc,
  // centred part-way out on that topic's arm. This is what gives a constellation
  // its second dimension — an arm is a line, and a figure drawn on a line is a
  // line. The knot is small enough to stay inside the topic's own sector, so the
  // colours keep their separation; only the stars near the knot's radius are
  // displaced, and they fade back into the arm either side of it.
  const clouds = atlas.topics.map(([key], t) => {
    const q = rand(hashSeed(`cloud:${key}`));
    const mid = 0.5 + q() * 0.24;
    const rot = (t / arms) * Math.PI * 2 + mid * 3.4 + (q() - 0.5) * 1.4;
    return { mid, rot, major: 0.034 + q() * 0.012, minor: 0.024 + q() * 0.008 };
  });

  words.forEach((w, i) => {
    const r = rand(hashSeed(w.id));
    const gauss = () => (r() + r() + r() - 1.5) / 1.5;
    const radius = 0.1 + (w.cefr / 5) * 0.72 + r() * 0.16;
    const arm = (w.topic / arms) * Math.PI * 2;
    const spread = Math.sqrt(Math.max(0.6, counts[w.topic] / avg));
    const angle = arm + radius * 3.4 + gauss() * (0.05 + 0.03 / radius) * spread;
    const thick = 0.05 * (1 - radius * 0.6) * spread;
    let x = Math.cos(angle) * radius;
    let y = gauss() * thick;
    let z = Math.sin(angle) * radius;

    const cloud = clouds[w.topic];
    const near = Math.abs(radius - cloud.mid) / 0.15;
    if (near < 1) {
      // cos² falloff: full displacement at the knot's radius, none 0.15 away.
      const k = Math.cos(near * Math.PI * 0.5) ** 2;
      const du = gauss() * cloud.major * 2.6 * k;
      const dv = gauss() * cloud.minor * 2.6 * k;
      x += du * Math.cos(cloud.rot) - dv * Math.sin(cloud.rot);
      z += du * Math.sin(cloud.rot) + dv * Math.cos(cloud.rot);
      y += gauss() * 0.012 * k;
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    const [cr, cg, cb] = rgb(TOPIC_COLORS[w.topic % TOPIC_COLORS.length]);
    colors.set([cr, cg, cb], i * 3);
    seeds[i] = r();
  });
  // Label each arm at the centre of its cloud, where the stars actually are.
  const centers = atlas.topics.map((_, t) => {
    const m = clouds[t].mid;
    const a = (t / arms) * Math.PI * 2 + m * 3.4;
    return [Math.cos(a) * m, 0, Math.sin(a) * m] as [number, number, number];
  });

  // One figure per topic, drawn on the topic's own stars. The sampler picks
  // 8-14 of them from a window around the arm's middle and joins them without
  // letting any two links cross - see `constellation.ts`.
  const figures = figuresFor(atlas, positions, centers);
  const topicAnchors = figures.map((f) => f.anchors);
  const topicLinks = figures.map((f) => f.edges);
  const topicPaths = topicAnchors.map((list) =>
    list.map((i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]] as Vec3),
  );

  return {
    n,
    positions,
    colors,
    seeds,
    ids: words.map((w) => w.id),
    index: new Map(words.map((w, i) => [w.id, i])),
    topicCenters: centers,
    topicAnchors,
    topicLinks,
    topicPaths,
    figures,
  };
}
