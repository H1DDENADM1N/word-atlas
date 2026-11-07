/**
 * Topic constellations.
 *
 * A constellation here is not a shape we invent and then drop onto the sky — it
 * is a set of *real* stars, chosen by a seeded sampler around the topic's arm,
 * joined by a spanning tree that is forbidden to cross itself. That last rule
 * is the whole difference between a constellation and a scribble: because no
 * two links may intersect, the figure is always planar, and a star only earns
 * a fourth link after every star has been offered a third. The result has a
 * spine, a few branches and a handful of loose ends — which is what a real
 * constellation looks like, and what a greedy "join the nearest star" walk can
 * never produce.
 *
 * The same figure is drawn twice: on the sky it uses the stars' own positions,
 * on the panel card it is rotated onto its principal axis and scaled to fit.
 */
import type { Atlas } from "../atlas/types";
import { hashSeed } from "../lib/text";

export type P2 = [number, number];

export interface TopicFigure {
  /** Star indices in the galaxy — the vertices really are those stars. */
  anchors: number[];
  /** Links, as index pairs into `anchors`, already in drawing order. */
  edges: [number, number][];
  /** The same vertices flattened onto their principal axis, centred on 0,0. */
  flat: P2[];
  /** Extent of `flat`, before fitting. */
  w: number;
  h: number;
}

/** A topic lights up once four fifths of its words have been met. */
export const LIT_AT = 0.8;

