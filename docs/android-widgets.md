# 词光安卓桌面小部件设计（定稿）

> **状态**：方案定稿 → 代码落地 → **已打出两个 APK**（2026-11-04）· 2026-11-12 追加「每小时整点自动拉取」（v1.1.1 / versionCode 15，见 §6.1）· **验证**：TypeScript / 单测 / Web 产物 / 资源编译 / Java 编译 / dex / 签名 / 零权限 / 组件注册全部通过；**真机安装与桌面显示已通过实测（拖拽缩放、深浅色切换、刷新与跳转）**
> **适用版本**：word-atlas-android v1.0.10 起（versionCode 11，包名 `tech.wordatlas.app`）；整点刷新为 v1.1.1 起
> **说明**：正文是设计定稿；实施中的技术取舍与偏差集中记在 §13，文件清单与验证结果见 §14。

---

## 0. 一页速览

最终只有 **三种卡面**，每张卡的可见元素有严格白名单，白名单之外一律不出现。

| 尺寸 | 归属 | 卡面允许的全部内容 | 背景 |
| --- | --- | --- | --- |
| 2×2（130×220dp） | 顽固词轮播 | 图底、英文单词、中文释义 | 当前顽固词自己的插画 `atlas/img/<id>.webp`（512²），随轮播换图 |
| 4×2 / 5×2（276–349×220dp） | 今日一句 | 图底、英文例句、中文译文 | **当日词自己的插画** `atlas/img/<sentence.id>.webp`（512²），与应用内词卡同源 |
| 4×1（276×102dp） | 进度条 | 「还剩 x 步」「待复习 x」「新词 x」「约 x 分钟」+ 右侧「继续旅程 →」按钮 | 无图，纯色 `#131A2B` |

**四条原则**：一屏一义；离线优先、零新增权限；不制造焦虑（无断签、无红色警告、完成态不显示 0）；品牌一致（复用现有插画、色板与主页按钮样式）。

---

## 1. 设计目标与差异化

| 产品 | 桌面/锁屏做法 | 借鉴 | 不借鉴 |
| --- | --- | --- | --- |
| 百词斩 | 「单词锁屏」：图 + 词 + 中文义海报，点「斩」切下一个词；需开系统锁屏权限并关闭电池优化 | 把内容推到眼前，图背单词的心智 | 依赖锁屏权限与后台保活 |
| 多邻国 | 两款：小卡只看「今日是否完成」+ 吉祥物情绪，大卡看一周 streak；据媒体报道，官方称约一半挂件用户能维持 6 个月以上连续学习 | 状态一眼可见、情绪记忆点 | 恐惧式施压、拟人催促 |
| 墨墨背单词 | 桌面与锁屏同步上线，直接呈现「顽固单词 + 签到状态」；有日常皮肤、节日盲盒与吉祥物 | 把欠账落到一个具体的词 | 签到奖励、补签卡、账号体系 |

词光手里有三张别人没有的牌：**7,298 幅原创插画全部离线在包内**、**零权限/零联网/零账号/零埋点**、**FSRS 算出的真实待复习量**。因此定位为「不打扰的内容型小部件」——用美感而不是焦虑把人拉回来。竞品信息来自公开资料，非官方设计规范。

---

## 2. 现状与硬约束

| 约束 | 事实 |
| --- | --- |
| 技术栈 | 手写 Java WebView 壳（`MainActivity.java` 加载 `file:///android_asset/www/index.html`），React 19 + Vite + TS 的 Web 层；`aapt2` + `javac` + `d8` 打包，**无 Gradle / Kotlin / AndroidX**；minSdk 24 / targetSdk 34 |
| 组件现状 | `AndroidManifest.xml` 只有 `.MainActivity` 与 `.ShareProvider`，**没有 receiver、没有深链、没有 INTERNET 权限**，全项目零 AppWidget 代码 |
| 数据不可达 | 学习进度全在 WebView 的本地存储：`word-atlas:settings`、`word-atlas:v2:word-atlas-open`；原生层读不到 `cards` / `days` / `mistakes` |
| 字体 | 包内字体是 woff2（`Fraunces` / `Source Serif 4` / `Atkinson`），**RemoteViews 不能加载**，小部件只能用系统字体 |
| 素材 | 插画按 id 直取，无需查表；`build_apk.py:308-320` 会把 `public/atlas`、`public/brand`、`public/sfx` 全量打进 `assets/www/`（单词音频只跳过 `uk/us/uk2/us2`） |
| 尺寸 | `brand/topic-*.webp` 640×640（19 张，键名与 `atlas/index.json` 的 `topics` 完全一致）；`atlas/img/<id>.webp` 512×512；`atlas/thumb/<id>.webp` 256×256（小部件不用） |
| 例句 | `Entry.ex[0]` 是日常例句（主页今日一词展示），`ex[1]` 是**雅思语境例句**；7,298/7,298 词都有，英文中位 113 字符 / p90 128 / 最长 156，中文译文中位 31 字 / 最长 53 字 |
| 音频 | `atlas/audio/ex2/<id>.mp3` 7,298 条全覆盖（约 442MB），已在 APK 内；小部件不直接播放，跳应用内 |
| 授权 | 代码 MIT；词库文本、插画、例句及录音 CC BY 4.0；**剑桥真题例句（`ielts.json`）不在 CC BY 4.0 内**，不得用于小部件；`_O` 私用包音源不得公开分发 |

