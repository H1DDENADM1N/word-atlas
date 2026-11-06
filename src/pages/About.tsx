import { ArrowUpRight, Database, Github, Heart } from "lucide-react";
import { useAtlas } from "../atlas/context";
import { AMBIENCE_REPO, AMBIENCE_SITE, REPO_URL, UPSTREAM_SITE, UPSTREAM_URL } from "../config";
import { AMBIENCE } from "../lib/ambience";
import { shell } from "../lib/native";

const BASE = import.meta.env.BASE_URL;

/** The installed package version, or "" on the web where there is no package. */
function installedVersion() {
  try {
    return shell?.version?.() ?? "";
  } catch {
    return "";
  }
}

const VERSION = installedVersion();

/**
 * How many entries got a real exam sentence, and how many sentences there are.
 * Printed by `scripts/atlas/import_ielts.py`; bump both when it is re-run.
 */
const EXAM_WORDS = "2,216";
const EXAM_SENTENCES = "1,211";

/**
 * How many entries came with a syllable break from OALDPEX. Printed by
 * `scripts/atlas/import_syllables.py`; bump it when that is re-run.
 */
const SYLLABLE_WORDS = "4,672";

/**
 * How many entries got a 词源图景 note from the etymology dictionary. Printed by
 * `scripts/etymology/import_etymology.py`; bump it when that is re-run.
 */
const ETYM_WORDS = "6,754";

/** Size of the share build; printed at the end of `scripts/android/build_apk.py`. */
const APK_SIZE = "1.4 GB";