/** Deterministic PRNG, same family as the galaxy layout uses. */
function prng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const d2 = (a: P2, b: P2) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Do the open segments ab and cd properly intersect? */
function crosses(a: P2, b: P2, c: P2, d: P2) {
  const side = (p: P2, q: P2, r: P2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/**
 * Pick the stars the figure is drawn on.
 *
 * The window starts tight and grows by 30% until there is a comfortable
 * surplus of candidates. That adaptivity matters: a fixed window is either
 * cramped on a dense topic or a scatter on a sparse one, and a fixed window
 * also makes every card repeat the same crescent.
 *
 * Inside the window the candidates are shuffled and accepted greedily with a
 * minimum gap that shrinks by 20% per pass — a Poisson-disc sample with a
 * guaranteed quota, so every topic gets the same number of stars (8–14)
 * spaced as evenly as the cloud allows.
 */
export function constellationAnchors(
  positions: Float32Array,
  candidates: number[],
  center: [number, number, number],
  key: string,
): { anchors: number[]; rnd: () => number } {
  const rnd = prng(hashSeed(`constellation:${key}`));
  const want = 8 + Math.floor(rnd() * 7);
  let radius = 0.11;
  let pool: number[] = [];
  for (let guard = 0; guard < 12; guard++) {
    pool = candidates.filter(
      (i) => Math.hypot(positions[i * 3] - center[0], positions[i * 3 + 2] - center[2]) < radius,
    );
    if (pool.length >= want * 4) break;
    radius *= 1.3;
  }
  if (pool.length < want) return { anchors: pool.slice(), rnd };

  const shuffled = pool
    .map((i) => [i, rnd()] as [number, number])
    .sort((a, b) => a[1] - b[1])
    .map(([i]) => i);

  const anchors: number[] = [];
  for (let gap = radius * 0.32; anchors.length < want && gap > 0.002; gap *= 0.8) {
    for (const id of shuffled) {
      if (anchors.length >= want) break;
      if (anchors.includes(id)) continue;
      const ok = anchors.every(
        (p) => Math.hypot(positions[id * 3] - positions[p * 3], positions[id * 3 + 2] - positions[p * 3 + 2]) >= gap,
      );
      if (ok) anchors.push(id);
    }
  }
  return { anchors, rnd };
}

/** Hop count between two stars in the tree built so far. */
function hops(edges: [number, number][], n: number, from: number, to: number) {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const dist = new Array<number>(n).fill(-1);
  dist[from] = 0;
  const queue = [from];
  while (queue.length) {
    const v = queue.shift()!;
    for (const w of adj[v]) {
      if (dist[w] >= 0) continue;
      dist[w] = dist[v] + 1;
      queue.push(w);
    }
  }
  return dist[to];
}

/**
 * Join the stars.
 *
 * Incremental tree: grow from star 0, each round taking the shortest link from
 * a joined star to a free one, skipping any link that would cross one already
 * drawn. The degree cap rises only when nothing can be connected at the current
 * one, so the figure spreads sideways before it ever becomes a star of spokes.
 *
 * Then, with 55% probability, one extra chord between two degree-2 stars. It
 * must be no longer than 1.5× the median link, at least three hops away in the
 * tree (so it can never close a triangle) and crossing-free.
 */
export function constellationEdges(pts: P2[], rnd: () => number): [number, number][] {
  const n = pts.length;
  const edges: [number, number][] = [];
  if (!n) return edges;
  const degree = new Array<number>(n).fill(0);
  const joined = new Array<boolean>(n).fill(false);
  joined[0] = true;

  for (let k = 1; k < n; k++) {
    let pick: [number, number] | null = null;
    let best = Infinity;
    for (let level = 3; !pick && level <= n; level++)
      for (let a = 0; a < n; a++) {
        if (!joined[a] || degree[a] >= level) continue;
        for (let b = 0; b < n; b++) {
          if (joined[b]) continue;
          const d = d2(pts[a], pts[b]);
          if (d >= best) continue;
          if (edges.some(([p, q]) => p !== a && q !== a && crosses(pts[p], pts[q], pts[a], pts[b]))) continue;
          best = d;
          pick = [a, b];
        }
      }
    if (!pick) {
      // Degenerate geometry — take the nearest free star, crossings and all.
      best = Infinity;
      for (let a = 0; a < n; a++)
        for (let b = 0; b < n; b++)
          if (joined[a] && !joined[b] && d2(pts[a], pts[b]) < best) {
            best = d2(pts[a], pts[b]);
            pick = [a, b];
          }
    }
    if (!pick) break;
    const [a, b] = pick;
    joined[b] = true;
    degree[a]++;
    degree[b]++;
    edges.push([a, b]);
  }

  if (n >= 6 && rnd() < 0.55) {
    const lens = edges.map(([a, b]) => Math.sqrt(d2(pts[a], pts[b]))).sort((x, y) => x - y);
    const median = lens[lens.length >> 1] ?? 0;
    let chord: [number, number] | null = null;
    let best = Infinity;
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) {
        if (degree[a] >= 3 || degree[b] >= 3) continue;
        if (edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) continue;
        const d = Math.sqrt(d2(pts[a], pts[b]));
        if (d > median * 1.5 || d >= best) continue;
        if (hops(edges, n, a, b) < 3) continue;
        if (edges.some(([p, q]) => p !== a && q !== a && p !== b && q !== b && crosses(pts[p], pts[q], pts[a], pts[b])))
          continue;
        best = d;
        chord = [a, b];
      }
    if (chord) edges.push(chord);
  }
  return edges;
}

/**
 * Put the links in the order they should be drawn.
 *
 * Depth-first from a loose end (or the left-most star when the figure has no
 * loose end), always taking the shortest remaining link first. Drawing in this
 * order means the stroke sweeps out from one end of the figure to the other, so
 * a half-drawn constellation still looks like a constellation.
 */
export function orderEdges(edges: [number, number][], n: number, pts: P2[]): [number, number][] {
  if (!n) return [];
  const adj: number[][] = Array.from({ length: n }, () => []);
  edges.forEach(([a, b], i) => {
    adj[a].push(i);
    adj[b].push(i);
  });

  let start = 0;
  for (let i = 0; i < n; i++) {
    const leaf = adj[i].length === 1;
    const startLeaf = adj[start].length === 1;
    if ((leaf && !startLeaf) || (leaf === startLeaf && pts[i][0] < pts[start][0])) start = i;
  }

  const used = new Array<boolean>(edges.length).fill(false);
  const out: [number, number][] = [];
  const walk = (v: number) => {
    const list = adj[v].filter((i) => !used[i]).sort((x, y) => d2(pts[edges[x][0]], pts[edges[x][1]]) - d2(pts[edges[y][0]], pts[edges[y][1]]));
    for (const e of list) {
      if (used[e]) continue;
      used[e] = true;
      const [a, b] = edges[e];
      const next = a === v ? b : a;
      out.push([v, next]);
      walk(next);
    }
  };
  walk(start);
  edges.forEach((e, i) => {
    if (!used[i]) out.push(e);
  });
  return out;
}

/**
 * Flatten onto the figure's own plane.
 *
 * The stars are already spread across the disc plane by their topic's cloud, so
 * the card is just the top-down view of the figure: rotate the disc plane onto
 * the principal axis, then read both in-plane coordinates. That keeps the card
 * and the sky in agreement — the sky is the same projection, seen from the same
 * side — which is what stops one of them looking like a line while the other
 * looks like a figure.
 */
export function flatten(pts: [number, number, number][]): { flat: P2[]; w: number; h: number } {
  const n = pts.length;
  if (!n) return { flat: [], w: 0, h: 0 };
  const cx = pts.reduce((s, p) => s + p[0], 0) / n;
  const cz = pts.reduce((s, p) => s + p[2], 0) / n;
  let xx = 0;
  let zz = 0;
  let xz = 0;
  for (const [x, , z] of pts) {
    xx += (x - cx) ** 2;
    zz += (z - cz) ** 2;
    xz += (x - cx) * (z - cz);
  }
  const theta = 0.5 * Math.atan2(2 * xz, xx - zz);
  const cos = Math.cos(-theta);
  const sin = Math.sin(-theta);
  const flat: P2[] = pts.map(([x, , z]) => {
    const dx = x - cx;
    const dz = z - cz;
    return [dx * cos - dz * sin, dx * sin + dz * cos];
  });
  const us = flat.map((p) => p[0]);
  const vs = flat.map((p) => p[1]);
  const minU = Math.min(...us);
  const minV = Math.min(...vs);
  const ou = (Math.max(...us) + minU) / 2;
  const ov = (Math.max(...vs) + minV) / 2;
  return {
    flat: flat.map(([u, v]) => [u - ou, v - ov] as P2),
    w: Math.max(...us) - minU,
    h: Math.max(...vs) - minV,
  };
}

/** Fit a figure into a box, preserving its aspect ratio, centred. */
export function cardPoints(fig: TopicFigure, w = 120, h = 72, pad = 9): P2[] {
  const bw = w - pad * 2;
  const bh = h - pad * 2;
  const s = Math.min(bw / (fig.w || 1), bh / (fig.h || 1));
  const ox = pad + bw / 2;
  const oy = pad + bh / 2;
  return fig.flat.map(([x, y]) => [ox + x * s, oy + y * s] as P2);
}

/** Build every topic's figure. Geometry only — progress is layered on later. */
export function figuresFor(
  atlas: Atlas,
  positions: Float32Array,
  centers: [number, number, number][],
): TopicFigure[] {
  // A topic's own words only: the figure has to be that topic's stars, or the
  // lines end up joining words from other categories.
  const members: number[][] = Array.from({ length: atlas.topics.length }, () => []);
  atlas.words.forEach((w, i) => members[w.topic]?.push(i));
  return atlas.topics.map(([key], t) => {
    const { anchors, rnd } = constellationAnchors(positions, members[t], centers[t], key);
    const pts3 = anchors.map((i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]] as [number, number, number]);
    // The figure is defined in its own plane, then drawn in the sky on the real
    // stars: one topology, two renderings, so the card and the sky can never
    // disagree about which star is joined to which.
    const { flat, w, h } = flatten(pts3);
    const edges = orderEdges(constellationEdges(flat, rnd), anchors.length, flat);
    return { anchors, edges, flat, w, h };
  });
}