**最大设计约束**：原生层读不到进度。唯一稳妥路径是 Web → 原生的**单向快照**，绝不让小部件自己算 FSRS，也绝不反向写学习记录。

---

## 3. 卡面白名单与版式

```
2×2 顽固词 · 可缩到 1×2          4×2 / 5×2 今日一句 · 可缩到 3×2
┌────────────────┐                 ┌──────────────────────────────┐
│                │                 │                              │
│   全幅插画      │                 │       全幅话题插画            │
│   （上半留白）  │                 │                              │
│                │                 │  Planting native bushes      │
│  overseas      │                 │  in urban gardens…          │
│  ad. 在海外…   │                 │  在城市花园中种植本地灌木…    │
└────────────────┘                 └──────────────────────────────┘

4×1 进度条 · 可缩到 3×1
┌──────────────────────────────────────────────────┐
│  还剩 12 步              ╭──────────────────╮    │
│  待复习 8 · 新词 4        │  继续旅程 →   │    │
│  约 9 分钟               ╰──────────────────╯    │
└──────────────────────────────────────────────────┘
```

- **缩放范围**（`android:minResizeWidth/Height`，按 70n−30 的格子公式换算）：顽固词下限 **1×2**（40×110dp），今日一句下限 **3×2**（180×220dp），进度条下限 **3×1**（180×102dp，只允许横向）。上限不设 `maxResize*`，拖大只会露出更多插画/更宽的文字区，版式不散。
- 每次 `onAppWidgetOptionsChanged` 都整卡重算：边距、中文档位、字号试算全部基于 `getAppWidgetOptions()` 报回来的**当前**宽高，而不是假定 2×2。顽固词宽度 <150dp 时判定为「单格」：左右边距 16→10dp、中文 13→11sp、给右上 44dp 刷新热区多留 10dp 余量，长词仍按音节断行。

- **白名单是硬约束**：2×2 与 4×2/5×2 只有「图 / 英文 / 中文」三个元素；4×1 是「四项文字 + 一个按钮」。日期、月份年份、标题标签、右上刷新/播放图标、底部署名与星标、轮播指示 `3/12`、「遗忘 N 次」、换词图标、周柱、连续天数、进度环、「展开全文」「去练它」等按钮文字，以及所有小图标与装饰，**全部移除**。
- 唯一例外：2×2 右上角有一个**无底板、无描边**的刷新图标（第 11 轮按真机反馈恢复，见 §13-9），它是白名单里唯一的图标元素。
- 「每日一句」这个名字只存在于系统小部件选择器的 label / description，不占卡面。
- 早期方案中的 W2「今日旅程 4×2」主卡、W3「微光 1×1」已取消；4×2 现归今日一句。

---

## 4. 视觉规范

### 4.1 色板（取自 `src/styles/app.css:4-109`）

三套卡面全部改为「一份布局 + 两套颜色资源」，随系统深浅色切换（`values` = 浅色，`values-night` = 深色）：

| 资源名 | 浅色（`values`） | 深色（`values-night`） | 用途 |
| --- | --- | --- | --- |
| `widget_card` | `#FFFDF8` | `#131A2B` | 卡底（也是缺图时的兜底底色） |
| `widget_ink` | `#1A2035` | `#F6F1E7` | 主文字（英文词/句、进度主行） |
| `widget_ink_2` | `#2B3149` | `#F0EADA` | 中文释义/译文 |
| `widget_ink_3` | `#7A7D8A` | `#A7B0C4` | 进度次行 |
| `widget_cta_fill` / `widget_cta_ink` | `#1A2035` / `#FFFDF8` | `#FBF8F2` / `#1E2640` | 「继续旅程」胶囊与箭头 |
| `widget_refresh_ink` / `_halo` | `#1A2035` / `#C4FFFDF8` | `#F6F1E7` / `#8C0D1120` | 右上刷新图标与其光晕 |
| `widget_plate` | `#94FFFDF8`（58%） | `#A9131A2B`（66%） | 文字底板，半透明 |

强调色（赭黄 `#E8B65A` / 陶土 `#E57C5A` / sage `#97B88E`）仍不进卡面——白名单里没有需要强调的独立元素。

