<div align="center">

<img src="docs/assets/android-atlas.jpg" alt="word-atlas-android：图鉴网格" width="32%">　<img src="docs/assets/android-word.jpg" alt="词卡" width="32%">　<img src="docs/assets/android-today.jpg" alt="今日" width="32%">

# word-atlas-android

**把词光装进手机：完全离线的安卓版。**

7,298 个雅思词条 · 原创插画 · 内置英美语音 · 零权限 · 断网可用

[![Code: MIT](https://img.shields.io/badge/Code-MIT-17283B?style=flat-square)](LICENSE)
[![Dataset: CC BY 4.0](https://img.shields.io/badge/Dataset-CC_BY_4.0-AD5038?style=flat-square)](CONTENT_LICENSE.md)
![APK: 1.1 GB / 992 MB](https://img.shields.io/badge/APK-1.1_GB_%2F_992_MB-2F5D50?style=flat-square)
![Permissions: none](https://img.shields.io/badge/Permissions-none-2F5D50?style=flat-square)
[![Upstream](https://img.shields.io/badge/Upstream-designfuchen%2Fword--atlas-17283B?style=flat-square&logo=github)](https://github.com/designfuchen/word-atlas)

**本仓库**：<https://github.com/H1DDENADM1N/word-atlas-android>
**上游原版**：<https://github.com/designfuchen/word-atlas>

</div>

---

## 这是什么

这是 [word-atlas](https://github.com/designfuchen/word-atlas)（词光）的一个分支，只做一件事：**把同一个应用打包成完全离线的安卓 APK**。

词库、插画、录音、例句、复习算法全部来自上游，一条内容都没有改动。改的都是外壳——构建方式、数据加载、语音兜底、以及几处只有装在手机上才会暴露的问题。

原版是网页优先的开源项目，跑在浏览器里，媒体文件按需从网络取；这个分支把它塞进安卓 WebView，用 `file://` 直接打开，再把所有"会联网"和"依赖系统组件"的环节逐个替换掉。装一次，之后无论是飞行模式还是地铁隧道，全部功能照常。

## 与上游 word-atlas 的区别

一句话：**内容相同，运行方式不同。** 上游教你怎么把词背下来，这个仓库负责让它在没有网络、没有服务器、没有系统语音包的手机上跑起来。

### 一张表看清

| | **word-atlas**（上游原版） | **word-atlas-android**（本仓库） |
| :--- | :--- | :--- |
| 交付形态 | 网页应用 + 开放词库 | 安卓 APK（内含同一份前端） |
| 运行环境 | 浏览器访问网站或 `npm run dev` | 安卓 WebView，`file:///android_asset/www/index.html` |
| 网络 | 需要：媒体按需加载，可缓存供离线使用 | **完全不需要**：清单里没有任何权限，含 `INTERNET` |
| 本地服务 | Vite dev server / 静态托管 | 不启动服务、不监听端口 |
| 数据加载 | `fetch()` 拉分词片 | 构建期内联为 `atlas-embed/data.js`，资源随包 |
| 语音兜底 | 浏览器 `speechSynthesis` / 系统 TTS | APK 内置 Kokoro-82M（sherpa-onnx），不用系统 TTS |
| 保存与分享 | 浏览器下载链接 | 存到「下载 / Word Atlas」，随后拉起系统分享面板 |
| 界面主题 | 浅色 / 深色 / 跟随系统 | 追加极光、星光两套夜空与三种英文字体；修复「跟随系统」在 WebView 下恒为深色的问题 |
| 词卡 | 单个音标行 | 英音与美音并列；点词头看音节；例句、译文、搭配、词族、近义与释义里的词都能点开小窗 |
| 真题 | 无 | 「雅思语境」下面多一节**真题例句**，1,211 条剑桥雅思 4 原文与译文，标出处 |
| 话题星座 | 无（只有词汇星图） | 图鉴里多一块**话题星座**面板，十九个话题各一个星座 |
| 环境声 | 无 | **30 条**循环录音，配平响度，读词时自动压低 |
| 体积 | 仓库约 1 GB 资源 | 分享版 **1.03 GB** / 私用版 **992 MB**（全部资源都在里面） |
| 更新方式 | `git pull` / 网站自动更新 | 重新构建并安装（换签名需先卸载） |
| 构建工具 | Node + Vite | 再加 JDK 17 + Android SDK，**不需要 Gradle** |

### 三条硬保证

| 保证 | 怎么做到的 |
| :--- | :--- |
| **不能联网** | `AndroidManifest.xml` 里没有任何 `<uses-permission>`。缺少 `INTERNET`，系统内核拒绝为该 UID 创建 socket，代码层绕不过去。另设 `usesCleartextTraffic="false"` 与只信任系统证书的 Network Security Config。 |
| **没有服务器** | 页面从 APK 内的 `assets/www` 直接以 `file://` 打开，图片和录音相对引用。整个应用不监听任何端口，不做请求拦截代理。 |
| **没有运行时下载** | 词库索引、73 个词条分片、真题例句与音节标注索引、17 段界面音效在构建时内联；三十条环境声各打成一条按需注入的脚本（`file://` 下 `fetch()` 不可用），选中哪条才加载哪条；7,298 幅插画、7,298 张缩略图、23,115 段录音作为文件放进 APK。运行时没有一次网络请求。 |

另外：不含账号、埋点、统计或第三方 SDK。

### 为手机补的几处

这些不是"安卓移植的副产品"，而是这一版真正多出来的东西：

- **学习界面按「一屏」重排。** 手机上原来四个选项加反馈卡放不进一屏：作答后的反馈是吸底浮层，正好盖住后两个选项，图片题还得再往下滑才看得全。现在会话页锁在 `100dvh`，提示区弹性收缩（插图、听音球、拼写配图都按 `dvh` 封顶），选项固定在底部槽位；作答后反馈卡**顶替**选项的位置，不再遮挡。桌面端仍是双列选项加并排反馈。
- **答题与词卡按拇指重排。** 四个选项从 54 px 长到 68 px，离屏幕底边从 8 px 抬到 26 px，并撤掉 1–4 序号（数字键仍能选，只是不再画在按钮上）。作答后的卡片不再只是「看一眼」：可以直接播放单词和例句，点词头进入完整词条，例句中文可以先高斯模糊、点一下才显示；例句、译文、常用搭配、词族、近义词，连释义里那半句英文，都能点开小窗查词。「我的」里还能让日常例句、雅思语境例句跟着单词一起自动朗读，一条读完接下一句，切走即停。
- **词卡下面多了真题例句。** 从第三方的《雅思真题例句词典》导入 1,211 条剑桥雅思 4 的原文与译文，2,216 个词条用得上：在「雅思语境」下面多一节「真题例句」，标着出处（`C04T2L3` 就是剑 4、Test 2、听力 Part 3），带中文翻译，一个词有多条时点「换一句」往后翻。这些句子没有录音，朗读交给 APK 自带的 Kokoro。导入脚本是 `scripts/atlas/import_ielts.py`，只收句子中真的出现了该词的那几条——词典本身也会把 `visitor` 链到只讲 "a variety of shopping" 的句子上，那种显示出来只会让人困惑。
- **词头点一下看音节。** 点词卡上那个大单词，字母之间会浮出「·」——`ex·hib·ition`，再点一下复原。分隔点不是猜的，取自《牛津高阶》词条自带的 `syllable` 属性（`scripts/atlas/import_syllables.py` 从 OALDPEX 里抽出来，4,672 个词条有），所以和纸质词典的断法一致。试过用同一批标注训切分模型去补词典缺的部分，双音节词也只有 82% 能对上，所以没标的就是没标：`study`、`hotel` 这类词点下去没有变化。
- **图鉴里多了话题星座。** 十九个雅思话题各有一个星座，画在本话题自己的星上：先在本话题的星云里用带种子的 Poisson 采样挑出一撮相邻的词，再用一棵**互不相交**的生成树连起来，所以图形不会打结；55% 的概率再加一条长弦，但要求两端度数小于 3、长度不超过中位边的 1.5 倍、树上至少隔三跳——这样永远不会连出三角形。某个话题里学过的词到八成，星座就在星图上亮起来，卡片与星空两处统一为「未点亮全虚线、点亮后金色实线加辉光」两种状态，进度交给下面的进度条。点卡片，星图会飞到它跟前。

  图形之所以是二维的，靠的不是加厚银河盘：每个话题在盘面里另有一团二维「星云」（沿切向的长轴 + 径向的短轴，cos² 衰减，0.15 之外归零），只有云心附近那段臂上的词会被推开。曾经试过直接放宽螺旋臂的角向散布，结果整片星空的彩色分区被搅成一团灰紫——星云是唯一不牺牲话题配色的做法。连线只落在本话题的词上。

- **环境声是真的录音，不是合成的。** 30 条循环：雨、海、林、火、咖啡馆、虫鸣、蛙声、风雪、篝火、列车、琴键、竹笛、古琴、竖琴……来自另一个开源学习站 [gjenglish.com](https://gjenglish.com) 的[仓库](https://github.com/wenchester8-droid/english-starry-sky)，按固定 commit 取原文件（大部分是 Pixabay 录音，按 Pixabay Content License 使用；三条由上游自己合成）。每条都按上游的 dB 表配平过响度，换曲不用重调音量；读单词时自动压低到三成，选过的那条下次打开还在。`scripts/fetch_ambience.py` 负责取回并记录每条的字节数与 SHA-256，`--check` 可逐条复核。

- **键盘不再挡内容。** 打字页用一个透明 `<input>` 接管输入，它在挂载时就已聚焦，之后再 `focus()` 是空操作——WebView 因此不再唤起输入法，真机上点屏幕没反应。现在先 `blur()` 再 `focus()`，并经原生桥接显式 `showKeyboard()`；`viewport` 补了 `interactive-widget=resizes-content`，键盘弹起时按缩小后的视口重排，拼写与打字的输入区始终在键盘上方。
- **内置离线语音。** 第二条例句只有 1,011 个词有真人录音，其余 6,287 个词原先走系统 TTS——在没装英文语音包的机器上就是"点了没声音"。现在用 APK 自带的 Kokoro-82M 音色合成，24 kHz，点击前预渲染，按下即出声。
- **分享卡片能用。** `file://` 下每个文档是独立不透明源，`drawImage` 会污染 canvas，`toBlob()` 直接返回 `null`。改成把插图读成 `data:` URL 再绘制；保存后由原生层用 `ACTION_SEND` 拉起系统分享面板（WebView 不支持 `navigator.share({files})`）。
- **系统返回键有层级。** 先关查词小窗，再关词卡，再回上一页，最后才退出应用。
- **主题跟着手机走。** WebView 的 `prefers-color-scheme` 回答的是"应用自己的主题"，所以「跟随系统」在浅色手机上曾经永远深色；现在由原生层读 `Configuration.uiMode` 主动同步给页面。
- **「导入备份 / 清空记录」能点了。** 壳层漏配 `WebChromeClient` 时，`confirm()` 静默返回 `false`、文件选择器根本不弹。补上 `onJsConfirm` / `onShowFileChooser` 后恢复。
- **进度能搬到网页版，也能搬回来。** 上游网站的导入比本机严得多：它会把整份文件重新过一遍自己的校验器，`progress.drills` 缺失、或它认识的 22 个设置项里少一个（`examDate`、`illus`、`recall`……），就整份拒收——本机原来的导出因此总是得到「备份内容不完整或格式有误」。「我的 → 数据」里因此多了两个按钮：**导出网页版兼容备份**补上 `drills: {}` 与它要的全部设置项（本机独有的 30 条环境声只送它认得的 8 条，其余按 `stars`；`days` 里 `c > r` 会夹到 `r`），**从网页版备份导入**把 `drills`、`books`、考试计划这些本机没有的字段丢掉，保留卡片、每日统计和它能表达的设置。规则抄在 `src/store/web-backup.ts`，八条测试逐项复刻上游的校验；实机导出的 895 词备份在 [0xlei.tech/words](https://0xlei.tech/words/) 上直接提示「已恢复 895 个词的学习记录」。

完整实现、体积构成与逐条排查记录见 **[docs/android.md](docs/android.md)**。

## 与上游一致的部分

| 项目 | 数量 / 说明 |
| :--- | :--- |
| 词条 | **7,298** 条，CEFR A1–C2，19 个话题 |
| 例句 | **14,596** 条，日常与雅思语境，附中文翻译 |
| 插画 | **7,298** 幅，512 px WebP，另带缩略图 |
| 录音 | **23,115** 段：英音、美音、例句朗读，以及 105 个同形异音词的第二读音（分享版 76 个词用 Commons 真人录音；OALDPEX 真人版仅限私用构建） |
| 复习 | TS-FSRS 间隔复习，目标记忆率可调 |
| 功能 | 今日、图鉴、词卡、词汇星图（WebGL2）、四类练习、打字练习、导出 / 恢复备份（含与网页版互通） |
| 数据存放 | 本地优先，无账号无服务器，记录只在这台设备上 |

内容来源同样一致：释义、例句、搭配与大语言模型按统一词典规范撰写，插画由图像模型逐词绘制，例句朗读由 ElevenLabs 合成。经过自动结构与一致性校验，但**尚未逐条人工审校**，可能有错。不是官方雅思词表，也不承诺提分。

单词录音分两类。**76 个同形异音词**用 Wikimedia Commons 上的真人录音（Wiktionary 与 Lingua Libre，逐条授权与署名见 [docs/audio-credits.md](docs/audio-credits.md)）；其余 **7,222 个词**用上游原版 ElevenLabs 录音（英音 Alice / 美音 Sarah，CC BY 4.0）。还有 **29 个**词在 Commons 上找不到第二个读音，仍是合成音，卡片上标「合成」——这批词的真人音只存在于私用版。

公开发布包不包含 OALDPEX 的真人录音。`scripts/atlas/import_audio.py` 仍可用于私用构建，把 `uk/`、`us/` 换成 OALDPEX 录音（含这 105 个词的 418 条第二读音），但那批录音版权归牛津大学出版社，仅限自建自用、不得公开分发（见 [CONTENT_LICENSE.md](CONTENT_LICENSE.md)）。

## 安装

APK 不进仓库（`.gitignore` 已排除）。两种方式：

1. 看 [Releases](https://github.com/H1DDENADM1N/word-atlas-android/releases) 有没有现成产物；
2. 按下一节自己构建。

| 产物 | 单词发音 | 用途 |
| :--- | :--- | :--- |
| `word-atlas-android-v1.0.7.apk` | ElevenLabs 原版 + 76 个词的 Commons 真人录音 | 分享 / 公开分发 |
| `word-atlas-android-v1.0.7_O.apk` | OALDPEX 真人（牛津大学出版社） | 仅自用，不得公开分发 |

```bash
adb install -r word-atlas-android-v1.0.7.apk
```

两个包同一包名，不能同时安装；切换时覆盖安装即可，学习记录保留。

要求 **Android 7.0（API 24）及以上**，arm64 设备体验最好；安装需要约 **3 GB** 空闲空间。

## 版本

当前 **v1.0.7**（versionCode 8）。每个版本的改动与校验值见 [Releases](https://github.com/H1DDENADM1N/word-atlas-android/releases)。

| 版本 | 一句话 |
| :--- | :--- |
| **v1.0.7** | 中文搜索能查到单词的全部义项：搜「缠绕」「蜿蜒」也能找到 wind，结果里显示命中的那条释义 |
| **v1.0.6** | 105 个同形异音词补齐第二读音，其中 76 个换成真人录音（Commons，CC BY-SA）；合成音在卡片上标「合成」 |
| v1.0.5 | 一词两音按义项分开：tear 的 /teə/（撕）与 /tɪə/（眼泪）各有各的录音 |
| v1.0.4 | 答题挖空与选项对齐；单词发音分原版分享包与 OALDPEX 私用包 |
| v1.0.3 | 图鉴新增话题星座；环境声换成 30 条真实录音；词卡多了真题例句、音节与处处可点 |
| v1.0.2 | 选项按拇指重排，作答卡能听、能点、能往下读 |
| v1.0.1 | 学习页装进一屏，键盘不再挡内容 |
| v1.0.0 | 第一个完全离线版 |

覆盖安装即可升级，学习记录保留；换过签名的包需要先卸载，记录请提前在「我的」里导出备份。

## 从源码构建

需要 **Node.js 20+**、**JDK 17**、Android SDK（`platforms;android-34`、`build-tools;34.0.0`）。不需要 Gradle，也不需要 Android Studio。

```bash
git clone --depth 1 https://github.com/H1DDENADM1N/word-atlas-android.git
cd word-atlas-android
npm ci

# 一次性拉取离线语音运行时与音色（约 540 MB，校验 SHA-256，不进仓库）
python3 scripts/android/fetch_tts.py

# 公开版音源：public/atlas/audio/{uk,us}（上游原版，CC BY 4.0）
# 首次从上游 main 恢复（约 126 MB，不进 Git）：
git fetch --depth 1 origin main
git archive --format=tar origin/main public/atlas/audio/uk public/atlas/audio/us | tar -xf -
# 第二读音：public/atlas/audio/{uk2,us2}（105 个词，随仓库提供）
# 私用版音源：private/audio/oaldpex/{uk,us}（OALDPEX，已在 .gitignore 中排除）
# 私用版导入（只在有 OALDPEX 数据包时运行；不得公开分发）：
# python3 scripts/atlas/import_audio.py --out private/audio/oaldpex

export ANDROID_HOME=$HOME/.android-sdk
export JAVA_HOME=/path/to/jdk-17

# 默认同时出两个包；也可以只出其中一个
python3 scripts/android/build_apk.py
python3 scripts/android/build_apk.py --flavors share
python3 scripts/android/build_apk.py --flavors private

# → word-atlas-android-v1.0.7.apk      （分享版，原版发音）
# → word-atlas-android-v1.0.7_O.apk    （私用版，OALDPEX 真人发音）
adb install -r word-atlas-android-v1.0.7.apk
```

两个包共用同一份 Web bundle、内联数据、`base.apk` 与 `classes.dex`，只在打包阶段换单词音源；`--skip-web` 可以复用上一次的 `dist-android`。

脚本依次执行：`vite build --config vite.config.android.ts`（相对路径 + 传统 IIFE 脚本）→ 生成内联数据 → `aapt2 compile/link` → `javac` → `d8` → 打包 assets 与 `lib/<abi>/*.so` → `zipalign` → `apksigner`（每个音源各签一次）。

只想跑网页版（和上游完全一样）：

```bash
npm run dev          # http://localhost:5188
npm test             # 单元测试
npm run check:quiz   # 全词库答题审计：挖空与四个选项
npm run build        # 构建到 dist/
```

## 体积

| 内容 | 大小 |
| :--- | ---: |
| 插画 `atlas/img`（512 px WebP） | 203 MB |
| 缩略图 `atlas/thumb` | 88 MB |
| 录音（英音 49 / 美音 48 / 例句 267） | 364 MB |
| 词库 `atlas/entries` + `index.json` | 7.1 MB |
| 真题例句 `atlas/ielts.json` + 音节标注 `atlas/syllables.json` | 0.6 MB |
| 界面音效（17 段） | 0.3 MB |
| 环境声（30 条循环） | 56 MB |
| 离线语音：ONNX Runtime + JNI（arm64 / x86_64） | 55 MB |
| 离线语音：Kokoro-82M 音色 + espeak 音素表 | 353 MB |
| 前端 bundle、字体、图标 | ~1 MB |
| **APK** | **分享版 1.03 GB / 私用版 992 MB** |

想瘦身：只保留 `thumb/`（省 203 MB）、把录音转低码率、只打一个 ABI，或换回 Piper 音色（`fetch_tts.py --voice piper`，省约 290 MB，音质明显下降）。

## 已知限制

- **冷启动略慢**：首次要从 APK 里读取内联数据并解析。
- **体积就是代价**：分享版 1.03 GB、私用版 992 MB，是"全部资源装进 APK"的直接结果。
- **内置语音的延迟**：模型加载约 0.9 s；一句 7.8 s 的雅思长句合成约 3.6 s。按钮一出现就预渲染，所以正常点按是零等待，页面刚打开立刻点仍要等。
- **录音优先**：23,115 段录音优先，TTS 只补第二条例句缺录音的那 6,287 个词。
- **真题例句只覆盖 30%**：来源词典只收了剑桥雅思 4 的四套题，2,216 / 7,298 个词条有例句；A1 日常词本来就不出现在学术文章里。
- **音节标注只覆盖 64%**：4,672 个词条有标注，词典没标的（`study`、`hotel`、`river`、`city`）点词头不会有变化——切错了比不切更糟，所以不补写。
- **释义里的中文不可点**：切词与查词索引都只认英文，中文释义是纯文本。
- **签名**：`android/keystore/` 里是自签名开发密钥（口令 `wordatlas`）。要长期升级发布，请换自己的密钥并妥善保管——换密钥会导致已装版本无法覆盖升级。
- 内容与上游同步，上游的错这里也有。

## 开放数据

词库可以直接拿去用（Anki 牌组、小程序、评测集都行，署名即可）：

| 资源 | 入口 |
| :--- | :--- |
| 词条 JSON | [data/word-atlas.json](data/word-atlas.json) |
| 词条 CSV | [data/word-atlas.csv](data/word-atlas.csv) |
| 字段说明 | [docs/dataset.md](docs/dataset.md) |
| 插画 | [public/atlas/img/](public/atlas/img/) |
| 录音 | [public/atlas/audio/](public/atlas/audio/) |

```python
import json
from pathlib import Path

words = json.loads(Path("data/word-atlas.json").read_text(encoding="utf-8"))
b2_environment = [w for w in words if w["cefr"] == "B2" and w["topic"] == "environment"]
```

## 反馈与贡献

- **安卓壳、构建、APK 问题** → 提到[本仓库](https://github.com/H1DDENADM1N/word-atlas-android/issues)。
- **词条内容纠错** → 也可以提单，能一并回馈上游最好。
- 报告问题时请带上**词条 ID、复现步骤和预期结果**；内容纠错请附词典依据。
- 代码规范、数据同步与提交前检查见 [CONTRIBUTING.md](CONTRIBUTING.md)，安全问题的反馈方式见 [SECURITY.md](SECURITY.md)。

## 授权与致谢

| 范围 | 许可 |
| :--- | :--- |
| 应用代码 | [MIT](LICENSE) |
| 词库文本、插画与录音（单词 + 例句） | [CC BY 4.0](CONTENT_LICENSE.md)，署名 Word Atlas contributors（词光）；单词发音为原版 ElevenLabs（Alice / Sarah） |
| 单词发音（OALDPEX 私用导入） | 牛津大学出版社 — 仅限本地构建，不得再分发 |
| Kokoro-82M、sherpa-onnx | Apache-2.0 |
| 第三方依赖与字体 | 遵循各自许可 |

> 真题例句与音节标注分别导入自第三方的《雅思真题例句词典》与《牛津高阶》词典数据，**不在上表的 CC BY 4.0 范围内**；源文件不进仓库（`.gitignore` 已排除），随 APK 分发的只有导入后的索引。公开发布包的单词发音是上游原版，属于 CC BY 4.0；如私用导入 OALDPEX，则那批录音不在 CC BY 4.0 范围内，授权见 [CONTENT_LICENSE.md](CONTENT_LICENSE.md)。

原版应用与全部内容由 [@designfuchen](https://github.com/designfuchen) 制作并开源，见 [designfuchen/word-atlas](https://github.com/designfuchen/word-atlas)。本仓库基于其 `main`（`99c00767`）派生，只做安卓离线封装；功劳归上游，问题归这里。

---

如果这个离线版对你有用，给[上游](https://github.com/designfuchen/word-atlas)点个 Star，也欢迎给本仓库提 Issue。