export function About() {
  const atlas = useAtlas();
  return (
    <div className="page about">
      <header className="about-hero">
        <img src={`${BASE}brand/og.webp`} alt="" />
        <div>
          <p className="eyebrow">关于 · 安卓离线版</p>
          <h1 className="display">同一本词光，装进口袋，断网也能读。</h1>
          <p className="lede">
            这里是 <b>word-atlas-android</b>：
            <a href={UPSTREAM_URL} target="_blank" rel="noreferrer">
              word-atlas
            </a>
            的安卓离线分支。{atlas.count.toLocaleString()}{" "}
            个词条、插画、例句和 FSRS 复习算法都来自上游开源版；单词录音在原版基础上补了 105 个同形异音词的第二读音，其中 76 个词的两个读音换成了 Wikimedia Commons 的真人录音。换掉的是外壳：整个应用被打包成一个完全离线的 APK。
          </p>
          <p className="lede">
            原版以网页为先，跑在浏览器和一台服务器上；这一版把同一份前端塞进安卓 WebView，再从构建配置到原生层，把依赖网络、依赖系统组件的地方逐个替换掉。代码仍是 MIT；词库、插画与例句录音仍是 CC BY 4.0，76 个同形异音词的录音则按 Commons 上各自的授权分发。
          </p>
          <div className="about-actions">
            <a className="btn btn-primary" href={REPO_URL} target="_blank" rel="noreferrer">
              <Github size={18} /> 本项目的 GitHub
            </a>
            <a className="btn btn-ghost" href={UPSTREAM_URL} target="_blank" rel="noreferrer">
              <Github size={18} /> 上游原版
            </a>
            <a className="btn btn-ghost" href={`${REPO_URL}/tree/main/data`} target="_blank" rel="noreferrer">
              <Database size={18} /> 词库 JSON / CSV
            </a>
          </div>
        </div>
      </header>

      <div className="about-grid">
        <section className="panel">
          <h3 className="eyebrow">和原版不一样的地方</h3>
          <ul className="feature-list">
            <li>
              <b>不能联网。</b>清单文件里没有任何权限声明，包括 <code>INTERNET</code>。没有这条权限，系统内核就不会给这个应用创建 socket，代码层面也绕不过去。
            </li>
            <li>
              <b>没有服务器。</b>页面直接用 <code>file:///android_asset</code>{" "}
              打开，不起本地服务、不监听端口；词库索引和音效在构建时内联，插画与录音随 APK 一起装好，运行时没有一次网络请求。
            </li>
            <li>
              <b>不用自备语音。</b>两句例句都配了录音：日常例句 7,298 条、雅思语境例句 7,298
              条，都是 ElevenLabs 原声。只有「真题例句」没有录音，交给 APK 内置的 Kokoro-82M
              音色合成，既不走系统 TTS，也不需要用户在手机里装语音包。
            </li>
            <li>
              <b>为手机补的几处。</b>词卡同时给出英音与美音、例句里的单词可点开小窗查词、分享卡片保存后直接拉起系统分享面板、两套夜空主题与三种英文字体、「跟随系统」按手机真实设置取色。
            </li>
            <li>
              <b>别的 app 里也能查。</b>在任何能选词的地方长按一个词，弹出的菜单里可以选「词光」当翻译器；从别处分享或复制一段文本，分享面板里也能选词光，直接落到图鉴里搜。两条入口都只读系统传进来的那段字，落点和图鉴搜索是同一个页面，查到的词照常进「最近查过」。长按「exhibition」，回来在「我的 → 查词历史」里就能接着看。不新增任何权限，也不联网：词还是只有本机这一份。
            </li>
            <li>
              <b>查过的词能找回来。</b>搜索面板空着的时候先列最近查过的 6 条，标题右边是「清空」和「查看全部」；一条都没有，就推 6 个按当天日期轮换的「试试这些词」。「我的 → 查词历史」是独立的一页，最多留 20 条，按最近优先、只编序号不记时间戳；练习页的「最近学过」是复习进度，跟它无关。这份记录单独存一个键，不进备份、也不随「清空记录」一起删。它记的是你翻过什么，不是学到哪了。
            </li>
            <li>
              <b>答题与词卡按拇指重排。</b>四个选项更高、离屏幕底边更远，1–4
              的序号撤掉；作答后的卡片不再只是看一眼，能直接播放单词和例句，点词头进入完整词条；例句中文可以先高斯模糊，点一下才显示；填空句里的生词也能点开小窗。「我的」里还能让日常例句、雅思语境例句跟着自动朗读，一条读完接下一句，切走即停。
            </li>
            <li>
              <b>学习界面按「一屏」重排。</b>手机上四个选项加上作答后的反馈卡本来就挤不进一屏：反馈卡是吸底浮层，正好盖住后两个选项，图还要往下滑才看得全。现在会话页锁在一屏之内，插图、听音球、拼写配图都按屏高封顶，选项固定在底部槽位，反馈卡<strong>顶替</strong>选项的位置而不是压在上面。打字页也不再被键盘顶跑：输入区显式唤起键盘，并按缩小后的视口重排，要拼的那个词始终在键盘上方。
            </li>
            <li>
              <b>词卡下面多了真题例句。</b>从第三方的《雅思真题例句词典》导入 {EXAM_SENTENCES}
              条剑桥雅思 4 的原文与译文，{EXAM_WORDS} 个词条用得上：「雅思语境」下面多一节「真题例句」，标着出处（C04T2L3
              就是剑 4、Test 2、听力 Part 3），带中文翻译；一个词有多条时点「换一句」往后翻。这些句子没有录音，朗读交给 APK 内置的 Kokoro。
            </li>
            <li>
              <b>词卡上多了词源图景。</b>音标下面、释义上面多一条「词源图景」：一句话把词根的字面义讲清楚：<i>concur</i>{" "}
              是 <i>com-</i>（共同）加 <i>currere</i>（跑），「一起跑向同一个终点」，<i>library</i> 的{" "}
              <i>libr-</i> 原本是「树皮」，那是书的前身。{ETYM_WORDS}{" "}
              个词条有这一节；同一份词典还补上了「同根词」一栏与近义辨析里的词，词卡底部因此多出一组同源词，点开就能查。
            </li>
            <li>
              <b>近义里多了同义词学习词典的词。</b>按卡片义项的中文释义匹配分 ≥0.3，从《牛津英语同义词学习词典》的 2,370
              个同义词组里取同词性词：2,175 张卡新增 7,774 个，近义总数到 28,518；大小写不敏感去重后不再卡 6 个上限，<i>strong</i>{" "}
              多出 <i>muscular</i>，<i>body</i> 多出 <i>skeleton</i>、<i>physique</i>，而「味道浓烈」「光线强」那几组不会混进来。
            </li>
            <li>
              <b>词头能看音节了。</b>点一下词卡上那个大单词，字母之间会浮出「·」，
              <i>ex·hib·ition</i>，再点一下复原。分隔点直接取自《牛津高阶》词条自己的音节标注（{SYLLABLE_WORDS}{" "}
              个词条带这项标注），所以和纸质词典的断法一致；词典本身没标的词（<i>study</i>、<i>hotel</i>{" "}
              这类），点下去没有变化。
            </li>
            <li>
              <b>词卡上能点的地方变多了。</b>例句、译文、常用搭配、词族、同根词、近义反义，连释义里那半句英文也能点，例如 <i>the natural object that moves around Earth</i>{" "}
              里的 <i>natural</i>：点一下弹一张小卡，给出音标、中文和发音，想深究再进完整词条。任何时候只开一张，返回键先关它。
            </li>
            <li>
              <b>查不到的词也能读。</b>点到的词若不在 {atlas.count.toLocaleString()}{" "}
              张词卡里，小卡会从随包的 ECDICT 精简表补一条英/美音标和中文释义；表里 341,575
              个英文单词语，按首字母分成 26 片随包，只在点开时按需读取。仍然明说「这个词不在词光词库里」，发音交给内置 Kokoro；不显示插画，也没有「查看词卡」。
            </li>
            <li>
              <b>图鉴里多了「话题星座」。</b>十九个雅思话题各有一个星座，画在本话题自己的星上。先在本话题的星云里挑出一撮相邻的词，再用一棵互不相交的生成树把它们连起来，所以图形不会打结、也不会出现三角形。某个话题里学过的词到八成，星座就在星图上亮起来；点卡片，星图会飞到它跟前。连线只落在本话题的词上，不会伸到隔壁分类去。
            </li>
            <li>
              <b>环境声来自真实录音。</b>{AMBIENCE.length}{" "}
              条循环：雨、海、林、火、咖啡馆、虫鸣、蛙声、风雪、篝火、列车、琴键、竹笛、古琴、竖琴……来自另一个开源学习站{" "}
              <a href={AMBIENCE_SITE} target="_blank" rel="noreferrer">
                gjenglish.com
              </a>{" "}
              的{" "}
              <a href={AMBIENCE_REPO} target="_blank" rel="noreferrer">
                仓库
              </a>
              ，按固定 commit 取原文件，逐条校验哈希。每条都配平过响度，换曲不用重调音量；读单词时会自动压低，切到后台会淡出、回来再淡入，选过的那条下次打开还在。
            </li>
            <li>
              <b>主屏上多了三张小部件。</b>「顽固词」（2×2）从错词本和重犯词里挑出一个难词，每两小时自动换一个，右上角也能手动刷新，背景就是这个词自己的插画；「今日一句」（4×2 / 5×2）每天换一条雅思语境例句与中文译文，配图是当日词的插画；「进度条」（4×1）写着还剩几步、待复习多少、新词多少、大概还要几分钟，右侧的「继续旅程 →」点一下就进学习页。三张卡都零权限、不联网、不含账号或统计，只读应用单向交给它们的一份进度快照，小部件不写记录，也不自己算复习。卡面跟随系统深浅色，可缩放，插画复用包内素材。从最近任务里划掉应用后，点卡片仍能进对应页面，顽固词也还能刷新。
            </li>
            <li>
              <b>备份能跟网页版互通。</b>上游网站导入时会把整份文件重过一遍自己的校验器，少一个它认识的设置项就整份拒收，原来的导出因此在网页版上总被判「备份内容不完整或格式有误」。「我的 → 数据」里现在有两个按钮：<b>导出网页版兼容备份</b>，补齐它要的字段与全部设置项；<b>从网页版备份导入</b>，把本机没有的字段丢掉，保住卡片、每日统计和它能表达的设置。实机导出的备份拿到网页版上，能直接恢复。
            </li>
            <li>
              <b>「我的 → 外观」里能藏起练习。</b>勾选「隐藏练习」后，底部导航只剩今日、图鉴、我的三栏，三者自动等宽占满整行，不再留出右侧空白也不会把「我的」挤到左边；今日页没有进行中的学习时，那个「打字练习」入口也一并收起。站在练习页时打开开关会直接跳回今日，不会被留在已隐藏的页面；该设置随备份与网页版互通。
            </li>
            <li>
              <b>体积换自由。</b>安装包约 {APK_SIZE}：{atlas.count.toLocaleString()} 幅插画、29,402
              段录音、三十条环境声、26 片查词兜底表和语音模型全在里面。装一次，之后无论是在地铁里还是飞行模式，功能都不打折。
            </li>
          </ul>
        </section>

        <section className="panel">
          <h3 className="eyebrow">和原版一样的地方</h3>
          <p className="muted">
            词条数量、释义、两句原创例句、搭配、词族、易混提示、插画、复习算法都来自上游，没有重写也没有删减。这一版另外补了三类离线资料：词源词典带来的词源图景、同根词与近义辨析；同义词学习词典带来的同词性近义词；给词光未收录词用的 ECDICT 音标与中文释义。单词发音只多了一样：105 个同形异音词的第二读音，其中 76 个词的两个读音来自 Commons。今日、图鉴、词卡、星图、四类练习、打字练习、查词历史这些上游功能都在，导出与恢复备份也还在，能和网页版互相搬（见左边那条）。
          </p>
          <p className="muted">
            仍然本地优先：没有账号，没有服务器，学习记录存在这台设备上。换机或清除数据前，记得先到「我的」导出备份。
          </p>
          <a className="link" href={UPSTREAM_SITE} target="_blank" rel="noreferrer">
            上游的在线网页版 <ArrowUpRight size={14} />
          </a>
        </section>

        <section className="panel">
          <h3 className="eyebrow">内容从哪里来</h3>
          <p className="muted">
            释义、例句、搭配和提示由大语言模型按统一词典规范撰写；插画由图像模型按统一画风逐词绘制；例句朗读与大部分单词发音由 ElevenLabs 合成（英音 Alice / 美音 Sarah），76 个同形异音词的两个读音则是 Commons 上的真人录音。内容经过结构与一致性自动校验，但没有逐条人工审校，可能有错。这一版没有改动任何一条释义或例句：新增的真题例句、词源图景、同根词与补充的近义词都在下面单独说明来源。看到问题请提到本仓库，能一并回馈上游。
          </p>
          <p className="muted">
            公开发布的构建里，单词发音有两种来源。<b>7,222 个词</b>的读音来自上游 Word Atlas 的原版 ElevenLabs 录音（英音 Alice / 美音 Sarah），随上游以 CC BY 4.0 提供；<b>76 个同形异音词的两个读音</b>（152 个文件）取自 Wikimedia Commons 的 Wiktionary 与 Lingua Libre，授权分别是 CC BY-SA 3.0（70）、CC BY-SA 4.0（59）、公有领域（16）、CC0（6）、CC BY 4.0（1），逐条作者与授权见仓库 <code>docs/audio-credits.md</code>；这部分<b>不在 CC BY 4.0 之内</b>，其中 CC BY-SA 的文件再分发时须保留同样的授权。另有 29 个同形异音词在 Commons 上找不到第二个读音，第二读音由本仓库用 ElevenLabs 合成，卡片上标「合成」。公开发布包不包含《牛津高阶》数据包（OALDPEX）的真人录音。如果你自己构建私用版，可以运行 <code>scripts/atlas/import_audio.py</code> 把 OALDPEX 导入 <code>private/audio/oaldpex</code>；那批录音版权归牛津大学出版社，只能自用，不得公开分发。
          </p>
          <p className="muted">
            词卡里的「词源图景」「同根词」与补充的近义词来自项目自带的词源词典（19,996 条），覆盖 {ETYM_WORDS}{" "}
            个词条，同样随词库以 CC BY 4.0 提供。和释义、例句一样，这些内容由模型按同一套规范撰写、经自动校验，但没有逐条人工审校；同根词按词根归纳，个别条目会给出同时代同族的远亲（<i>dais</i> 下可能列着 <i>desk</i>），当线索看比当词源学结论更合适。
          </p>
          <p className="muted">
            词卡近义里另有从《牛津英语同义词学习词典》并入的同词性词（2,370
            个同义词组，按义项中文释义匹配分 ≥0.3 筛选），只作离线索引与学习提示，版权归原编者；这部分不改变释义与例句。
          </p>
          <p className="muted">
            词卡里的「真题例句」是例外：它们来自第三方的《雅思真题例句词典》（剑桥雅思 4
            听力与阅读的原文及译文），不属于本仓库的 CC BY 4.0
            词库，版权归原编者，这里只做离线索引与朗读，供学习使用。
          </p>
          <p className="muted">
            查词小窗里的兜底音标与中文释义来自 <b>ECDICT</b> 的精简表（341,575
            个英文单词语），按 MIT License 提供，Copyright (c) 2025 Linwei；这部分<b>不在</b>{" "}
            CC BY 4.0 之内，再分发时请保留 ECDICT 的版权与许可声明。
          </p>
          <p className="muted">
            环境声又是另一类：大部分是 Pixabay 上的录音，按 Pixabay Content License
            使用（无需署名）；「静水深流」「八音旧梦」「弦上清音」三条由参考站自己用代码合成。来源与哈希都记在仓库里，可以逐条复核。
          </p>
          <p className="muted">
            桌面小部件复用同一批插画与原创例句，按 CC BY 4.0 使用，署名 <b>Word Atlas contributors，CC BY 4.0</b>；它们只在本地读取学习进度的快照，不联网、不申请任何额外权限，也不含账号或统计。
          </p>
          <p className="muted">不是官方雅思词表，也不承诺提分。</p>
        </section>

        <section className="panel">
          <h3 className="eyebrow">给开发者与授权</h3>
          <p className="muted">
            <code>data/word-atlas.json</code> 与 <code>.csv</code> 是完整词库。安卓侧的构建方式、体积构成、离线语音选型、外部查词的取值与编码，以及踩过的坑都在{" "}
            <code>docs/android.md</code>；三款主屏小部件的卡面版式、元素白名单和单向进度快照在{" "}
            <code>docs/android-widgets.md</code>；不需要 Gradle，<code>python3 scripts/android/build_apk.py</code>{" "}
            一条命令出包，JDK 17 以上与 Android SDK 就够。词源图景、同根词与近义辨析由{" "}
            <code>scripts/etymology/import_etymology.py</code> 从词源词典解析后并入词条；同义词学习词典的解析与合并见{" "}
            <code>scripts/atlas/thesaurus.py</code> 和 <code>scripts/atlas/import_thesaurus.py</code>，查词兜底分片由{" "}
            <code>scripts/atlas/import_ecdict.py</code> 生成，步骤记在 <code>docs/pipeline.md</code>。字段说明见{" "}
            <code>docs/dataset.md</code>；查词历史的存储与降级规则在 <code>src/lib/recent.ts</code>，网页版备份的校验规则逐条抄在 <code>src/store/web-backup.ts</code>。
          </p>
          <p className="muted">
            应用代码 <b>MIT</b>；词库文本、插画与例句录音 <b>CC BY 4.0</b>，署名 Word Atlas contributors（词光）。单词发音分两类：7,222 个词的读音是上游的 ElevenLabs 录音（Alice / Sarah，CC BY 4.0），29 个同形异音词的合成第二读音同样由 ElevenLabs 合成；76 个同形异音词的两个读音来自 Wikimedia Commons，按 CC BY-SA 3.0 / 4.0、CC0 或公有领域分发，署名见 <code>docs/audio-credits.md</code>。OALDPEX 真人录音是可选的私用构建，版权归牛津大学出版社，不得再分发。内置语音为
            Kokoro-82M 与 sherpa-onnx，均为 Apache-2.0。环境声按上面的说明单独授权。
          </p>
          <p className="muted">
            环境声不用手工收集：<code>python3 scripts/fetch_ambience.py</code> 按固定 commit
            从参考站仓库取回全部曲目，把字节数与 SHA-256 写进 <code>scripts/ambience-sources.json</code>，
            <code>--check</code> 可以逐条比对，上游悄悄换了文件会直接报出来。
          </p>
          <p className="muted">
            原版由{" "}
            <a href={UPSTREAM_URL} target="_blank" rel="noreferrer">
              @designfuchen
            </a>{" "}
            制作并开源。这个仓库只是它的一次安卓侧封装；原版内容与设计的功劳属于上游作者。
          </p>
          <a className="link" href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer">
            阅读文档 <ArrowUpRight size={14} />
          </a>
        </section>
      </div>
      <p className="colophon">
        <Heart size={14} /> 做给每一个在地铁里也想背两个词的人。
        {VERSION && <span className="colophon-version">v{VERSION}</span>}
      </p>
    </div>
  );
}