**卡底刻意不加描边**：`GradientDrawable` 会把 `<stroke>` 的宽度当 padding 回传给 View，根布局被内缩 1dp，全幅插画和位图里烘好的圆角就跟卡底对不齐了（深色下会显出一圈暗边）。浅色卡与壁纸的边界靠插画本体与 `#FFFDF8` 的色差，不用 1dp 线。

**为什么不在 Java 里选色**：`RemoteViews` 会把 `setTextColor(int)` 之类的调用固化成字面量，启动器切换深浅色时只会 `reapply()` 旧的 action 列表，卡片会停在半转换状态。颜色写在布局属性里、由启动器重新 inflate，才是唯一「两边一起变」的路径。

### 4.2 海报皮肤（2×2 与 4×2/5×2 共用）

`centerCrop` 全幅图底 → 24dp 圆角（烘进位图的透明像素，`ARGB_8888`）→ **下半部一块半透明「文字底板」** → 文字。上半部插画**一个像素都不盖**；文字压在磨砂底板上，插画透过底板继续可见。对比度 ≥4.5:1，最小字号 12sp。

第 15 轮之前这里是**整卡一层纸色渐变**，42% 高度处就叠到 72% 白，上半部插画被整片白雾糊住（反馈「白色遮罩导致图片看不清」）。第 15 轮把它换成**不透明**底板并给文字块设了 54% 的面积上限——方向错了：用户要的是「遮罩更透明」，不是「文字更小」。第 16 轮回到正解：

| 层 | 实现 | 说明 |
| --- | --- | --- |
| 图 | `widget_bg`，全幅 `centerCrop` | 无任何着色、无压暗，亮部就是原图亮部 |
| 羽化 | `drawable/widget_fade.xml`，22dp（今日一句 24dp） | 从底板色 → 同色 0 alpha。两端同色，中间不会经过灰 |
| 底板 | `drawable/widget_body_bg.xml`，`@color/widget_plate` + 底部 20dp 圆角 | **半透明**：浅色 58% 纸、深色 66% 卡色 |

底板是「洗」不是「盖」：插画透过它继续看得见，像磨砂玻璃，而不是一个白盒子。透明度按最坏情况标定——假设文字正压着纯黑插画：

| 模式 | 底板 | 主文字最坏对比度 | 次级文字最坏对比度 |
| --- | --- | --- | --- |
| 浅色 | `#94FFFDF8`（58%） | 5.3:1 | 4.2:1（`#2B3149`） |
| 深色 | `#A9131A2B`（66%） | 5.0:1 | 4.7:1（`#F0EADA`） |

底板半透明，次级文字就不能再沿用旧的 `#434B65`——它压在深色插画上只剩 2.8:1，所以浅色次级文字加深到 `#2B3149`、深色提亮到 `#F0EADA`。

底板高度仍由文字内容决定（`wrap_content`），所以短句卡露出更多插画，长句卡底板更高。底部两角单独设 20dp 圆角，避免底板把卡片圆角填成直角。

**不限制文字面积（第 16 轮）**：第 15 轮曾给文字块设 54% / 55% 的硬上限——那是为「不透明底板」打的补丁。底板改成半透明后，文字占多高都不会把图「盖没」，上限因此撤销：行数回到 4 行 / 2 行（今日一句 5 行 / 3 行），字号回到 24sp / 22sp 基准。文字块只剩一条约束——顽固词顶部让出 40dp（单格 50dp）给刷新热区。

**羽化条必须用 `FrameLayout` 而不是 `<View>`**：`RemoteViews` 不跑真正的 `LayoutInflater`，它对着 `sInflaterFilter` 白名单逐个比对类名，`android.view.View` 不在名单里，会在 apply 时抛 `InflateException`，启动器只显示「An error occurred when loading widget」。这一条已经做成构建前检查：`python scripts/android/check_widget_layout.py`。

理由（深浅色为什么必须放在布局层）：启动器切深浅色时，`RemoteViews` 只是 `reapply()` 旧的 action 列表，位图还是旧位图；但布局会被重新 inflate，颜色和底板一起换。若底色仍烘在位图里，浅色下就会「纸色文字 + 深色压暗」——这正是必须拆开的原因。

- 字号不写死档位：Provider 用 `StaticLayout` 在**卡片实际尺寸**（`getAppWidgetOptions` 的 min width/height）上从基准值按 0.5sp 试算，取「行数内排得下且不触发 `…`」的最大值；顽固词基准 24sp（长词 20sp）/ 4 行 / 下限 9sp，今日一句基准 22sp / 5 行 / 下限 12sp。
- 中文 13sp / 2 行（今日一句 3 行；顽固词单格 11sp），随英文块一起靠下；`includeFontPadding="false"`，让静态测量与真实渲染同高。
- 2×2 竖版从 512² 方图裁切，注意不切掉插画主体；4×2/5×2 横版从同一张 512² 词条插画裁切（与 App 内词卡同源），不再用话题图。

### 4.3 纯色卡（4×1）

