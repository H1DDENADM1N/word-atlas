#!/usr/bin/env node
/**
 * Print the Material Expressive easing curves as CSS `linear()` functions.
 *
 * The expressive family is supposed to *settle*, not glide, so its motion is
 * driven by a damped spring rather than a hand-tuned bezier. CSS cannot express
 * a spring directly, but `linear()` with enough samples is a faithful-enough
 * approximation (Chromium 113+, Safari 17.2+, Firefox 112+ — older engines get
 * the bezier fallback that lives next to this block in app.css).
 *
 * The script only prints. Nothing is written and nothing runs at build time:
 * the numbers below are pasted into `src/styles/app.css` on purpose, so a CSS
 * diff shows exactly what changed and the browser never has to compute them.
 *
 * Run: `npm run gen:motion`
 */

/** Damping ratio (0 = never settles, 1 = no overshoot). */
const EASE = { label: "--ease", zeta: 0.8, stiffness: 380 };
const SPRING = { label: "--spring", zeta: 0.72, stiffness: 320 };

const MASS = 1;
/** Seconds covered by one sample sweep. Long enough for both curves to settle. */
const DURATION = 0.5;
/** Points handed to `linear()`. More points = smoother, longer CSS. */
const SAMPLES = 40;
/** Decimals kept per point; 3 is under a tenth of a percent of the range. */
const DECIMALS = 3;

/**
 * Displacement of a unit step through a damped harmonic oscillator.
 *
 *   x(t) = 1 - e^(-zeta*omega*t) * (cos(wd*t) + (zeta*omega/wd) * sin(wd*t))
 *
 * with `omega = sqrt(k/m)` and `wd = omega * sqrt(1 - zeta^2)`.
 */
function sample({ zeta, stiffness }, t) {
  const omega = Math.sqrt(stiffness / MASS);
  const decay = zeta * omega;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const envelope = Math.exp(-decay * t);
  return 1 - envelope * (Math.cos(wd * t) + (decay / wd) * Math.sin(wd * t));
}

function curve(spec) {
  const points = [];
  for (let i = 0; i < SAMPLES; i++) points.push(sample(spec, (i / (SAMPLES - 1)) * DURATION));
  // Pin the ends: floating point leaves 0 at ~1e-17 and 1 at 0.9999.
  points[0] = 0;
  points[points.length - 1] = 1;
  return points;
}

function css(points) {
  return `linear(${points.map((v) => v.toFixed(DECIMALS)).join(", ")})`;
}

for (const spec of [EASE, SPRING]) {
  const points = curve(spec);
  const peak = Math.max(...points);
  // The last stretch has to be sitting on 1 — a curve that is still swinging
  // at the end of the sweep would read as a jump when the transition finishes.
  const tail = points.slice(-6);
  const settled = tail.every((v) => Math.abs(v - 1) < 0.005);
  console.log(`/* ${spec.label}: zeta ${spec.zeta}, stiffness ${spec.stiffness} — peak ${peak.toFixed(3)} */`);
  console.log(`${spec.label}: ${css(points)};`);
  console.log("");
  if (points[0] !== 0 || points[points.length - 1] !== 1 || !Number.isFinite(peak)) {
    console.error(`FAIL ${spec.label}: invalid curve`);
    process.exitCode = 1;
  }
  if (!settled) {
    console.error(`FAIL ${spec.label}: did not settle by ${DURATION}s`);
    process.exitCode = 1;
  }
}
