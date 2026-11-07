# 主题系统

词光有三套互相独立的「风格家族」，每个家族都能在浅色与深色下显示。这份文档讲清楚数据模型、颜色是怎么算出来的、圆角与动效的令牌从哪来 —— 也就是「为什么现在长这样」。

一句话版本：**颜色在运行时从一个种子算出来，几何与缓动是静态令牌。** 前者解释了这个家族为什么能跟着壁纸走，后者解释了为什么它不是一套写死的配色。

---

## 一、数据模型：三家族 + 五字段

设置里保存的是五个字段，而不是一个枚举：

| 字段 | 取值 | 默认 | 说明 |
| :--- | :--- | :--- | :--- |
| `themeFamily` | `"ink"` \| `"night"` \| `"m3e"` | `"ink"` | 一级：风格家族 |
| `themeMode` | `"system"` \| `"light"` \| `"dark"` | `"dark"` | 二级：深浅 |
| `nightSkin` | `"aurora"` \| `"starlight"` | `"aurora"` | 只有 `night` 家族读它；夜空恒为深色，不看 `themeMode` |
| `m3Variant` | 9 种调色板风格之一 | `"tonalSpot"` | 只有 `m3e` 家族读它 |
| `m3Accent` | `"wallpaper"` 或 `"#RRGGBB"` | `"wallpaper"` | 只有 `m3e` 家族读它 |

拆成两级而不是一个 `theme` 枚举，是因为「纸墨的深色」和「夜空的极光」不是同类选项：前者是同一套配色换明度，后者是整套配色换掉。一个扁平枚举只能二选一，五字段可以同时表达。

### 旧值迁移

升级前的 `theme` 字段（`system` / `light` / `dark` / `aurora` / `starlight`）由 `src/lib/theme-model.ts` 的 `fromLegacyTheme()` 逐值查表迁移，规则无歧义：

| 旧值 | 迁移后 |
| :--- | :--- |
| `light` / `dark` / `system` | `ink` + 对应的 `themeMode` |
| `aurora` | `night` + `aurora` |
| `starlight` | `night` + `starlight` |

反向的 `legacyTheme(settings)` 把新模型折叠回一个旧值，供备份导出与桌面小部件使用。

### 备份与小部件

备份**只管学习数据**，不带主题。为了不破坏既有的 `version: 2` 格式与上游网页版的逐键校验，导出时仍然写一个 `theme` 字段，值由 `legacyTheme()` 派生；导入时照旧读 `theme` 并映射回新模型。代价是明确的：**换机恢复备份不会带回 Material Expressive，会退回纸墨**。壁纸派生的配色本来就属于那台设备，跟着备份走反而是错的。

桌面小部件同理：它由原生 `RemoteViews` 渲染，只认 `values/` 与 `values-night/` 两态，不跟随本家族。

---

## 二、色彩层

### 种子与三级回退

`m3e` 家族不存配色，只存一个种子，22 个 CSS 变量由 `src/lib/m3.ts` 的 `buildPalette(seed, isDark, variant)` 现算。种子按顺序取第一个可用的：

1. `settings.m3Accent` —— 用户从 8 个精选色板里点的那个色；
2. 手机壁纸采样色 —— 原生桥接 `wallpaperColor()` 返回的 `"#RRGGBB"`；
3. `FALLBACK_SEED` = `#C4573A`（品牌陶土）—— 老系统或读不到壁纸时的兜底。

第 2 步在安卓上分了三级：Android 12+ 读系统已经为启动器算好的 `android.R.color.system_accent1_500`（这正是 Material You 自己用的种子）；8.1–11 退回 `WallpaperManager.getWallpaperColors(FLAG_SYSTEM).getPrimaryColor()`；更早的系统返回空串，落到第 3 步。全程不申请任何权限 —— 这两个 API 读的都是系统已经算好的公开结果。

### 角色映射

配色方案的权威来源是官方 `@material/material-color-utilities`，本仓库只做角色映射，不自己编色。22 个变量与 M3 角色的对应关系：