底色跟系统走：浅色是 `#FFFDF8` 纸卡 + 墨色字 + 墨色胶囊，深色是 `#131A2B` 卡 + 米白字 + 米白胶囊——按钮与卡底永远互为反色，不会出现「米白按钮配白卡」这种失效搭配。主行 20sp（也走 `fitText`，限 1 行）、次行 14–15sp 两行（`待复习 x · 新词 y` / `约 z 分钟`），无图、无环、无柱。次行按按钮之外的实际宽度取最大可放下字号，保证不截断。缩到 3×1（<220dp）时胶囊退化为「继续」并去掉箭头，把宽度还给文字。

### 4.4 按钮（4×1 右侧，参考主页样式）

来源：`Today.tsx:132-134` 的 `.btn.btn-primary.btn-xl` + `app.css:314-343, 1929-1936` 的 `.journey .btn-primary` 覆盖。

| 属性 | 主页值 | 小部件取值 |
| --- | --- | --- |
| 底色 / 字色 | `#FBF8F2` / `#1E2640` | 深色取主页值；浅色反相为 `#1A2035` / `#FFFDF8` |
| 圆角 | `999px` 胶囊 | 相同 |
| 高度 | 56px（`.btn-xl`） | **40dp**（4×1 仅 102dp 高；仍是完整可点区域） |
| 字号 / 字重 | 16.5px / 600 | 12sp / 600 |
| 内边距 / 间距 | 0 28px / gap 8px | 左右 8dp / 箭头间距 3dp |
| 图标 | lucide `ArrowRight` 20px | `ArrowRight` 11dp，用 `res/drawable` vector |
| 阴影 / hover | box-shadow、位移 | 省略（RemoteViews 静态） |

空间分配：左 14 + 文字区（自适应）+ 间距 8 + 按钮约 78 + 右 14 = 276dp；文字区约 158dp，两行排布，字号由试算决定。

### 4.5 尺寸表

Android 官方 5×4 网格竖屏估算：`n×m ≈ (73n−16) × (118m−16) dp`。

| 尺寸 | dp | 尺寸 | dp |
| --- | --- | --- | --- |
| 1×1 | 57×102 | 4×1 | 276×102 |
| 2×2 | 130×220 | 5×1 | 349×102 |
| 4×2 | 276×220 | 5×2 | 349×220 |

缩放下限写在 `minResizeWidth/Height`（按 `70n−30` 的旧公式换算：1 格 40dp、2 格 110dp、3 格 180dp），`minWidth/minHeight` 继续只当「首次摆放的默认尺寸」：

| 卡面 | 默认 | 可缩到 | `minResizeWidth / Height` | `resizeMode` |
| --- | --- | --- | --- | --- |
| 顽固词 | 2×2 | **1×2** | 40 / 110dp | `horizontal\|vertical` |
| 今日一句 | 4×2 | **3×2** | 180 / 110dp | `horizontal\|vertical` |
| 进度条 | 4×1 | **3×1** | 180 / 60dp | `horizontal` |

上限不写 `maxResize*`：拖大只会露出更多插画、给文字更多宽度，比锁死更自然。

`<appwidget-provider>` 需同时写 `targetCellWidth/Height`（API 31+）与 `minWidth/minHeight`（旧版回退），配 `resizeMode`、`previewImage`、`description`、`widgetFeatures`。

---

## 5. 数据源与快照

### 5.1 单向链路

```
WebView (React) --publishWidgetSnapshot()--> 原生快照 --显式广播--> AppWidgetProvider
                                                                    |
assets (插画 / 话题图) --------------------------------------> RemoteViews --> 桌面
```

扩展现有 `WordAtlasAndroid` JS Bridge（`MainActivity.java` 已有 `@JavascriptInterface` 扩展点），新增 `publishWidgetSnapshot(String json)`，写入 `SharedPreferences` 或 `filesDir`。小部件**只读不写**学习记录。

### 5.2 快照字段（最终精简版）

```json
{
  "v": 1,
  "date": "2026-11-04",
  "theme": "dark",
  "tough": {
    "cards": [
      { "id": "overseas", "word": "overseas", "zh": "ad. 在海外；向海外", "topic": "travel" }
    ],
    "seedDate": "2026-11-04",
    "slotMs": 7200000
  },
  "sentence": {
    "id": "bush",
    "en": "Planting native bushes in urban gardens can provide shelter and food for local wildlife.",
    "zh": "在城市花园中种植本地灌木，可以为当地野生动物提供庇护和食物。",
    "enLen": 88,
    "topic": "nature",
    "date": "2026-11-04"
  },
  "plan": { "remaining": 12, "due": 8, "fresh": 4, "minutes": 9 },
  "hours": [
    { "at": 1793757600000, "remaining": 12, "due": 8, "fresh": 4, "minutes": 9 },
    { "at": 1793761200000, "remaining": 13, "due": 9, "fresh": 4, "minutes": 9 }
  ]
}
```

