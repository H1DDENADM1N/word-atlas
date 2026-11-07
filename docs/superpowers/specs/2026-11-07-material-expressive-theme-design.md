# 词光 · Material Expressive 2025 主题系列 — 设计规格

- 日期：2026-11-07
- 分支：`dev/android`
- 状态：待用户复核（批准后才进 writing-plans）

---

## 1. 目标

为安卓版词光新增第三套主题家族 **Material Expressive 2025**，与现有「纸墨」「夜空」并列：

- 深浅三态：跟随系统 / 浅色 / 深色
- 强调色：默认跟随系统壁纸主色，另提供 8 个精选色板
- 调色板风格：9 种 Material Variant 全部可选
- 形状与动效语言：M3 Expressive 的圆角比例与弹簧曲线，**只在 M3E 家族生效**

### 非目标

- 不改桌面小部件（仍走 `values/` + `values-night/` 浅深两态，见 `docs/android-widgets.md:295`）
- 不做 M3 字号阶梯（V1 明确砍掉）
- 不让 M3E 成为默认主题（老用户升级观感零变化）
- 不把主题写进备份（见 §4.4）

---

## 2. 决策记录

| # | 决定 | 依据 |
|---|---|---|
| 1 | 做到「色彩 + 形状/动效」两层，不止配色 | 用户选 B |
| 2 | 形状/动效只在 M3E 生效，纸墨与夜空不变 | 用户选 A |
| 3 | 强调色默认跟随壁纸，另有精选色板 | 用户原话：「默认使用跟随系统壁纸颜色，外加可选精选色板」 |
| 4 | 两级结构：家族（纸墨/夜空/M3E）+ 模式 | 用户选 A |
| 5 | 9 种 Variant 全部露出 | 用户选 B |
| 6 | 实现路线：运行时色彩引擎（打包官方库） | 用户选「方案 1」 |
| 7 | `--sky` 由种子色反色相派生（hue−150°） | 用户选 A |
| 8 | 兜底种子色 = 品牌 terra `#C4573A` | 用户确认 |
| 9 | 形状层走**令牌化重构**（不是覆盖段） | 用户明确选择 |
| 10 | V1 不做字号阶梯 | 用户确认 |
| 11 | 默认 Variant = TonalSpot（标准） | 用户选 A |
| 12 | 接受依赖与包体增量 | 用户确认 |
| 13 | 备份**维持现状**：仍写旧 `theme` 字段，不新增主题字段 | 用户选 C |

---

## 3. 依赖与实测成本

新增唯一运行时依赖：

```json
"@material/material-color-utilities": "^0.4.0"
```

该版本已内置 M3 **Expressive 2025 色彩规范**：`SpecVersion = '2021' | '2025'`，`ColorSpecDelegateImpl2025` 提供 `primaryDim/secondaryDim/tertiaryDim/errorDim` 等新增角色；各 Scheme 构造签名为
`constructor(sourceColorHct: Hct, isDark: boolean, contrastLevel: number, specVersion?: SpecVersion, platform?: Platform)`。

**已实测**（`%TEMP%` 独立打包，未触碰仓库）：

| 打包内容 | raw | gzip |
|---|---|---|
| 只留 1 个 scheme | 113,124 B | 21,181 B |
| 9 个 scheme 全留 | 114,692 B | 21,317 B |
| 现有 `dist-android/assets/app.js` | 568,135 B | 177,145 B |

结论：成本几乎全在核心（HCT + CAM16 + palettes + MaterialDynamicColors），**额外 8 个变体只多 136 B gzip**。总增量 **+21.3 KB gzip（+12%）**，低于 40 KB 阈值，tree-shaking 正常。

---

## 4. 数据模型

### 4.1 新字段

`src/store/store.ts` 的 `Settings` 删除 `theme: Theme`，新增 5 个字段：

```ts
export type ThemeFamily = "ink" | "night" | "m3e";
export type ThemeMode = "system" | "light" | "dark";
export type NightSkin = "aurora" | "starlight";
export type M3Variant =
  | "monochrome" | "neutral" | "tonalSpot" | "vibrant" | "expressive"
  | "fidelity" | "content" | "rainbow" | "fruitSalad";

themeFamily: ThemeFamily;              // 默认 "ink"
themeMode: ThemeMode;                  // 默认 "dark"
nightSkin: NightSkin;                  // 默认 "aurora"
m3Variant: M3Variant;                  // 默认 "tonalSpot"
m3Accent: "wallpaper" | string;        // 默认 "wallpaper"，否则 "#RRGGBB"
```

