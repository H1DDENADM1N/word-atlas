# Material Expressive 2025 主题系列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为词光新增第三套主题家族 Material Expressive 2025（三档深浅 + 壁纸派生强调色 + 8 色精选板 + 9 种调色板风格），并在该家族下启用 Expressive 形状阶梯与弹簧曲线。

**Architecture:** 运行时色彩引擎——打包 `@material/material-color-utilities@0.4.0`，用其 `SpecVersion "2025"` 从种子色算出一整套调色板，再映射到 app.css 既有的 30 个语义令牌（不新建 `--m3-*` 命名空间），由 `useTheme()` 写成 `documentElement` 内联变量。形状层先把 82 处硬编码圆角重构为 11 档 `--shape-*` 令牌（纸墨/夜空取吸附值，外观不变），M3E 段整体换一套更圆的值；动效层只重定义 `--ease` / `--spring` 两条曲线。

**Tech Stack:** TypeScript / React 19 / Vite 6 / node:test + tsx / Java (Android WebView 壳) / 纯 CSS 令牌

**Spec:** [docs/superpowers/specs/2026-11-07-material-expressive-theme-design.md](../specs/2026-11-07-material-expressive-theme-design.md)

## Global Constraints

- 新增运行时依赖仅 `@material/material-color-utilities@^0.4.0`，不得再引入任何其他依赖。
- 安卓构建必须保持单一 classic script：`vite.config.android.ts` 的 `format: "iife"` + `inlineDynamicImports: true` + `target: "es2020"` 不可改动。
- manifest 不得新增任何 `uses-permission`，包括 `READ_EXTERNAL_STORAGE`（取壁纸色走 `system_accent1_500` 与 `WallpaperManager`，都不需要权限）。
- 桌面小部件不接入新家族，`res/values*/colors.xml` 保持不动。
- 纸墨与夜空的视觉不得变化（形状令牌吸附位移上限 3px，且只有 `--r-sm` 10→12 一处）。
- 默认主题族仍是 `ink` + `dark`：老用户升级后观感零变化。
- 备份载荷形状不变，`settings.theme` 写 `legacyTheme()` 派生值，**不新增** 5 个主题字段。
- 所有新增标识符用英文；用户可见文案用中文，与现有 `.tsx` 一致。

## Review Focus

1. **壁纸取色失败**（桌面模拟器、无壁纸权限的 ROM、`getWallpaperColors` 返回 null）——应当落到品牌 terra `#C4573A` 并正常渲染，而不是留空导致 `setProperty(k, "")` 把字色变成浏览器默认黑。
2. **家族来回切换后残留内联变量**——从 `m3e` 切回 `ink` / `night` 时必须逐个 `removeProperty`，否则纸墨页面上会带着 M3E 的粉紫色。
3. **`m3Accent` 是脏值**（`"#GGG"`、`"red"`、超长串）——必须 sanitize 回 `"wallpaper"`，且 `Hct.fromInt` 不能抛异常打断首帧。
4. **旧的或缺失的备份文件**——`settings` 缺 `theme`、或 `theme` 是 `"sepia"` 之类未知值时，必须退到 `ink + dark`，而不是 `undefined` 一路写进内联样式。
5. **页面打开期间系统切深浅**——`window.__waSystemTheme` 推送后，M3E 跟随模式必须重算整块调色板，而不是停在旧模式下算出的颜色。

---

### Task 1: 形状令牌阶梯 + 防回退护栏

**Files:**
- Create: `scripts/check-shape-tokens.mjs`
- Modify: `src/styles/app.css`（`:root` 段 :4-50 与全文件 82 处圆角）
- Modify: `package.json:6-21`（新增 `check:shape`）

**Interfaces:**
- Consumes: 无
- Produces: CSS 自定义属性 `--shape-none|xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|full`（11 个），默认值 0/4/8/12/16/20/24/28/32/36/999px；`npm run check:shape` 退出码 0/1。

- [x] **Step 1: 写护栏脚本 `scripts/check-shape-tokens.mjs`**

两条断言，任一失败 `process.exit(1)` 并打印命中行号：

1. `src/styles/app.css` 中 `border-radius:\s*(\d+)px` 的命中，除白名单（`.amb-bars i` 的 `1px`、`::view-transition-new(word-art)` 的 `20px`）外一律报错。
2. `:root[data-family="m3e"]` 段内必须出现全部 11 个 `--shape-*` 定义。

用 `node:fs` 读文件后按行正则匹配，白名单用「选择器名 + 值」二元组登记，不做行号豁免。

- [x] **Step 2: 运行护栏确认当前失败**

Run: `node scripts/check-shape-tokens.mjs`
Expected: 退出码 1，报「82 处裸 border-radius」，列出前若干行号。

- [x] **Step 3: 替换 `:root` 里的四个旧令牌（`app.css:44-47`）**

删除 `--r-sm: 10px; --r: 16px; --r-lg: 24px; --r-xl: 32px;`，换成 11 档阶梯：