`hours` 是 v1.1.1 加的：**当前本地整点 + 之后 24 个整点**，共 25 行，每行是那一刻的四项进度投影，`at` 为整点的 epoch 毫秒。它让原生不必碰 FSRS 也能在 App 关闭时显示随时间到期的卡片；旧快照没有这个字段时回退到 `plan`。字段放在顶层而不是 `plan` 里，是为了让 `plan` 的四项结构保持不变。约 1.5 KB，不进卡面。

实施时把 `queue` 换成了 `cards[]`：每个元素直接带上 `word / zh / topic`，启动器进程无需再查词库就能显示文本与选背景；游标由原生按本地时间算，所以快照里不再存 `cursor` 与单个 `card`。`card.topic` 用于插画缺失时降级到 `topic-<topic>.webp`，`sentence.date` 用于原生判断是否跨日。数组现在是**整个顽固词池**（上限 300，193 条约 20KB），不再是 12 条。已删字段：`streak / week / doneToday / goal / dailyNew / manualOffset / audio / cefr / thumbIds / toughIds / sentenceCandidates / sentenceOffset`。

### 5.3 派生算法（全部在 Web 侧算）

- **候选池**：`mistakes`（错词本，最多 300 条）里的词 **∪** FSRS `lapses > 0` 的词，再排除 `isMastered`。所以池子大小≈错词本条数减去已「毕业」的词；从未答错的词不进池。池子硬上限 `TOUGH_POOL_MAX = 300`。
- **顽固分**：`score = 3·lapses + 0.8·(d−5) + 0.3·max(0, 12−s) + 2/(1+idx/10)`，其中 `idx` 是该词在 `mistakes` 中的位置；错词本里没有 FSRS 卡片的词按 `1 + 新近度` 参与排序，不会被丢掉。
  > 注意：`progress.mistakes` 只是「最近答错词的滚动历史」（最多 300 条、最新在前，`session.ts:224` 只在答错时写入，**答对不会移除**），不能直接当顽固词用，必须结合 FSRS 的 `lapses / d / s / st`。
- **每日窗口**：整池按顽固分排序后按日期轮转 —— `start = (dayNumber × 12) % pool.length`，卡片序列为 `pool[start…] + pool[…start]`。一天 12 个时间片正好消耗 12 个词，第二天窗口前移 12 位，整池约 `pool.length / 12` 天走完（193 词约 16 天）；**同一天内不重复**，手动刷新继续往后翻。
  > 第 13 轮修正：原先只取 Top 12，导致无论错词本里有几百个词，小部件永远只认识那 12 个。
- **时间片游标**：`index = (floor((now − dayStart) / 2h) + drift + offset) % cards.length`，其中 `drift = daysBetween(seedDate, today) × 12`。由原生用本地时间算，**App 进程不在前台也能轮播**；即使多天没打开 App，`drift` 也会让窗口按天前移，不会每天重播同一批。不用每次刷新真随机（会抖动、重复、跨进程不一致）。
- **跨日限制**：重新排序与换窗口需要 Web 侧的 `progress`，因此 App 未打开时只能沿用旧序列继续轮播（靠 `drift` 保证仍在往前走），下次打开 App 才按最新进度重排；今日一句不受此限制（见 §13）。
- **今日一句**：沿用应用内 Today 页「今日一词」的确定性抽词（`Today.tsx:230-236`，`hashSeed(dayKey())`），取该词 `Entry.ex[1]`（雅思语境），按日换句。
- **进度四项**：`dueIds()` 取 `cards` 中 `due <= now`；`todayPlan()` 的 `fresh = max(0, dailyNew − 今日新词)`；`remaining = due + fresh`，`minutes` 由既有的估算逻辑给出。会话进行中时 `remaining` 改用会话剩余步数，与 Today 页一致。
- **整点计划表（v1.1.1）**：`due <= now` 意味着卡片会**在 App 没打开时陆续到期**，而过去只有主动评分才会推送新快照，桌面上的「待复习」就会一直停在旧值。`planHours()` 因此把 `planOf()` 在未来 25 个本地整点各算一遍（跨日的 `fresh` 按新一天的额度重置，进行中的会话仍用剩余步数），写成 `hours`。`todayPlan()` / `newToday()` 增加可选的 `now` / `date` 参数供投影使用，默认调用行为不变。**算法仍在 Web 侧，原生只按当前时间查表**。

### 5.4 素材路径与授权

- 2×2：`assets/www/atlas/img/<当前 cards[index].id>.webp`；缺图 → `www/brand/topic-<topic>.webp`。
- 今日一句：`assets/www/brand/topic-<sentence.topic>.webp`；缺图 → 纯深蓝卡，不留白框。
- 插画属 CC BY 4.0，**署名放在小部件配置页**（`Word Atlas contributors — CC BY 4.0`）；不使用剑桥真题例句，不使用 `_O` 私用包音源。