`Theme`、`THEMES`、`SKINS`、`isSkin` 一并废弃。`nightSkin` 仅在 `themeFamily === "night"` 时有意义。

### 4.2 旧值迁移（`sanitizeSettings` 内）

| 旧 `theme` | 新 |
|---|---|
| `"system"` | `ink` + `system` |
| `"light"` | `ink` + `light` |
| `"dark"` | `ink` + `dark` |
| `"aurora"` | `night` + `nightSkin:"aurora"` |
| `"starlight"` | `night` + `nightSkin:"starlight"` |

老用户默认 `theme:"dark"` → `ink + dark`，升级后视觉零变化。M3E 完全自愿启用。

### 4.3 派生：回写旧值

`legacyTheme(settings): string` 把新模型折回旧枚举，供备份与网站方言使用：

- `ink` + `system|light|dark` → `"system" | "light" | "dark"`
- `night` + `aurora|starlight` → `"aurora" | "starlight"`
- `m3e` + `system|light|dark` → `"system" | "light" | "dark"`（旧枚举无 M3E，只能退化）

### 4.4 备份：维持现状

按用户决定，备份不承载新主题数据：

- `exportBackup()`（`store.ts:362`）载荷形状不变，`settings.theme` 写 `legacyTheme(...)`，**不新增** 5 个字段
- `exportWebBackup()` / `webSettings()`（`web-backup.ts:150`）同样写 `legacyTheme(...)`，保持与上游站点逐键校验的兼容
- 导入端 `sanitizeSettings(data.settings)` 照旧解析 `theme`，映射进新模型

**已知且接受的限制**：主题不随备份迁移。M3E 下恢复备份会退回纸墨。这符合「备份只管学习数据」，且壁纸派生的主题本来就与设备绑定。

---

## 5. 色彩层

### 5.1 模块

新增 `src/lib/m3.ts`：

```ts
export function buildPalette(seed: string, isDark: boolean, variant: M3Variant): Record<string, string>;
```

纯函数，返回**应用既有令牌名**到色值的映射（不引入 `--m3-*` 命名空间）。内部用
`new Scheme<Variant>(Hct.fromInt(argb), isDark, 0, "2025")` 取角色，再按 §5.2 映射。

### 5.2 角色映射

| 应用令牌 | M3 角色 |
|---|---|
| `--paper` | `surface` |
| `--paper-2` / `--paper-3` | `surfaceContainerLow` / `surfaceContainer` |
| `--card` | `surfaceContainerLowest`（浅色）/ `surfaceContainerLow`（深色） |
| `--ink` / `--ink-2` | `onSurface` / `onSurfaceVariant` |
| `--ink-3` / `--ink-4` | `outline` / `outlineVariant` |
| `--line` / `--line-strong` | `outlineVariant` + alpha 0.60 / 0.90（JS 直接算成 `rgba(...)`） |
| `--terra` / `--terra-ink` / `--terra-soft` | `primary` / `onPrimaryContainer` / `primaryContainer` |
| `--sage` / `--sage-ink` / `--sage-soft` | `secondary` / `onSecondaryContainer` / `secondaryContainer` |
| `--ochre` / `--ochre-soft` | `tertiary` / `tertiaryContainer` |
| `--glow` / `--mark` | `primary` / `tertiary` + alpha（浅 0.26/0.32，深 0.14/0.28） |
| `--sky` | `Hct(hue−150°, chroma 20, tone 浅 55 / 深 72)` |
| `--plum` | 不提供（全库 0 处使用） |
| `--shadow-*` | 不变，沿用既有浅/深两套 |

`--card` 必须分模式：M3 浅色下 `surfaceContainerLowest` 最亮，深色下最暗。

### 5.3 种子来源（三级回退）

1. 用户选了精选色板 → 该色
2. `m3Accent === "wallpaper"` → 原生 `wallpaperColor()`（见 §8）
3. 都拿不到 → `#C4573A`

精选色板 8 色（前五个是现有颜料，保证换家族时仍有连贯感）：

```
陶土 #C4573A  赭石 #CB922C  苔绿 #6A8C63  天青 #5F88A8
梅紫 #9A6283  石墨 #5B6068  松青 #2F6B5F  靛蓝 #3F51B5
```

### 5.4 写入方式

只在 `useTheme()`（`src/App.tsx:38-55`）里写：

```ts
root.setAttribute("data-family", family);            // ink | night | m3e
if (family === "m3e") 对 30 个变量执行 root.style.setProperty(...)
else                  逐个 removeProperty（回到 app.css 静态值）
```

内联样式权重最高，不依赖 CSS 顺序；切走时必须整体清空，否则会残留。