```css
--shape-none: 0;      --shape-xs: 4px;    --shape-sm: 8px;
--shape-md: 12px;     --shape-lg: 16px;   --shape-xl: 20px;
--shape-2xl: 24px;    --shape-3xl: 28px;  --shape-4xl: 32px;
--shape-5xl: 36px;    --shape-full: 999px;
```

- [x] **Step 4: 把 82 处裸值按吸附表替换**

映射（左 = 现值，右 = 令牌）：`1,3 →` 白名单保留字面量；`4 → --shape-xs`；`6,8 → --shape-sm`；`10,11,12,13,14 → --shape-md`；`16 → --shape-lg`；`18,20 → --shape-xl`；`22,24 → --shape-2xl`；`28 → --shape-3xl`；`32 → --shape-4xl`；`36 → --shape-5xl`；`999 → --shape-full`。

同时把既有的 `var(--r-sm)` → `var(--shape-md)`、`var(--r)` → `var(--shape-lg)`、`var(--r-lg)` → `var(--shape-2xl)`、`var(--r-xl)` → `var(--shape-4xl)`（全库共 18 处引用）。

- [x] **Step 5: 在 `app.css` 末尾追加 M3E 形状段**

紧跟现有极光/星光段（:5628-5822）之后：

```css
/* Material Expressive: rounder, more continuous corners across the whole UI.
   选择器权重与 [data-theme="dark"] 相同，靠顺序取胜——M3E 段必须在最后。 */
:root[data-family="m3e"] {
  --shape-none: 0;    --shape-xs: 6px;    --shape-sm: 10px;
  --shape-md: 16px;   --shape-lg: 20px;   --shape-xl: 24px;
  --shape-2xl: 28px;  --shape-3xl: 32px;  --shape-4xl: 36px;
  --shape-5xl: 40px;  --shape-full: 999px;
}
```

- [x] **Step 6: 运行护栏确认通过**

Run: `node scripts/check-shape-tokens.mjs`
Expected: 退出码 0，输出「ok · 0 处裸半径 · M3E 段 11/11 令牌」。

- [x] **Step 7: 加 npm 脚本并确认构建**

`package.json` scripts 加 `"check:shape": "node scripts/check-shape-tokens.mjs"`。
Run: `npm run check:shape && npm run build`
Expected: 两者均通过，`dist/` 产出正常。

- [x] **Step 8: Commit**

```bash
git add scripts/check-shape-tokens.mjs src/styles/app.css package.json
git commit -m "refactor(theme): replace hard-coded radii with an 11-step shape scale"
```

---

### Task 2: 纯主题模型 `theme-model.ts`

**Files:**
- Create: `src/lib/theme-model.ts`
- Create: `src/lib/theme-model.test.ts`

**Interfaces:**
- Consumes: 无（零依赖纯模块，不得 import store / theme / native，避免循环）
- Produces:
  - `type ThemeFamily = "ink" | "night" | "m3e"`
  - `type ThemeMode = "system" | "light" | "dark"`
  - `type NightSkin = "aurora" | "starlight"`
  - `type M3Variant = "monochrome" | "neutral" | "tonalSpot" | "vibrant" | "expressive" | "fidelity" | "content" | "rainbow" | "fruitSalad"`
  - `const VARIANTS: readonly M3Variant[]`（顺序同上）
  - `const VARIANT_LABEL: Record<M3Variant, string>`（单色 / 中性 / 色调对比 / 鲜艳 / 表现力 / 忠实 / 内容 / 彩虹 / 水果沙拉）
  - `const PALETTES: readonly { name: string; hex: string }[]`（陶土 #C4573A、赭石 #CB922C、苔绿 #6A8C63、天青 #5F88A8、梅紫 #9A6283、石墨 #5B6068、松青 #2F6B5F、靛蓝 #3F51B5）
  - `const FALLBACK_SEED = "#C4573A"`
  - `function fromLegacyTheme(v: unknown): { themeFamily: ThemeFamily; themeMode: ThemeMode; nightSkin: NightSkin } | null`
  - `function legacyTheme(s: { themeFamily: ThemeFamily; themeMode: ThemeMode; nightSkin: NightSkin }): "system" | "light" | "dark" | "aurora" | "starlight"`

- [x] **Step 1: 写失败测试 `src/lib/theme-model.test.ts`**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fromLegacyTheme, legacyTheme, PALETTES, VARIANTS } from "./theme-model";

test("maps every legacy theme value onto family + mode", () => {
  assert.deepEqual(fromLegacyTheme("system"), { themeFamily: "ink", themeMode: "system", nightSkin: "aurora" });
  assert.deepEqual(fromLegacyTheme("light"), { themeFamily: "ink", themeMode: "light", nightSkin: "aurora" });
  assert.deepEqual(fromLegacyTheme("dark"), { themeFamily: "ink", themeMode: "dark", nightSkin: "aurora" });
  assert.deepEqual(fromLegacyTheme("aurora"), { themeFamily: "night", themeMode: "dark", nightSkin: "aurora" });
  assert.deepEqual(fromLegacyTheme("starlight"), { themeFamily: "night", themeMode: "dark", nightSkin: "starlight" });
  assert.equal(fromLegacyTheme("sepia"), null);
  assert.equal(fromLegacyTheme(undefined), null);
});