| CSS 变量 | M3 角色 | 用途 |
| :--- | :--- | :--- |
| `--paper` | `surface` | 页面底色（也是状态栏颜色） |
| `--paper-2` / `--paper-3` | `surfaceContainerLow` / `surfaceContainer` | 分区块底色 |
| `--card` | 浅色 `surfaceContainerLowest`，深色 `surfaceContainerLow` | 卡片 |
| `--card-2` | `surfaceContainer` | 卡片内的次级块 |
| `--ink` | `onSurface` | 正文 |
| `--ink-2` | `onSurfaceVariant` | 次要文字 |
| `--ink-3` / `--ink-4` | `outline` / `outlineVariant` | 图标、更弱的文字 |
| `--line` / `--line-strong` | `outlineVariant` @ 60% / 90% | 分隔线 |
| `--terra` | `primary` | 主按钮、强调 |
| `--terra-ink` | `onPrimaryContainer` | 主色容器上的文字 |
| `--terra-soft` | `primaryContainer` | 主色容器底 |
| `--ochre` / `--ochre-soft` | `tertiary` / `tertiaryContainer` | 第二强调色 |
| `--sage` / `--sage-ink` / `--sage-soft` | `secondary` / `onSecondaryContainer` / `secondaryContainer` | 第三强调色 |
| `--sky` | 派生：种子色相 −150°，chroma 20，浅色 tone 55 / 深色 tone 72 | 冷色对照（图表、点缀） |
| `--glow` | `primary` @ 26%（深色 14%） | 光晕 |
| `--mark` | `tertiary` @ 32%（深色 28%） | 高亮笔迹 |

`--sky` 是唯一不来自角色的变量：原来的 skylight 蓝在动态取色下没有对应角色，但它承担「冷色对照」的语义，所以改成从种子色相反色相派生，保住这层意思又不引入冲突色相。

### 为什么用 2025 规范

构造 `Scheme` 时显式传 `"2025"`（`DynamicScheme.DEFAULT_SPEC_VERSION` 是 `"2021"`）。2025 版是 Expressive 的配套规范，容器与表面的对比层次更分明，也更接近当前 Material You 系统的实际观感；不传就会拿到 2021 的配色，与本家族的形状/动效语言不搭。

### 应用方式

`src/App.tsx` 的 `useTheme()` 把 22 个变量以内联样式写到 `<html>` 上。切回纸墨或夜空时逐个 `removeProperty()` 清空 —— 必须清，否则内联值会盖住纸墨自己的令牌。`data-family` / `data-theme` / `data-skin` 三个属性仍然只是给 CSS 用的开关。

---

## 三、形状层

圆角被重构成 11 档令牌，全部硬编码像素值已经清掉（护栏脚本见下）：

| 令牌 | 默认（纸墨 / 夜空） | `m3e` |
| :--- | ---: | ---: |
| `--shape-none` | 0 | 0 |
| `--shape-xs` | 4px | 6px |
| `--shape-sm` | 8px | 10px |
| `--shape-md` | 12px | 16px |
| `--shape-lg` | 16px | 20px |
| `--shape-xl` | 20px | 24px |
| `--shape-2xl` | 24px | 28px |
| `--shape-3xl` | 28px | 32px |
| `--shape-4xl` | 32px | 36px |
| `--shape-5xl` | 36px | 40px |
| `--shape-full` | 999px | 999px |

默认值是把历史像素值归并后的结果（原来的 3/4/6/8/10/11/12/13/14 → xs…md，18/20 → xl，22/24 → 2xl，28 → 3xl，36 → 5xl，999 → full），所以纸墨与夜空的观感基本不变：多数档位按原值落在同一档，少数小控件有 1–2px 的位移（10/11/14 → 12、18 → 20、22 → 24、3 → 4），已在 375px 宽度的浅色与深色下逐屏对照。`m3e` 段在文件末尾，整档放大并让相邻档位的差值更明显 —— 这正是 Expressive 的「大圆角、明显阶梯」。

`m3e` 段必须定义全部 11 档，否则会静默继承纸墨的圆角，等于没生效。`npm run check:shape` 就守这两件事（它挂在 `pretest` 上，所以 `npm test` 会自动跑）：

