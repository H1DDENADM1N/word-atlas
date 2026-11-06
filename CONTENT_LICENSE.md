# 内容授权 / Content license

## 代码 / Code

源代码与界面设计采用 [MIT License](LICENSE)。依赖包保留各自授权；Fraunces 字体为 SIL Open Font License 1.1。

Source code and UI design are under the [MIT License](LICENSE). Dependencies keep their own licenses; the Fraunces typeface is under the SIL Open Font License 1.1.

## 词库内容、插画与录音 / Dataset, illustrations and recordings

以下内容以 **[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)** 提供，在项目维护者能够授予的权利范围内：

- `data/` 下的词库文件，以及 `public/atlas/index.json`、`public/atlas/entries/` 中的释义、英文释义、例句、译文、搭配、词族、同根词、词源图景小结、近反义词、提示、分级与分类；
- `public/atlas/img/`、`public/atlas/thumb/`、`public/brand/` 中的插画；
- `public/atlas/audio/` 中来自上游的原版单词发音与例句朗读录音（英音 / 美音为 ElevenLabs 的 Alice / Sarah）；若本地用 OALDPEX 覆盖了 `uk/`、`us/`，覆盖后的文件不在本授权内，见下节。

The material above is offered under CC BY 4.0, to the extent of the rights the maintainers can grant.

**署名 / Attribution:** `Word Atlas contributors — CC BY 4.0`，并附授权链接，说明是否做过修改。

### 单词发音 / Word pronunciations

公开发布包里的单词录音有两个来源。**76 个同形异音词**（`tear`、`record` 这类一个拼写两套读音的词）使用 Wikimedia Commons 上的真人录音，来自 Wiktionary 与 Lingua Libre，逐文件的作者与授权见 [docs/audio-credits.md](docs/audio-credits.md)；其中 CC BY-SA 3.0 / 4.0 的文件在再分发时需保留同样的授权与署名，另有 CC0 与公有领域的文件。其余单词使用上游 Word Atlas 的原版录音。

这批原版录音位于 `public/atlas/audio/uk/`、`public/atlas/audio/us/`，由 ElevenLabs 合成（Alice / Sarah），随上游 `public/atlas/audio/` 以 CC BY 4.0 提供。本 fork 的 `.gitignore` 默认不把这些 mp3 放进 Git；构建时从上游 `origin/main` 恢复，或由构建机提供。私用 OALDPEX 音源写入 `private/audio/oaldpex/{uk,us}`，不要覆盖公开音源；如果导入了，覆盖后的录音版权归牛津大学出版社，不属于 CC BY 4.0，只能自用，不得随 APK、镜像或任何形式的公开分发再传播。没有这些录音时，构建出的应用会改用内置的 Kokoro 语音朗读单词。

Word audio in the public build comes from two places. The **76 heteronyms** (one spelling, two readings, such as `tear` or `record`) use human recordings from Wikimedia Commons — Wiktionary and Lingua Libre — with per-file credit and licence in [docs/audio-credits.md](docs/audio-credits.md); the CC BY-SA 3.0 / 4.0 files must keep the same licence and credit when redistributed, and some are CC0 or public domain. The remaining words use upstream's original recordings.

Those originals live under `public/atlas/audio/uk/` and `public/atlas/audio/us/` (ElevenLabs, voices Alice and Sarah), offered under CC BY 4.0 with upstream's `public/atlas/audio/`. This fork's `.gitignore` keeps those mp3 files out of Git by default; the build restores them from upstream `origin/main` or from the build machine. Private OALDPEX audio goes to `private/audio/oaldpex/{uk,us}` and must not overwrite the public set; if imported, those files are Oxford University Press's, are **not** covered by CC BY 4.0, may be used for your own build only, and must not be redistributed in an APK, a mirror or any other public copy. Without those files the app reads words with the bundled Kokoro voice instead.

### 说明 / Notes

- 单个英文单词与通用词表本身不主张专有权。This project claims no exclusive rights over English words or the bare headword list.
- 词源图景、同根词与补充的近义词解析自项目自带的《词源词典》（19,996 条），与释义、例句同属上面 CC BY 4.0 的词库内容。The etymology notes, same-root words and extra synonyms are parsed from the project's own etymology dictionary (19,996 headwords) and are part of the CC BY 4.0 dataset above.
- `public/atlas/fallback/` 的查词兜底数据（未命中词卡时的音标与中文释义）来自 **ECDICT**，按 MIT License 提供，Copyright (c) 2025 Linwei；它**不在**上面 CC BY 4.0 的范围内，再分发时请保留 ECDICT 的版权与许可声明。The out-of-atlas lookup data in `public/atlas/fallback/` (transcription and Chinese gloss for words without a card) comes from **ECDICT**, under the MIT License, Copyright (c) 2025 Linwei. It is **not** part of the CC BY 4.0 material above; keep ECDICT's copyright and licence notice when redistributing.
- 内容由 AI 模型按项目规范生成（文本：大语言模型；插画：图像模型；例句录音：ElevenLabs 合成语音），经过自动校验，未逐条人工审校，按现状提供，不作准确性担保。公开发布包的单词发音为 ElevenLabs 合成，按现状提供；如导入 OALDPEX，则来自该第三方词典，同样按现状提供。Content was generated with AI models under the project's specifications (text: LLMs; illustrations: image models; example recordings: ElevenLabs), checked automatically, not proofread entry by entry, and is provided as-is without warranty. Word pronunciations in the public build are ElevenLabs recordings, also as-is; if OALDPEX recordings are imported, they come from the third-party dictionary described above, also as-is.
- 例句录音的授权只涉及这些完成的音频文件，不包含底层声音模型、声音身份或任何人的肖像、人格权，也不表示声音提供方为本项目背书。英音声音为 ElevenLabs “Alice”，美音为 “Sarah”。The licence for the example recordings covers the finished audio files only, not the underlying voice models or voice identities, and implies no endorsement. Voices: ElevenLabs "Alice" (UK) and "Sarah" (US).
- 不是官方雅思（IELTS）词表，与雅思考试主办方无关。Not an official IELTS list and not affiliated with the IELTS partners.