test("folds the new model back into the five legacy values", () => {
  assert.equal(legacyTheme({ themeFamily: "ink", themeMode: "system", nightSkin: "aurora" }), "system");
  assert.equal(legacyTheme({ themeFamily: "ink", themeMode: "dark", nightSkin: "aurora" }), "dark");
  assert.equal(legacyTheme({ themeFamily: "night", themeMode: "dark", nightSkin: "aurora" }), "aurora");
  assert.equal(legacyTheme({ themeFamily: "night", themeMode: "dark", nightSkin: "starlight" }), "starlight");
  // M3E has no legacy word: it degrades to the plain mode word.
  assert.equal(legacyTheme({ themeFamily: "m3e", themeMode: "light", nightSkin: "aurora" }), "light");
  assert.equal(legacyTheme({ themeFamily: "m3e", themeMode: "system", nightSkin: "aurora" }), "system");
});

test("ships nine variants and eight curated palettes", () => {
  assert.equal(VARIANTS.length, 9);
  assert.equal(new Set(VARIANTS).size, 9);
  assert.equal(PALETTES.length, 8);
  for (const p of PALETTES) assert.match(p.hex, /^#[0-9A-F]{6}$/i);
  assert.equal(PALETTES[0].hex.toUpperCase(), "#C4573A");
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `node --import tsx --test src/lib/theme-model.test.ts`
Expected: FAIL — `Cannot find module './theme-model'`。

- [x] **Step 3: 实现 `src/lib/theme-model.ts`**

按 Interfaces 导出。`fromLegacyTheme` 用一个 `Record<string, {...}>` 查表，未命中返回 `null`（不抛异常，因为输入来自备份文件）。`legacyTheme` 用 `if (s.themeFamily === "night") return s.nightSkin;` 提前返回，其余返回 `themeMode`。

- [x] **Step 4: 运行测试确认通过**

Run: `node --import tsx --test src/lib/theme-model.test.ts`
Expected: PASS，3 个 test。

- [x] **Step 5: Commit**

```bash
git add src/lib/theme-model.ts src/lib/theme-model.test.ts
git commit -m "feat(theme): add the family/mode model and its legacy mapping"
```

---

### Task 3: 色彩引擎 `m3.ts`

**Files:**
- Modify: `package.json:22-30`（dependencies）
- Create: `src/lib/m3.ts`
- Create: `src/lib/m3.test.ts`

**Interfaces:**
- Consumes: `M3Variant`, `FALLBACK_SEED` from `./theme-model`
- Produces:
  - `const M3_VARS: readonly string[]` —— 30 个 CSS 变量名（含 `--` 前缀），按 `buildPalette` 的返回键一一对应
  - `function normalizeSeed(v: unknown): string` —— 合法 `#RRGGBB` 原样返回（大写），否则返回 `""`
  - `function buildPalette(seed: string, isDark: boolean, variant: M3Variant): Record<string, string>`

- [x] **Step 1: 装依赖**

Run: `npm install @material/material-color-utilities@^0.4.0`
Expected: `package.json` dependencies 多一条，`node_modules/@material/material-color-utilities` 存在。

- [x] **Step 2: 写失败测试 `src/lib/m3.test.ts`**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { Hct } from "@material/material-color-utilities";
import { buildPalette, M3_VARS, normalizeSeed } from "./m3";
import { PALETTES, VARIANTS } from "./theme-model";

test("is deterministic and covers every variable", () => {
  const a = buildPalette("#C4573A", true, "tonalSpot");
  const b = buildPalette("#C4573A", true, "tonalSpot");
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a).sort(), [...M3_VARS].sort());
  for (const v of M3_VARS) assert.match(a[v], /^(#[0-9a-f]{6,8}|rgba?\()/i, v);
});

test("every variant and mode yields a full palette", () => {
  for (const variant of VARIANTS) {
    for (const isDark of [false, true]) {
      const p = buildPalette("#5F88A8", isDark, variant);
      assert.equal(Object.keys(p).length, M3_VARS.length, `${variant}/${isDark}`);
      for (const v of M3_VARS) assert.ok(p[v], `${variant}/${isDark} ${v}`);
    }
  }
});

test("keeps body text readable in both modes", () => {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1, 7), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  for (const isDark of [false, true]) {
    const p = buildPalette("#C4573A", isDark, "tonalSpot");
    const [hi, lo] = [lum(p["--paper"]), lum(p["--ink"])].sort((x, y) => y - x);
    assert.ok((hi + 0.05) / (lo + 0.05) >= 4.5, `contrast ${isDark}`);
  }
});

test("a different seed moves the accent", () => {
  const a = buildPalette(PALETTES[0].hex, false, "tonalSpot");
  const b = buildPalette(PALETTES[3].hex, false, "tonalSpot");
  assert.notEqual(a["--terra"], b["--terra"]);
});

test("derives --sky about 150 degrees away from the accent", () => {
  const p = buildPalette("#C4573A", false, "tonalSpot");
  const hex = (s: string) => parseInt(s.slice(1, 7), 16);
  const d = Math.abs(Hct.fromInt(hex(p["--terra"])).hue - Hct.fromInt(hex(p["--sky"])).hue);
  const delta = Math.min(d, 360 - d);
  assert.ok(Math.abs(delta - 150) <= 6, `delta ${delta}`);
});

test("rejects malformed seeds instead of throwing", () => {
  assert.equal(normalizeSeed("#c4573a"), "#C4573A");
  assert.equal(normalizeSeed("#GGGGGG"), "");
  assert.equal(normalizeSeed("red"), "");
  assert.equal(normalizeSeed("#12345"), "");
  assert.equal(normalizeSeed(42), "");
  assert.equal(normalizeSeed(undefined), "");
  // A bad seed must still produce a usable palette via the fallback.
  assert.ok(buildPalette(normalizeSeed("nope"), true, "expressive")["--ink"]);
});
```

- [x] **Step 3: 运行测试确认失败**

Run: `node --import tsx --test src/lib/m3.test.ts`
Expected: FAIL — `Cannot find module './m3'`。

- [x] **Step 4: 实现 `src/lib/m3.ts`**

```ts
export function normalizeSeed(v: unknown): string {
  // 只认 #RRGGBB：备份文件与手写配置都可能送来任何东西。
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : "";
}

export function buildPalette(seed: string, isDark: boolean, variant: M3Variant): Record<string, string> { ... }
```

`buildPalette` 内部：`const hex = (normalizeSeed(seed) || FALLBACK_SEED).slice(1);` 然后 `const source = Hct.fromInt(parseInt(hex, 16) | 0xff000000);`（**必须**先切掉 `#`，否则 `parseInt` 从首字符就停、返回 NaN），再 `new DynamicScheme(...)` —— **注意** 0.4.0 的构造入口是 `SchemeConstructor(variant)` 或各 `SchemeXxx` 类，写实现时先用 `VARIANTS` 里的名字到 `dynamiccolor/` 目录确认导出名，统一走 `new SchemeTonalSpot(hct, isDark, 0, "2025")` 这种带 `specVersion` 的签名。取色用 `MaterialDynamicColors.primary.getArgb(scheme)` 等，转成 `#RRGGBB`。

角色映射严格按 spec §5.2 的表；`--line` 用 `outlineVariant` 的 `#RRGGBBAA`（alpha 60%），`--line-strong` 同样但 90%；`--glow` / `--mark` 用 primary / tertiary 的 8 位带 alpha 形式；`--card` 浅色取 `surfaceContainerLowest`、深色取 `surfaceContainerLow`；`--sky` 单独由 `Hct.from(source.hue - 150 + 360) % 360, 20, isDark ? 72 : 55` 算。`--plum` 不在返回表里。

`M3_VARS` 精确这 22 项，顺序即数组顺序（测试按此断言）：

```
--paper  --paper-2  --paper-3  --card  --card-2  --ink  --ink-2  --ink-3  --ink-4
--line  --line-strong  --terra  --terra-ink  --terra-soft  --ochre  --ochre-soft
--sage  --sage-ink  --sage-soft  --sky  --glow  --mark
```

`--shadow-sm` / `--shadow` / `--shadow-lg` / `--plum` 不参与：前三个沿用 app.css 的静态两套阴影，`--plum` 全库 0 处引用。`--card-2` 映射 `surfaceContainer`。

- [x] **Step 5: 运行测试确认通过**

Run: `node --import tsx --test src/lib/m3.test.ts`
Expected: PASS，6 个 test。若色相断言失败，先确认 `Hct.fromInt` 收到的是 `0xffRRGGBB`（漏 alpha 会让 hue 全错）。

- [x] **Step 6: 确认可以进 iife 单文件**

Run: `npm run build:android`
Expected: 构建通过；`dist-android/assets/app.js` gzip 后与 177,145 B 相比增量在 15–30 KB 之间（实测 21.3 KB）。若超出 40 KB，说明 9 个 scheme 未被 tree-shake，检查是否 `import * as` 全集引入。

- [x] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/m3.ts src/lib/m3.test.ts
git commit -m "feat(theme): compute the M3 expressive palette at runtime from a seed"
```

---

### Task 4: 设置模型迁移

**Files:**
- Modify: `src/store/store.ts`（:10-18 类型、:63-110 Settings 与默认值、:221-245 `sanitizeSettings`、:362-377 两个导出函数）
- Modify: `src/store/web-backup.ts:138-164`（`webSettings`）
- Modify: `src/store/store.test.ts:25-32,70-78`
- Modify: `src/store/web-backup.test.ts:54-80`

**Interfaces:**
- Consumes: `fromLegacyTheme`, `legacyTheme`, `ThemeFamily`, `ThemeMode`, `NightSkin`, `M3Variant` from `../lib/theme-model`；`normalizeSeed` from `../lib/m3`
- Produces: `Settings` 新字段 `themeFamily` / `themeMode` / `nightSkin` / `m3Variant` / `m3Accent`；`Theme`、`THEMES`、`SKINS`、`isSkin` 全部删除。

- [x] **Step 1: 改 `store.test.ts` 的两处旧断言（先让测试红）**

`:27-31` 去掉 `theme: "dark"` 断言，改为：

```ts
const s = sanitizeSettings({ accent: "fr", dailyNew: 1e9, theme: "dark", retention: 0.5 });
assert.equal(s.accent, "uk");
assert.equal(s.dailyNew, 10);
assert.equal(s.themeFamily, "ink");
assert.equal(s.themeMode, "dark");
assert.equal(s.retention, 0.9);
```

`:70-78` 整块替换为：

```ts
test("maps the five legacy themes and drops unknown ones", () => {
  assert.deepEqual(
    [sanitizeSettings({ theme: "aurora" }).themeFamily, sanitizeSettings({ theme: "aurora" }).nightSkin],
    ["night", "aurora"],
  );
  assert.deepEqual(
    [sanitizeSettings({ theme: "starlight" }).themeFamily, sanitizeSettings({ theme: "starlight" }).nightSkin],
    ["night", "starlight"],
  );
  const d = sanitizeSettings({});
  assert.equal(d.themeFamily, "ink");
  assert.equal(d.themeMode, "dark");
  assert.equal(sanitizeSettings({ theme: "sepia" }).themeFamily, "ink");
  assert.equal(sanitizeSettings({ theme: "sepia" }).m3Variant, "tonalSpot");
});

test("accepts the new fields and rejects junk in each", () => {
  const s = sanitizeSettings({
    themeFamily: "m3e", themeMode: "system", nightSkin: "starlight",
    m3Variant: "expressive", m3Accent: "#5f88a8",
  });
  assert.equal(s.themeFamily, "m3e");
  assert.equal(s.themeMode, "system");
  assert.equal(s.nightSkin, "starlight");
  assert.equal(s.m3Variant, "expressive");
  assert.equal(s.m3Accent, "#5F88A8");

  assert.equal(sanitizeSettings({ themeFamily: "neon" }).themeFamily, "ink");
  assert.equal(sanitizeSettings({ themeMode: "dim" }).themeMode, "dark");
  assert.equal(sanitizeSettings({ nightSkin: "milky" }).nightSkin, "aurora");
  assert.equal(sanitizeSettings({ m3Variant: "pastel" }).m3Variant, "tonalSpot");
  assert.equal(sanitizeSettings({ m3Accent: "red" }).m3Accent, "wallpaper");
  assert.equal(sanitizeSettings({ m3Accent: "#GGG" }).m3Accent, "wallpaper");
});
```

- [x] **Step 2: 运行确认失败**

Run: `node --import tsx --test src/store/store.test.ts`
Expected: FAIL —— `s.themeFamily` 为 `undefined`。

- [x] **Step 3: 改 `store.ts` 的类型与默认值**

删除 `:10` 的 `Theme` 联合、`:14` `THEMES`、`:17` `SKINS`、`:18` `isSkin`，改从 `../lib/theme-model` 重导出类型与常量。`Settings`（:63-88）删 `theme: Theme`，加：

```ts
themeFamily: ThemeFamily;
themeMode: ThemeMode;
nightSkin: NightSkin;
m3Variant: M3Variant;
/** "#RRGGBB", or "wallpaper" to follow the phone's wallpaper. */
m3Accent: string;
```

`defaultSettings`（:90-110）把 `theme: "dark"` 换成 `themeFamily: "ink", themeMode: "dark", nightSkin: "aurora", m3Variant: "tonalSpot", m3Accent: "wallpaper"`。

- [x] **Step 4: 改 `sanitizeSettings`（:221-245）**

原 `:231` 那行替换为先读旧值、再覆盖：

```ts
const legacy = fromLegacyTheme((v as Record<string, unknown>).theme);
const s: Settings = { ...defaultSettings };
if (legacy) Object.assign(s, legacy);
```

随后逐字段校验（白名单数组判断），`m3Accent` 用 `normalizeSeed(v.m3Accent) || "wallpaper"`。

- [x] **Step 5: 改两个导出函数**

`exportBackup()`（:362）与 `exportWebBackup()`（:373）里，凡出现 `theme: settings.theme` 的地方全部换成 `theme: legacyTheme(settings)`；`web-backup.ts:150` 同样。**不要**把 5 个新字段写进载荷。

- [x] **Step 6: 改 `web-backup.test.ts:54-80`**

`cases` 数组里的 5 个 `{ theme: ... }` 改为新模型等价物（`{ themeFamily: "ink", themeMode: "system" }` 等），断言改为「`webSettings` 产出的 `theme` 落在上游五值白名单内」：

```ts
test("the folded theme always stays inside the site's five values", () => {
  const ok = ["system", "light", "dark", "aurora", "starlight"];
  for (const patch of cases) {
    const s = { ...defaultSettings, ...patch };
    assert.ok(ok.includes(webSettings(s).theme as string), JSON.stringify(patch));
  }
});
```

- [x] **Step 7: 运行全部测试**

Run: `npm test`
Expected: 全部 PASS。若有 tsx 编译错误指向别处 `settings.theme`，`grep -rn "settings.theme\|\.theme ===\|theme: " src` 一并清理（App.tsx 与 Me.tsx 允许暂时红，Task 5/6 修）。

- [x] **Step 8: Commit**

```bash
git add src/store/store.ts src/store/web-backup.ts src/store/store.test.ts src/store/web-backup.test.ts
git commit -m "feat(theme): migrate settings to family/mode and keep backups unchanged"
```

---

### Task 5: 应用层与状态栏

**Files:**
- Modify: `src/lib/theme.ts`（全文重写，39 行）
- Modify: `src/App.tsx:38-55`（`useTheme`）
- Modify: `src/lib/native.ts:10-31,169-221`（`Shell` 接口 + `wallpaperSeed`）

**Interfaces:**
- Consumes: `buildPalette`, `normalizeSeed`, `M3_VARS` from `./m3`；`ThemeFamily` / `ThemeMode` / `NightSkin` / `M3Variant` from `./theme-model`
- Produces:
  - `resolveMode(family: ThemeFamily, mode: ThemeMode, nightSkin: NightSkin, systemDark: boolean): "light" | "dark"`
  - `chromeColor(family, mode, nightSkin, palette: Record<string, string> | null): string`
  - `useThemeSettings(): { family; mode; nightSkin; variant; accent; palette: Record<string,string> | null }`
  - `native.ts`: `Shell.wallpaperColor?(): string`，导出 `function wallpaperSeed(): string`

- [x] **Step 1: `theme.ts` 重写**

`resolveMode`：`if (family === "night") return "dark"; if (mode === "system") return systemDark ? "dark" : "light"; return mode;`

`chromeColor`：`if (family === "m3e" && palette) return palette["--paper"];` 其余沿用原 `CHROME` 表（`night` 用 `nightSkin` 取 `aurora`/`starlight` 项）。

`useThemeSettings`：`const s = useStore((x) => x.settings);` 取五个字段，`useMemo` 里在 `family === "m3e"` 时算 `buildPalette(normalizeSeed(accent) || wallpaperSeed() || FALLBACK_SEED, mode === "dark", variant)`，否则 `null`。依赖数组必须含 `systemDark`，否则系统切深浅不会重算。

- [x] **Step 2: `native.ts` 加壁纸色**

`Shell` 接口加 `wallpaperColor?(): string;`。新增：

```ts
/** The phone's wallpaper accent as "#RRGGBB", or "" when the shell cannot tell. */
export function wallpaperSeed(): string {
  try {
    return normalizeSeed(shell?.wallpaperColor?.()) || "";
  } catch {
    return "";
  }
}
```

（`normalizeSeed` 从 `./m3` import；此处只做一次同步调用，不缓存——`shell` 缺失时返回 `""`。）

- [x] **Step 3: 改 `App.tsx:38-55`**

```ts
function useTheme() {
  const { family, mode, nightSkin, palette } = useThemeSettings();
  const font = useStore((s) => s.settings.wordFont);
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", mode);
    root.setAttribute("data-family", family);
    if (family === "night") root.setAttribute("data-skin", nightSkin);
    else root.removeAttribute("data-skin");
    root.setAttribute("data-font", font);
    // Expressive colours are computed, not authored in CSS: write them inline,
    // and clear every one on the way out or the paper theme inherits them.
    for (const k of M3_VARS) {
      const v = family === "m3e" ? palette?.[k] : "";
      if (v) root.style.setProperty(k, v);
      else root.style.removeProperty(k);
    }
    const color = chromeColor(family, mode, nightSkin, palette);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
    setChrome(color, mode === "dark");
  }, [family, mode, nightSkin, palette, font]);
  return mode;
}
```

- [x] **Step 4: 类型检查**

Run: `npx tsc -b`
Expected: 只剩 `Me.tsx` 的报错（Task 6 修）；`App.tsx` / `theme.ts` / `native.ts` 干净。

- [x] **Step 5: Commit**

```bash
git add src/lib/theme.ts src/App.tsx src/lib/native.ts
git commit -m "feat(theme): paint the computed palette onto the document root"
```

---

### Task 6: 选择器 UI

**Files:**
- Modify: `src/pages/Me.tsx:13-29`（两张旧表）、`:209-225`（主题 Field）
- Modify: `src/styles/app.css`（`.theme-picker` 旁新增家族/风格两组样式）

**Interfaces:**
- Consumes: `VARIANTS` / `VARIANT_LABEL` / `PALETTES` from `../lib/theme-model`；`buildPalette` from `../lib/m3`；`store.settings(patch)`
- Produces: 无（纯 UI）

- [x] **Step 1: 删旧表、加家族表**

删除 `SWATCH`（:14-21）与 `THEME_LABEL`（:23-29），换成：

```ts
const FAMILIES: [ThemeFamily, string, string][] = [
  ["ink", "纸墨", "浅色纸面与陶土点缀，就是现在的样子。"],
  ["night", "夜空", "把整页配色换成极光或星光的深空。"],
  ["m3e", "Material Expressive", "跟随壁纸取色，圆角更柔和，回弹更活泼。"],
];
```

- [x] **Step 2: 写三组控件**

`:209-225` 的那个 `<Field label="主题">` 换成：

1. `<Field label="主题家族" stack>`：三个按钮，`onClick={() => set({ themeFamily: k })}`
2. 深浅 Field：`themeFamily === "night"` 时渲染 `[["aurora","极光"],["starlight","星光"]]` 两个按钮，否则渲染 `[["system","跟随系统"],["light","浅色"],["dark","深色"]]` 三个按钮（**不是灰掉，是换一组**）
3. 仅 `themeFamily === "m3e"` 时：强调色 Field（「跟随壁纸」按钮 + `PALETTES.map` 的 8 个色点，`onClick={() => set({ m3Accent: hex })}`）与调色板风格 Field（`VARIANTS.map`）

- [x] **Step 3: Variant chip 用实时算色**

每个 Variant chip 复用 `.theme-chip` 的两层 `<i />` 结构，三色预览这样算：

```tsx
const p = useMemo(() => buildPalette(seed, mode === "dark", variant), [seed, mode, variant]);
// style={{ "--tp": p["--paper"], "--ts": p["--card"], "--ta": p["--terra"] }}
```

`seed` 取「当前 m3Accent（非 wallpaper 时）→ `wallpaperSeed()` → `FALLBACK_SEED`」。9 个 chip 各算一次，`useMemo` 放到 `.map` 内层的子组件里（新建 `ThemeChip` 组件），否则违反 hooks 规则。

- [x] **Step 4: 样式**

`.theme-picker` 已有网格；家族按钮的 chip 用静态三色（纸墨 `#f6f1e7/#fffdf8/#cb922c`、夜空 `#05060f/#171d35/#4fe8b8`、M3E 用当前种子实算）。色点用 28px 圆形，选中态加 `outline: 2px solid var(--ink)`。

