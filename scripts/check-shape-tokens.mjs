#!/usr/bin/env node
/**
 * Guards the shape token scale.
 *
 * Two rules, both about keeping corners themeable:
 *   1. No border-radius may be a literal pixel value, except the handful of
 *      hairlines that are thinner than the smallest step (`--shape-xs`).
 *   2. The Material Expressive block must define every step, or the family
 *      would inherit the paper radii and silently look like a no-op.
 */
import { readFileSync } from "node:fs";

const CSS = "src/styles/app.css";

/** Declarations thin enough that no scale step can express them. */
const HAIRLINES = new Set(["border-radius: 1px;", "border-radius: 1px"]);

const SCALE = [
  "none",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "full",
];

const source = readFileSync(CSS, "utf8");
const lines = source.split("\n");

/** 1. literal radii */
const offenders = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Skip comments: the file explains its radii in prose in several places.
  const code = line.replace(/\/\*.*?\*\//g, "").split("/*")[0];
  const m = /border-radius\s*:\s*([^;]+)/.exec(code);
  if (!m) continue;
  const value = m[1].trim();
  if (!/\d+px/.test(value)) continue; // 50%, inherit, var(--shape-*) …
  if (
    HAIRLINES.has(`border-radius: ${value};`) ||
    HAIRLINES.has(`border-radius: ${value}`)
  )
    continue;
  offenders.push(`${CSS}:${i + 1}  border-radius: ${value}`);
}

/** 2. the M3E step must be complete */
const m3e = /:root\[data-family="m3e"\]\s*\{([\s\S]*?)\n\}/.exec(source);
const missing = [];
if (!m3e) missing.push(`没有 :root[data-family="m3e"] 段`);
else
  for (const step of SCALE)
    if (!new RegExp(`--shape-${step}\\s*:`).test(m3e[1]))
      missing.push(`--shape-${step}`);

if (offenders.length || missing.length) {
  if (offenders.length) {
    console.error(
      `✗ ${offenders.length} 处裸 border-radius（应为 var(--shape-*)）：`,
    );
    for (const o of offenders.slice(0, 40)) console.error(`    ${o}`);
    if (offenders.length > 40)
      console.error(`    … 另有 ${offenders.length - 40} 处`);
  }
  if (missing.length)
    console.error(`✗ M3E 形状段缺 ${missing.length} 项：${missing.join("、")}`);
  process.exit(1);
}

console.log(`ok · 0 处裸半径 · M3E 段 ${SCALE.length}/${SCALE.length} 令牌`);