```
ok · 0 处裸半径 · M3E 段 11/11 令牌
```

第一件事：全文件不允许出现 11 档之外的裸 `border-radius: Npx`，唯一白名单是 `.amb-bars i` 的 `1px`（比最小的 `--shape-xs` 还细，任何档位都表达不了）。

> **本项目的 Expressive 形状与曲线是对规范的解读，不是官方数值。** Material 官方在站点与博客里给的是设计语言与示例，没有可引用的像素表；这里的阶梯是按「更圆、跨度更大」的原则自建并在实机上校过的，改档位只需改 `app.css` 的两处，`check:shape` 会确认没有漏网。

---

## 四、动效层

`m3e` 的 `--ease` 与 `--spring` 不是手调贝塞尔，而是一条**阻尼弹簧**的采样：

| 令牌 | 阻尼比 ζ | 刚度 k | 峰值 | 用途 |
| :--- | ---: | ---: | ---: | :--- |
| `--ease` | 0.8 | 380 | 1.015 | 绝大多数过渡 |
| `--spring` | 0.72 | 320 | 1.038 | 需要「弹一下」的进入动画 |

位移公式是一个单位阶跃过阻尼谐振子：

```
x(t) = 1 − e^(−ζωt) · (cos(ω_d t) + (ζω/ω_d) · sin(ω_d t))
ω = √(k/m)，ω_d = ω√(1−ζ²)，m = 1
```

CSS 表达不了弹簧，但 `linear()` 可以把曲线采样成 40 个点近似。`--ease` 峰值 1.015、`--spring` 峰值 1.038 就是那一点点过冲 —— 落在 `transform` / `opacity` 上几乎看不出，落在按钮与卡片的进入动画上就是「活」的那一下。

### 怎么改、怎么复现

参数集中在 `scripts/gen-motion.mjs` 头部，脚本**只打印不写文件**：

```bash
npm run gen:motion
```

输出两行 `linear(...)`，连同峰值注释一起粘回 `app.css` 的 `:root[data-family="m3e"]` 段；同一段里的注释写明了对应的 ζ 与 k，下次改参数时照着替换。脚本末尾自带断言（首值 0、末值 1、末端已收敛），算错会直接退出非零。

### 回退

`linear()` 需要 Chrome 113+ / Safari 17.2+ / Firefox 112+。更老的引擎由紧跟在后面的 `@supports not (animation-timing-function: linear(0, 1))` 接管，分别回退到 `--ease: cubic-bezier(0.2, 0, 0, 1)`（标准缓出，不过冲——过冲的曲线在 `prefers-reduced-motion` 之外的老引擎上更容易让人误以为抖动）与 `--spring: cubic-bezier(0.34, 1.35, 0.2, 1)`（保留一点回弹手感的近似）。家族气质仍在，只是没有精确的弹簧数值。

纸墨与夜空的 `--ease` / `--spring` 完全没动，本家族的一切只在本家族的选择器下生效。

---

## 五、改一处会牵动哪里

| 想改 | 改哪 | 还要看一眼 |
| :--- | :--- | :--- |
| 圆角档位 | `src/styles/app.css` 的 `:root` 与 `:root[data-family="m3e"]` | `npm run check:shape` |
| 缓动手感 | `scripts/gen-motion.mjs` 的 ζ / k，然后 `npm run gen:motion` | 粘回 `app.css` 并重新构建 |
| 精选色板 | `src/lib/theme-model.ts` 的 `PALETTES` | 选择器 UI 自动跟着变 |
| 调色板风格 | `VARIANTS` / `VARIANT_LABEL`（同上） | `src/lib/m3.ts` 的 `SCHEMES` 要能构造 |
| 变量与角色映射 | `src/lib/m3.ts` 的 `buildPalette` | `M3_VARS` 与 `app.css` 的令牌必须对得上 |
| 壁纸取色 | `MainActivity.java` 的 `Bridge.wallpaperColor()` | `docs/android.md` 的桥接表 |