- [x] **Step 5: 类型检查 + 构建**

Run: `npx tsc -b && npm run build`
Expected: 均通过。

- [x] **Step 6: 目视验收（dev server）**

Run: `npm run dev`，开 `/me` 页：
- 切三个家族，页面配色立即变
- 切回纸墨，`documentElement.style` 里不留任何 M3 变量（DevTools 里检查）
- M3E 下点不同 Variant，chip 预览与页面同时变

- [x] **Step 7: Commit**

```bash
git add src/pages/Me.tsx src/styles/app.css
git commit -m "feat(theme): pick family, depth, accent and palette style from Me"
```

---

### Task 7: 安卓壁纸取色

**Files:**
- Modify: `android/app/src/main/java/tech/wordatlas/app/MainActivity.java`（`Bridge` 类内，`:798-807` `systemTheme()` 之后）
- Modify: `docs/android.md:120-125`

**Interfaces:**
- Consumes: JS 侧 `native.wallpaperSeed()`（Task 5）
- Produces: `WordAtlasAndroid.wallpaperColor(): String` —— `"#RRGGBB"` 或 `""`

- [x] **Step 1: 在 `Bridge` 里加方法**

```java
/** The phone's wallpaper accent as "#RRGGBB"; "" when this ROM will not tell us. */
@JavascriptInterface
public String wallpaperColor() {
    String cached = wallpaperCache;
    if (cached != null) return cached;
    String color = "";
    try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            int c = getResources().getColor(android.R.color.system_accent1_500, getTheme());
            color = String.format("#%06X", 0xFFFFFF & c);
        }
    } catch (Throwable ignored) { color = ""; }
    if (color.isEmpty() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        try {
            WallpaperManager wm = WallpaperManager.getInstance(MainActivity.this);
            WallpaperColors wc = wm.getWallpaperColors(WallpaperManager.FLAG_SYSTEM);
            if (wc != null) {
                int c = wc.getPrimaryColor().toArgb();
                color = String.format("#%06X", 0xFFFFFF & c);
            }
        } catch (Throwable ignored) { color = ""; }
    }
    wallpaperCache = color;
    return color;
}
```

