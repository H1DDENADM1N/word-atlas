# 内容授权 / Content license

## 代码 / Code

源代码与界面设计采用 [MIT License](LICENSE)。依赖包保留各自授权；Fraunces 字体为 SIL Open Font License 1.1。

Source code and UI design are under the [MIT License](LICENSE). Dependencies keep their own licenses; the Fraunces typeface is under the SIL Open Font License 1.1.

## 词库内容、插画与录音 / Dataset, illustrations and recordings

以下内容以 **[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)** 提供，在项目维护者能够授予的权利范围内：

- `data/` 下的词库文件，以及 `public/atlas/index.json`、`public/atlas/entries/` 中的释义、英文释义、例句、译文、搭配、词族、近反义词、提示、分级与分类；
- `public/atlas/img/`、`public/atlas/thumb/`、`public/brand/` 中的插画；
- `public/atlas/audio/ex/`、`public/atlas/audio/ex2/` 中的例句朗读录音。

The material above is offered under CC BY 4.0, to the extent of the rights the maintainers can grant.

**署名 / Attribution:** `Word Atlas contributors — CC BY 4.0`，并附授权链接，说明是否做过修改。

### 单词发音不在仓库里 / Word pronunciations are not in this repository

`public/atlas/audio/uk/` 与 `public/atlas/audio/us/` 下的单词发音**不随本仓库分发**，也不在上面的 CC BY 4.0 范围内。它们由本地构建时从《牛津高阶英语词典》数据包（OALDPEX）导入，见 `scripts/atlas/import_audio.py`；版权归牛津大学出版社，只能用于自己的构建，**不得随 APK、镜像或任何形式的公开分发再传播**。仓库里没有这两个目录时，构建出的应用改用内置的 Kokoro 语音朗读单词。

The word recordings under `public/atlas/audio/uk/` and `public/atlas/audio/us/` are **not** distributed with this repository and are **not** covered by the CC BY 4.0 grant above. A local build imports them from the OALDPEX dictionary package with `scripts/atlas/import_audio.py`. They are Oxford University Press's, may be used for your own build only, and must not be redistributed in an APK, a mirror or any other public copy. Without those directories the app reads words with the bundled Kokoro voice instead.

### 说明 / Notes

- 单个英文单词与通用词表本身不主张专有权。This project claims no exclusive rights over English words or the bare headword list.
- 内容由 AI 模型按项目规范生成（文本：大语言模型；插画：图像模型；例句录音：ElevenLabs 合成语音），经过自动校验，未逐条人工审校，按现状提供，不作准确性担保。单词发音来自上述第三方词典，同样按现状提供。Content was generated with AI models under the project's specifications (text: LLMs; illustrations: image models; example recordings: ElevenLabs), checked automatically, not proofread entry by entry, and is provided as-is without warranty. Word pronunciations come from the third-party dictionary described above, also as-is.
- 例句录音的授权只涉及这些完成的音频文件，不包含底层声音模型、声音身份或任何人的肖像、人格权，也不表示声音提供方为本项目背书。英音声音为 ElevenLabs “Alice”，美音为 “Sarah”。The licence for the example recordings covers the finished audio files only, not the underlying voice models or voice identities, and implies no endorsement. Voices: ElevenLabs "Alice" (UK) and "Sarah" (US).
- 不是官方雅思（IELTS）词表，与雅思考试主办方无关。Not an official IELTS list and not affiliated with the IELTS partners.
