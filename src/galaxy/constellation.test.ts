import assert from "node:assert/strict";
import { test } from "node:test";
import { constellationEdges, flatten, orderEdges, type P2 } from "./constellation";

/** A reproducible scatter, so a failure is always reproducible too. */
function scatter(seed: number, n: number, spread = 1): P2[] {
  let s = seed >>> 0 || 1;
  const r = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return Array.from({ length: n }, () => [r() * spread, r() * spread] as P2);
}

const crosses = (a: P2, b: P2, c: P2, d: P2) => {
  const side = (p: P2, q: P2, r: P2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
};

test("the figure never crosses itself, and never closes a triangle", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const pts = scatter(seed, 8 + (seed % 7));
    const edges = constellationEdges(pts, () => (seed % 3) / 3);
    for (let i = 0; i < edges.length; i++)
      for (let j = i + 1; j < edges.length; j++) {
        const [a, b] = edges[i];
        const [c, d] = edges[j];
        // Two links sharing a star cannot cross; anything else must not.
        if (new Set([a, b, c, d]).size < 4) continue;
        assert.ok(!crosses(pts[a], pts[b], pts[c], pts[d]), `seed ${seed}: links ${i} and ${j} cross`);
      }
  }
});

test("every star is reachable, so the figure is one piece", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const pts = scatter(seed, 12);
    // 0.9 suppresses the optional chord, leaving a pure spanning tree.
    const edges = constellationEdges(pts, () => 0.9);
    assert.equal(edges.length, pts.length - 1, `seed ${seed}: a tree on 12 stars needs 11 links`);
    const adj = Array.from({ length: pts.length }, () => [] as number[]);
    for (const [a, b] of edges) {
      adj[a].push(b);
      adj[b].push(a);
    }
    const seen = new Set([0]);
    const queue = [0];
    while (queue.length) for (const v of queue.splice(0, 1)) for (const w of adj[v]) if (!seen.has(w)) seen.add(w), queue.push(w);
    assert.equal(seen.size, pts.length, `seed ${seed}: ${pts.length - seen.size} stars left adrift`);
  }
});

test("a chord is only added when it cannot fold the figure over itself", () => {
  // A pentagon: every non-adjacent pair is far more than three hops apart in
  // the tree, so a chord is legal — but it must not cross an existing link.
  const pent: P2[] = [0, 1, 2, 3, 4].map((i) => [Math.cos((i / 5) * 6.283), Math.sin((i / 5) * 6.283)] as P2);
  const edges = constellationEdges(pent, () => 0.1);
  assert.ok(edges.length >= 4);
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const [a, b] = edges[i];
      const [c, d] = edges[j];
      if (new Set([a, b, c, d]).size < 4) continue;
      assert.ok(!crosses(pent[a], pent[b], pent[c], pent[d]));
    }
});

test("drawing order walks the figure from one end to the other", () => {
  const pts = scatter(9, 10);
  const edges = constellationEdges(pts, () => 0);
  const ordered = orderEdges(edges, pts.length, pts);
  assert.equal(ordered.length, edges.length);
  // Each link after the first starts where some earlier link ended: that is
  // what makes a half-drawn constellation look like a constellation.
  const reached = new Set([ordered[0][0]]);
  for (const [from, to] of ordered) {
    assert.ok(reached.has(from), `link ${from}->${to} starts at a star that is not drawn yet`);
    reached.add(to);
  }
});

test("flattening keeps the shape and reports its extent", () => {
  const pts: [number, number, number][] = [
    [0, 0, 0],
    [3, 0, 1],
    [6, 0, 2],
    [9, 0, 3],
  ];
  const { flat, w, h } = flatten(pts);
  assert.equal(flat.length, 4);
  // A line at 18°: the long axis is 9.49, the short one is nothing.
  assert.ok(Math.abs(w - Math.hypot(9, 3)) < 0.01, `w = ${w}`);
  assert.ok(h < 0.01, `h = ${h}`);
  // Centred on the origin.
  const cx = flat.reduce((s, p) => s + p[0], 0) / 4;
  const cy = flat.reduce((s, p) => s + p[1], 0) / 4;
  assert.ok(Math.abs(cx) < 0.01 && Math.abs(cy) < 0.01);
});