`Bridge` 里加字段 `private volatile String wallpaperCache;`，并 import `android.app.WallpaperManager` / `android.app.WallpaperColors` / `android.os.Build`（`System` 分支用 `android.R.color.system_accent1_500`，无需额外 import）。

> 注意 `system_accent1_500` 是 `android.R.color` 资源名，只在 `S+` 存在；`getColor(int, Theme)` 也要求 `M+`，但已由版本判断保护。`WallpaperManager.getWallpaperColors` 要求 `O_MR1+`（27）。

- [x] **Step 2: 构建 APK**

Run: `npm run build:android && npm run apk`
Expected: `scripts/android/build_apk.py` 编译通过，产出 APK 路径打印出来。

- [x] **Step 3: 真机/模拟器验证**

装到 API 31+ 与 API 30 各一台（或 30 用 `adb shell setprop` 无法模拟，直接看回退）：
- M3E + 跟随壁纸 → 强调色接近壁纸主色
- 桌面模拟器无壁纸 → 落到 terra `#C4573A`，页面正常
- 检查无权限申请弹窗

- [x] **Step 4: Commit**

```bash
git add android/app/src/main/java/tech/wordatlas/app/MainActivity.java docs/android.md
git commit -m "feat(android): expose the wallpaper accent to the web layer"
```