/** English names as the panel shows them, not a naive capitalisation. */
const ENGLISH: Record<string, string> = {
  education: "Education",
  work: "Work",
  technology: "Technology",
  science: "Science",
  environment: "Environment",
  health: "Health",
  society: "Society",
  government: "Law & Government",
  economy: "Economy",
  media: "Media",
  arts: "The Arts",
  travel: "Travel",
  city: "City Life",
  nature: "Nature",
  daily: "Daily Life",
  emotion: "Emotions",
  thinking: "Thinking",
  sport: "Sport",
  history: "History",
};

export interface TopicConstellation extends TopicFigure {
  index: number;
  key: string;
  /** 教育 → 教育座 */
  name: string;
  /** education → Education */
  english: string;
  total: number;
  /** Words in this topic that have been met at least once. */
  learned: number;
  /** Words needed to light the figure. */
  need: number;
  share: number;
  /** How much of the figure is drawn, 0–1. */
  drawn: number;
  lit: boolean;
  toGo: number;
}

/**
 * Progress per topic. `lit` is deliberately about *having met* the words, not
 * about remembering them — the panel says so, because a constellation that
 * claimed mastery would be a lie. The figure fills in as the learner advances,
 * which is why `drawn` is a fraction of the *needed* words rather than of all
 * of them: the last fifth shouldn't leave the figure looking unfinished.
 */
export function topicProgress(
  atlas: Atlas,
  figures: TopicFigure[],
  cards: Record<string, unknown>,
): TopicConstellation[] {
  const total = new Array(atlas.topics.length).fill(0);
  const learned = new Array(atlas.topics.length).fill(0);
  for (const w of atlas.words) {
    total[w.topic]++;
    if (cards[w.id]) learned[w.topic]++;
  }
  return atlas.topics.map(([key, name], i) => {
    const t = total[i];
    const need = Math.ceil(t * LIT_AT);
    return {
      ...figures[i],
      index: i,
      key,
      name: `${name}座`,
      english: ENGLISH[key] ?? key.charAt(0).toUpperCase() + key.slice(1),
      total: t,
      learned: learned[i],
      need,
      share: t ? learned[i] / t : 0,
      drawn: Math.min(1, need ? learned[i] / need : 0),
      lit: t > 0 && learned[i] >= need,
      toGo: Math.max(0, need - learned[i]),
    };
  });
}