---

## 6. 刷新机制

| 卡面 | 触发 |
| --- | --- |
| 2×2 顽固词 | 2 小时时间片推进；跨日游标归零、手动偏移按日期失效，同时 `drift` 前移 12 位进入下一批词 |
| 4×2/5×2 今日一句 | 按日一次，`DATE_CHANGED` / `TIME_SET` / `TIMEZONE_CHANGED` |
| 4×1 进度条 | App 内评分 / 跨日 / 设置变更 → Bridge 发显式广播即时刷新；**外加每个整点由 `WidgetKeepAlive` 拉取一次**（§6.1） |

被动兜底统一 `updatePeriodMillis="1800000"`（系统下限 30 分钟），并接收 `DATE_CHANGED` / `TIME_SET` / `TIMEZONE_CHANGED` / `MY_PACKAGE_REPLACED`，以及 App 内显式发出的包内 `WIDGET_REFRESH` 广播。**不注册 `BOOT_COMPLETED`**：它要 `RECEIVE_BOOT_COMPLETED` 权限，而重启后启动器重新绑定小部件时本身会下发 `APPWIDGET_UPDATE`，无需为此破坏零权限。不引入精确闹钟、前台服务或网络。

换词时背景图同步更换，注意回收源 Bitmap、不缓存满 12 张。

### 6.1 整点自动拉取（v1.1.1）

```
WidgetKeepAlive (普通 Service)
   ├─ 主线程 Handler 对齐下一个本地整点
   ├─ TIME_SET / DATE_CHANGED / TIMEZONE_CHANGED / SCREEN_ON → 重新对齐并补刷
   └─ 整点 tick ─┬─ MainActivity.pullWidgetSnapshot() → WebView 里
                 │   window.__waWidgetPull() → 重新 buildSnapshot → publish()
                 └─ 无条件发 WIDGET_REFRESH → 三张卡重渲染
                        └─ 4×1 从 snapshot.hours 取「at <= now」的最后一行
```

- **两条腿，缺一不可**：WebView 还活着就重新发布一份新快照（并顺带刷新三张卡），`__waWidgetPull` 是 `installWidgetPublisher()` 暴露的钩子；WebView 不在（进程被回收、划掉任务卡）就直接按上一份快照的整点表渲染。两种情况下四个数字都会更新。
- **对齐而非轮询**：`WidgetKeepAlive` 用 `Calendar` 取下一个本地整点的延迟，`Handler.postDelayed` 一次；Doze 下可能延迟，但亮屏、时钟跳变以及系统每 30 分钟一次的 `APPWIDGET_UPDATE`（会再次 `startService`）都会重新对齐。上次拉取的整点存在 `word-atlas-widget` 的 `hourly:last`，`START_STICKY` 重启后能补刷错过的整点。
- **零新增权限**：仍是普通非前台 Service，没有 `SCHEDULE_EXACT_ALARM`、没有通知、没有网络、没有后台 UI。`MainActivity` 只持有 `WeakReference`，服务不会把 Activity 拖住。
- **降级**：旧快照没有 `hours` 时用 `plan`；快照比整点表还老一天以上时也回退到 `plan`，不把过期的投影一直停在桌面上。
- **实机验证**：`adb logcat -s WordAtlasWidget` 可看到整点的 `hourly pull HH:mm · webView=alive/gone`；`adb shell am start` 打开一次 App 后划掉，等下一整点看「待复习」是否随到期卡片增加。

---

## 7. 交互与跳转

| 卡面 / 热区 | 动作 |
| --- | --- |
| 2×2 整卡 | `#/w/<tough.card.id>` 看词条 |
| 4×2 / 5×2 整卡 | `#/w/<sentence.id>` 看词条（例句音频在词条页播放） |
| 4×1 按钮 | 等价于主页 `start()`（`Today.tsx:56-64`）：无 active session 时先 `buildSession()`，再进 `#/learn` |
| 4×1 卡片其余区域 | `#/` 今日主页，看完整计划 |

- **不能只跳 `#/learn`**：没有 session 时学习页是空的。实现为 `MainActivity` 读内部 extra `wa.route` / `wa.action`，拼出 `file:///android_asset/www/index.html#/learn?waStart=1`；Web 层读这个一次性参数，`buildSession()` 后进 `#/learn`（`replaceState` 会清掉参数）。冷启动与 `singleTask` 的 `onNewIntent` 走同一条路径。
  - 第 15 轮修正：`waStart` 原来只在 atlas 就绪的 effect 里处理一次，且 `finished` 的 session 被当成「进行中」直接恢复 —— 于是「上一程结束后、今天还没开始」时点按钮，落回的是上一轮的「这一程结束了」。现在改为订阅 `hashchange` / `wa:loc`：每次点击都重新判定，`finished` 的会话一律重建；当天确实无词可学（`buildSession` 为空）才回今日页。
  - 同一轮修正：`launchUrl()` 给每条路由追加 `waT=<毫秒>`，保证连点同一个按钮也是新的 fragment（相同 URL 不会触发 `hashchange`，点了没反应）。