---

### Task 8: 弹簧曲线

**Files:**
- Create: `scripts/gen-motion.mjs`
- Modify: `src/styles/app.css`（M3E 段补两条曲线 + `@supports` 回退）
- Modify: `package.json:6-21`（`"gen:motion"`）

**Interfaces:**
- Consumes: 无
- Produces: 打印到 stdout 的 CSS 片段 `--ease: linear(...);  --spring: linear(...);`，由人粘贴进 `app.css`（脚本不写文件，避免构建期副作用）

- [x] **Step 1: 写生成脚本**

参数在脚本头部集中声明：`--ease` = damping 0.8 / stiffness 380，`--spring` = damping 0.72 / stiffness 320，mass 1，采样 40 点、总时长 0.5s。阻尼振荡解析解 `x(t) = 1 - e^(-ζωt)(cos(ω_d t) + (ζω/ω_d) sin(ω_d t))`，`ω = sqrt(k/m)`，`ω_d = ω sqrt(1-ζ²)`；归一化到 `[0,1]` 后输出 `linear(0, 0.123, ...)` 保留 3 位小数。

- [x] **Step 2: 生成并核对**

Run: `node scripts/gen-motion.mjs`
Expected: 输出两行，首值 `0`，末值 `1`，单调递增（允许末端 ±0.002 过冲后回落）。若出现 NaN，检查 `1-ζ²` 是否为正。