---

## 6. 形状层：令牌化重构

### 6.1 阶梯（11 档，默认值吸附现有 82 处硬编码）

| 令牌 | 默认（纸墨/夜空） | M3E | 吸附现值 |
|---|---|---|---|
| `--shape-none` | 0 | 0 | 0 |
| `--shape-xs` | 4px | 6px | 1, 3, 4 |
| `--shape-sm` | 8px | 10px | 6, 8 |
| `--shape-md` | 12px | 16px | 10, 11, 12, 13, 14 |
| `--shape-lg` | 16px | 20px | 16 |
| `--shape-xl` | 20px | 24px | 18, 20 |
| `--shape-2xl` | 24px | 28px | 22, 24 |
| `--shape-3xl` | 28px | 32px | 28 |
| `--shape-4xl` | 32px | 36px | 32 |
| `--shape-5xl` | 36px | 40px | 36 |
| `--shape-full` | 999px | 999px | 999 |

既有 `--r-sm`(10) / `--r`(16) / `--r-lg`(24) / `--r-xl`(32) 删除，分别迁到 `--shape-md` / `--shape-lg` / `--shape-2xl` / `--shape-4xl`（仅 10→12 有 2px 位移）。

### 6.2 白名单

仅 3 处 hairline 保留裸值，并在护栏脚本白名单里显式登记：

- `.amb-bars i { border-radius: 1px }`
- `::view-transition-new(word-art) { border-radius: 20px }`（伪元素，不参与主题）
- 其余 79 处全部替换为 `var(--shape-*)`

### 6.3 防回退

新增 `scripts/check-shape-tokens.mjs`：

1. 断言 `src/styles/app.css` 中不存在白名单之外的 `border-radius: <数字>px`
2. 断言 `:root[data-family="m3e"]` 段覆盖了全部 `--shape-*` 令牌

接入 `npm test` 之外单独执行（`npm run check:shape`），并在 CI/提交前提示。

---

## 7. 动效层

### 7.1 只换曲线

`--ease`（56 处引用）与 `--spring`（16 处）在 `:root[data-family="m3e"]` 段重定义，即可让全站动效一起切换，**不改任何 `transition` 与 `animation` 声明**。

### 7.2 参数

| 令牌 | 物理参数 | 说明 |
|---|---|---|
| `--ease` | damping 0.8 / stiffness 380 | Expressive 的空间位移默认手感 |
| `--spring` | damping 0.72 / stiffness 320 | 回弹更强的强调手感 |

曲线用 CSS `linear()` 表达（采样 40 点），由 `scripts/gen-motion.mjs` 生成并提交其输出；脚本内记录 (damping, stiffness, mass) 以便复现。该组参数是**本项目对 Expressive 的解读**，不作为官方数值声明。

### 7.3 兼容

```css
@supports not (animation-timing-function: linear(0, 1)) {
  :root[data-family="m3e"] { --ease: cubic-bezier(0.2, 0, 0, 1); --spring: cubic-bezier(0.34, 1.35, 0.2, 1); }
}
```

---

## 8. 安卓桥

`MainActivity.java:122` 已有 `web.addJavascriptInterface(new Bridge(), "WordAtlasAndroid")`，`Bridge` 在 `:697`–`:880`。新增一个同步方法：

```java
@JavascriptInterface
public String wallpaperColor() { ... }   // "#RRGGBB"，拿不到返回 ""
```

三级回退，全程 `try/catch`：

| 分支 | API | 做法 |
|---|---|---|
| 1 | 31+ | `getResources().getColor(android.R.color.system_accent1_500, getTheme())` |
| 2 | 27–30 | `WallpaperManager.getInstance(this).getWallpaperColors(FLAG_SYSTEM).getPrimaryColor()` |
| 3 | 任意 | 返回 `""` |

结果进程内缓存一次。manifest **不新增任何权限**（现有零权限是刻意设计）。

JS 侧在 `src/lib/native.ts` 的 `Shell` 接口加 `wallpaperColor?(): string`，导出 `wallpaperSeed(): string | null`。同步接口保证首帧前就能拿到种子，不会出现「先渲染默认色再跳壁纸色」。

---

## 9. 应用层改动

### 9.1 `src/lib/theme.ts`

- `resolveMode(family, mode, nightSkin, systemDark): Mode`：`night` 恒为 `dark`；其余按 `mode`（`system` 看系统）
- `chromeColor(...)`：M3E 下必须返回**算出来的 surface**，否则状态栏与页面脱节；纸墨/夜空维持现有 `CHROME` 表
- `useThemeSettings()` 返回 `{ family, mode, nightSkin, palette? }`