- 不新增 intent scheme / 自定义 URL，全部复用现有 hash 路由；`PendingIntent` 用 `FLAG_IMMUTABLE`。4×1 的子 View 热区优先于父布局。
- **force-stop 会作废该包创建的全部 PendingIntent** —— 包括烤进 RemoteViews 里的三个点击目标。此后点击在启动器侧就失败（logcat `E/RemoteViews: Cannot send pending intent ... ActivityNotFoundException`），启动器退回 `act=MAIN cat=LAUNCHER` 的普通启动，`wa.route` 无从传递。
  - 触发方式：设置里的「强行停止」，以及 **ColorOS 在最近任务里划掉卡片**（实测 `stopped=false→true`、本包 PendingIntent 记录 5→0）。单纯的进程回收（`am kill`）不会 —— 两者不能用同一种方式测「App 不在后台」。
  - **实测结论：兜底 intent 无法区分三张卡**。强制停止后分别点今日一句 / 顽固词 / 进度条，启动器发出的 `START u0` **逐字节相同**（`act=MAIN cat=[LAUNCHER] flg=0x10000000 pkg=...`、`mCallingUid=1000 mRealCallingUid=10270`、无 extras、无 bounds）；桌面图标点击反而不同（`flg=0x10200000`、带 `bnds`、有 extras）。失败后系统给三个 provider 都发全量 `APPWIDGET_UPDATE`（顺序固定），也没有可用信号。所以「被 force-stop 后猜是哪张卡」在应用侧做不到。
- **保活（第 16 轮，用户思路，已实测有效）**：`WidgetKeepAlive` 是一个**普通 Service**（非前台），仅在小部件存在时启动。它不要求进程常驻，只是让系统在划掉最近任务卡片时**不做包级 force-stop**。
  - Android 16 / ColorOS 16 实测：加 Service 前划掉卡片 → `stopped=true`、PendingIntent 5→0、四个点击目标全部失灵；加 Service 后划掉卡片 → `stopped=false`、PendingIntent 保持 5 条、进程仍在（`am kill` 都杀不动）。
  - 结果：进度条「继续旅程」→ 学习页；今日一句 → `monitor` 词卡；顽固词 → `decision` 词卡；顽固词刷新 → `abroad → interest → burger`，全程不打开 App。**四个目标完全区分**。
  - **零权限、零通知**：实测普通 Service 就够，不需要前台服务，因此没有 `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_DATA_SYNC` 权限，也没有常驻通知。仍保持 manifest 无任何 `<uses-permission>`。不加 `excludeFromRecents`：App 正常出现在最近任务里，用户照样能划掉，只是划掉不再破坏小部件。
  - **v1.1.1 起这个 Service 还兼做整点调度**：既然它已经为了 PendingIntent 而常驻，每小时拉一次快照比再引入一个 `AlarmManager` + 静态 receiver 更轻，且不需要精确闹钟权限。细节见 §6.1。
  - 顽固词刷新另加 `FLAG_INCLUDE_STOPPED_PACKAGES | FLAG_RECEIVER_FOREGROUND`：某些 OEM 会丢掉「需要冷启动接收进程」的后台广播，这两个 flag 让 `WIDGET_NEXT` 在进程已被回收时也能送达。
  - 注意：这是 OEM 行为而非 AOSP 保证；`MainActivity.isLauncherFallback()` 仍作为真正 force-stop（设置 → 强行停止）时的安全网。
- **兜底（安全网）**：`MainActivity.isLauncherFallback()` 认兜底形状 —— `action=MAIN` + `CATEGORY_LAUNCHER` + **intent 带 `pkg`** + **没有 `FLAG_ACTIVITY_RESET_TASK_IF_NEEDED`**（图标点击相反）。命中时 `fallbackRoute()` 用 `AppWidgetManager.getAppWidgetIds()` 查用户装了几种卡：
  - 恰好一种 → 精确打开它（今日一句取当天句子词、顽固词取当前卡面词、进度条 `#/learn?waStart=1`）；
  - 多种 → **回今日页**（中性），不再像上一版那样一律进学习页，避免点词卡被错送到学习页。
  - 注意：不要把这个判断放宽成"任何 MAIN 启动"，否则从桌面图标进入也会跳过今日页。
- 手动「换一个」按钮已取消，轮播只自动进行；「去练它」入口回到应用内 Practice 页。

---

## 8. 状态与降级