- [x] **Step 3: 粘进 `app.css` 的 M3E 段**

Task 1 建的 `:root[data-family="m3e"]` 块内追加两条曲线，并加回退块：

```css
@supports not (animation-timing-function: linear(0, 1)) {
  :root[data-family="m3e"] {
    --ease: cubic-bezier(0.2, 0, 0, 1);
    --spring: cubic-bezier(0.34, 1.35, 0.2, 1);
  }
}
```

- [x] **Step 4: 构建 + 目视**

Run: `npm run build`，然后 dev 环境切到 M3E，点按钮/开 Sheet 看回弹是否比纸墨更「活」。
Expected: 纸墨与夜空动效完全不变；M3E 有轻微过冲。

- [x] **Step 5: Commit**

```bash
git add scripts/gen-motion.mjs src/styles/app.css package.json
git commit -m "feat(theme): swap in spring easing for the expressive family"
```

---

### Task 9: 文档与整体验收

**Files:**
- Modify: `README.md:45,86`
- Modify: `docs/android.md:120-125`
- Modify: `docs/android-widgets.md:295`
- Create: `docs/theme.md`

**Interfaces:**
- Consumes: 全部前序任务的产出
- Produces: 无

- [x] **Step 1: 写 `docs/theme.md`**

四节：三家族与五字段的数据模型、色彩层（种子三级回退 + 角色映射表 + 为什么用 2025 spec）、形状层（11 档表 + 白名单 + `check:shape`）、动效层（参数、`gen:motion` 复现方式、`@supports` 回退）。明确写一句「本项目的 Expressive 形状与曲线是对规范的解读，不是官方数值」。