### 9.2 `src/App.tsx:38-55`

设置 `data-theme`（light/dark）、`data-family`、`data-skin`（仅 night）、`data-font`；M3E 时写入内联色彩变量；更新 `meta[name="theme-color"]`；调用 `setChrome(color, mode === "dark")`。

---

## 10. 选择器 UI（`src/pages/Me.tsx`）

```
主题家族   [纸墨] [夜空] [Material Expressive]
深浅       [跟随系统] [浅色] [深色]        ← ink / m3e
           [极光] [星光]                   ← night（本质都是深色）
强调色     [跟随壁纸] ● ● ● ● ● ● ● ●      ← 仅 m3e
调色板风格  9 个 chip，每个实时算出三色预览   ← 仅 m3e
```

- 每个 Variant chip 用 `buildPalette()` 对当前种子实时计算三元组（沿用现有 `.theme-chip` 的 `--tp/--ts/--ta` 内联变量做法），不是纯文字胶囊
- 选中立即生效，无「应用」按钮
- `SWATCH` / `THEME_LABEL` 两张表删除，改为家族与 Variant 两张新表

---

## 11. 测试与验收

### 11.1 新增 `src/lib/m3.test.ts`

- 同输入 ⇒ 同输出
- 深浅两态下 `onSurface` 与 `surface` 的 WCAG 对比度 ≥ 4.5:1
- 9 个 Variant 全部可构造且产出完整角色表
- 换种子必变 `primary`
- `--sky` 与 `primary` 色相差 ≈150°（容差 ±6°）
- `specVersion: "2025"` 时 `primaryDim` 等新增角色存在

### 11.2 扩展 `src/store/store.test.ts`

现有 `:27`、`:71`、`:73` 是该功能的回归基线，必须改而**不可删**：

- 旧 5 个 `theme` 值 → 新 5 字段的映射逐条断言
- 越界值（未知 family / 非法 variant / 脏 hex）被 sanitize 回默认

### 11.3 扩展 `src/lib/web-backup.test.ts`

现有 `:54-60` 覆盖 5 个旧主题的往返，改为断言「`legacyTheme()` 折回的值仍在上游枚举内」，并验证 `m3e` 退化为 `light/dark/system`。

### 11.4 构建期护栏

`scripts/check-shape-tokens.mjs`（见 §6.3）。

### 11.5 真机验收清单

- [ ] 壁纸换色后重启应用，M3E 跟随新主色
- [ ] API 31+ 走 `system_accent1_500`，API 27–30 走 `WallpaperManager`，取不到落 terra
- [ ] 9 Variant × 2 深浅目视无异常
- [ ] 家族来回切换不残留内联变量（检查 `documentElement.style` 为空）
- [ ] 状态栏/导航栏配色与页面一致
- [ ] 备份导出仍是旧结构，跨设备恢复可用（主题按记录退化）
- [ ] 桌面小部件不受影响

---

## 12. 文档同步

- `README.md:45`：主题一栏补 Material Expressive 与 9 种调色板风格
- `docs/android.md:123`：状态栏说明补 M3E
- `docs/android-widgets.md:295`：保持不变，但需明确写一句「小部件不跟随 M3E」
- 新增 `docs/theme.md`：色彩算法、令牌阶梯、动效参数与生成脚本的说明

---

## 13. 实施顺序

1. 形状令牌化重构 + `check-shape-tokens.mjs` 护栏（无行为变化，先落地）
2. `src/lib/m3.ts` + `m3.test.ts`
3. `Settings` 模型、`sanitizeSettings` 迁移、`legacyTheme`、备份适配 + 相关测试
4. `theme.ts` / `App.tsx` 应用层
5. `Me.tsx` 三组选择器
6. `MainActivity.wallpaperColor()` + `native.ts` 桥
7. `scripts/gen-motion.mjs` 与 `linear()` 曲线落地
8. 文档同步、真机验收、`npm run build:android` 复核包体

---

## 14. 风险与未决

| 风险 | 处理 |
|---|---|
| `--card` 浅/深取不同角色 | 已在 §5.2 显式分模式 |
| `system_accent1_500` 在定制 ROM 缺失 | 三级回退已覆盖 |
| `linear()` 在老 WebView 不支持 | `@supports` 回退 cubic-bezier |
| 82 处半径替换引入视觉漂移 | 吸附位移 ≤3px；白名单锁死 hairline；逐家族目视复核 |
| M3E 备份只能退化到纸墨 | 已记录为接受的限制（§4.4） |