| 场景 | 表现 |
| --- | --- |
| 首次安装 / 清除数据 / 快照缺失 | 2×2 回退到今日一词的图 + 词 + 中文义；4×1 显示四项占位，不显示假进度或 0 |
| 顽固词池为空 | 回退今日一词，文案「还没有难住你的词」，仍是图 + 英文 + 中文 |
| 插画 / 话题图缺失 | 先降级话题图，再降级纯深蓝卡，不留白框 |
| 当日完成 | 4×1 主行改「今天已点亮」、后三项归零；按钮文案恒定「继续旅程 →」，不催促、不新增元素 |
| 主题切换 | 跟随系统深浅色（`values`/`values-night`），卡底、文字、底板、按钮一次性换；快照里的 `theme` 字段保留但不再读取。**不跟随 Material Expressive 家族**：小部件由原生 `RemoteViews` 渲染，拿不到运行时算出来的配色，仍只有浅 / 深两态（应用内切换家族不影响它） |
| 长句 | 按 §4.2 分档字号，超过行数上限截断加 `…`，点击看全文 |
| 多实例 | 每个 `appWidgetId` 独立解码与配置，缓存按 id 隔离 |

---

## 9. 技术实现要点

1. **组件**：新增 Java `AppWidgetProvider`；Manifest 加 `<receiver android:exported="false">` + `APPWIDGET_UPDATE` intent-filter + `meta-data`，配套 `res/xml/*_info.xml` 与 `res/layout/` 布局。沿用现有 aapt2 / javac / d8 链，**不引入 Gradle、Kotlin、AndroidX、Glance**。
2. **RemoteViews 限制**：只能用 `FrameLayout / LinearLayout / RelativeLayout / GridLayout` 与 `TextView / ImageView / Button / ImageButton / ProgressBar / ViewStub` 等白名单控件，不能自定义 View；woff2 字体不可用。**`android.view.View` 本身不在白名单**——它看起来像"一个空盒子"，实际会让整张卡 apply 失败；要一条纯色/渐变横条就用 `FrameLayout` 加 `android:background`。布局里出现非白名单标签时，启动器只报 `An error occurred when loading widget`，logcat 不会指向具体标签，所以用 `scripts/android/check_widget_layout.py` 在构建前静态扫描。
3. **位图预合成**：两张图底卡共用一段 Canvas 逻辑（`centerCrop` → `clipPath` 圆角），**不烘任何色调**（压暗曾经烘在里面，第 14 轮就搬到布局层了）。实施时用 **`ARGB_8888` 而非 `RGB_565`**：RemoteViews 不能裁剪 ImageView，圆角必须做成位图里的透明像素，而 RGB_565 没有 alpha 通道；降采样后 W1 300×480、W4 480×300 各约 0.58MB，仍在 Binder 约 1MB 上限内。旧机型的圆角靠位图自带，Android 12+ 另由系统加圆角。
4. **圆角**：Android 12+ 由系统自动圆角；minSdk 24 旧机型必须在位图层面用 `RoundRect` 裁角，否则方角外露。
5. **按钮**：胶囊用 `shape` drawable（solid `#FBF8F2`、圆角 999px）作 `TextView` 背景；箭头用一枚 `res/drawable` vector（照 lucide `arrow-right` path），不可用 lucide-react；48dp 高兼顾触摸目标。
6. **权限与隐私**：`aapt2 dump` 应保持零 `<uses-permission>`；无联网、无账号、无埋点、无第三方 SDK、无精确闹钟、无前台服务。

---

## 10. 验收清单

- [ ] 三张卡面的元素白名单零越界（肉眼可核），4×1 按钮是唯一例外
- [ ] 2×2 同一天 12 个词不重复、次日窗口前移 12 位；换词时背景同步更新、无旧图残留
- [ ] 跨日 00:00 后换句与重洗正确率 100%；App 不在前台时轮播仍推进
- [ ] 评分后 4×1 状态 ≤30s 更新
- [ ] 3×1 / 4×1 / 5×1 三档宽度下按钮不裁字；系统字体放大 1.3× 不溢出
- [ ] 4×1 两个热区跳转各自正确；按钮点击后能创建/恢复 session 而非空学习页
- [ ] 按钮配色在浅/暗主题下恒定；白字对比度 ≥4.5:1；最小字号 ≥12sp
- [ ] 单实例位图 <1MB；旧机型圆角正确；插画主体未被竖裁切掉
- [ ] `aapt2 dump` 无新增权限；APK 增量 ≤200KB（不新增素材）；CC BY 署名在配置页可见

---

## 11. 明确不做

- 小部件内答题、评分、播放音频（绕开 FSRS 单一数据源，且 RemoteViews 状态不可靠）
- 联网同步、账号、通知提醒、签到奖励、补签卡、社交排名
- 断签警告、红色催促、拟人施压、显示 0
- 日期、标签、署名、周柱、连续天数、进度环、轮播指示、多余按钮
- 新增权限、前台服务、精确闹钟、后台常驻、第三方 SDK