- [x] **Step 2: 改三处既有文档**

- `README.md:45` 主题行补「Material Expressive（跟随壁纸取色 / 9 种调色板风格）」
- `docs/android.md:123` 状态栏行补「M3E 下取算出的 surface」
- `docs/android-widgets.md:295` 补一句「桌面小部件不跟随 Material Expressive，仍走 values/values-night 两态」

- [x] **Step 3: 全量验证**

```bash
npm run check:shape && npx tsc -b && npm test && npm run build && npm run build:android
```

Expected: 五条全绿；记录 `dist-android/assets/app.js` gzip 尺寸，与 177,145 B 的基线对比写进 commit message。

- [x] **Step 4: 真机走一遍 Review Focus 五条**

1. 模拟器（无壁纸）下 M3E 取到 terra，页面不黑不透明
2. 家族 m3e → ink 来回切 5 次，`documentElement.style` 为空
3. 备份文件手改成 `"m3Accent": "red"` 后导入，仍能进 M3E 且不崩
4. 拿一份 2025 年的旧备份（只有 `theme: "aurora"`）导入，落到 night + aurora
5. 应用在前台时在系统设置里切深浅，M3E 跟随模式下整块配色跟着变

- [x] **Step 5: Commit**

```bash
git add README.md docs/android.md docs/android-widgets.md docs/theme.md
git commit -m "docs: describe the expressive theme family and its tokens"
```

---

## 附：任务间依赖

Task 1 独立。Task 2 → 3 → 4 → 5 → 6 串行（后者 import 前者的类型与函数）。Task 7 只依赖 Task 5 的 `wallpaperSeed()` 签名。Task 8 只依赖 Task 1 建的 M3E 段。Task 9 在最后。

Task 1 与 Task 2/3 可并行（不同文件），Task 7 与 Task 6 可并行（Java vs TSX）。
