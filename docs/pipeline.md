# 内容生成流程 / Content pipeline

所有脚本在 `scripts/atlas/`，凭据只从环境变量或仓库外目录读取（见 [SECURITY.md](../SECURITY.md)）。中间产物写入被 Git 忽略的 `.local/forge/`，可断点续跑。

1. **词头**：`.local/forge/headwords.json`，每项 `{hid, word, raw}`。`raw` 是可选的义项提示，只用于判断哪些义项重要，不会被复制进输出。
2. **词条文本** `gen_text.py`：每批 10 个词，按 [`gen_text.py`](../scripts/atlas/gen_text.py) 中的编写规范（准确优先、原创、两类例句、不编造词源、安全中立）生成 JSON。
3. **插画** `gen_images.py`：每个词条自带一个场景描述 `scene`，与统一画风提示词组合后生成 1024px 图片，压缩为 768px WebP 母版。按学习路线顺序生成。
4. **发音** `gen_word_audio.py`：ElevenLabs，英音 Alice、美音 Sarah。
5. **例句朗读** `gen_sentence_audio.py`：为 `ex[0]` 合成朗读，按学习路线顺序。
6. **词源** `scripts/etymology/import_etymology.py`：解析 `etymology/etymology.mdx`（`Encrypted="2"` 的 MDict，键表加密、记录块是普通 zlib，所以只读记录块，词头取自每条开头的 `<font size=3>`），抽出【词源图景】小结、【近义词辨析】与【同根词】，写入 `scripts/etymology/etymology.json`。`build_atlas.py` 编译时按词头并入 `ety` / `syn` / `root`；不带参数直接跑，则把这三项补进已有的 `public/atlas/entries/`。
7. **同义词** `scripts/atlas/thesaurus.py`：解析 `同义词学习词典/同义词学习词典.mdx`（同样是 `Encrypted="2"` 的 MDict，按 `entry-content` 的 eid 去重），把 2,370 个同义词组的词头、词性、中英文组释义与组内词写入 `scripts/atlas/thesaurus.json`。`import_thesaurus.py` 按词性把组内词追加到 `syn`（只保留词库已有词头、去重、不设上限；组的中文释义与卡片义项匹配分须 ≥ 0.3，组按相关性排序），并重建 `data/`；`build_atlas.py` 编译时也调用同一套合并逻辑。
8. **义项归组** `scripts/atlas/build_relations.py`：读 `data/word-atlas.json` 与 `public/atlas/fallback/`，给每个 `syn` 词找最接近的义项，写入与 `syn` 等长的 `syn_sense`（`-1` 表示其他义项），并生成 `scripts/atlas/relations.json`（逐条记录来源义项、目标义项、分数与单向/双向状态）。目标词条的义项中文/英文释义是主证据，没有词条时用 ECDICT 释义；每组最多展示 8 个。界面只把词按义项分行，不标义项名。`build_atlas.py` 编译时通过 `apply_relations()` 把索引贴回词条。
9. **编译** `build_atlas.py`：清洗字段、排序、切块，生成 `public/atlas/` 与 `data/`。
10. **同形异音** `apply_pron.py`：把 [`pron.json`](../scripts/atlas/pron.json) 里的 14 个双读音词写进词条（`pron` + `senses[].v`），并把 `uk`/`us` 收敛成第一读音。`build_atlas.py` 不认识 `pron`，重建后必须再跑一次；`npm run check:pron` 可以查有没有漏。
11. **校验** `npm run check:atlas`：结构、顺序、引用与媒体文件存在性。

```bash
export SUB2_BASE_URL=... SUB2_API_KEY=... ELEVENLABS_API_KEY=...
python3 scripts/atlas/gen_text.py --workers 8
python3 scripts/atlas/gen_images.py --workers 8 --follow
python3 scripts/atlas/gen_word_audio.py
python3 scripts/atlas/gen_sentence_audio.py --follow
python3 scripts/etymology/import_etymology.py --dump
python3 scripts/atlas/build_atlas.py
python3 scripts/atlas/apply_pron.py
npm run check:atlas
```

`SUB2_BASE_URL` 指向任意 OpenAI 兼容的接口。

## 查词兜底 / Out-of-atlas lookup

词卡只有 7,298 张，例句里点到的词可能不在其中。`public/atlas/fallback/{a..z}.json` 是随站点/APK 一起发布的 ECDICT 精简表，只负责这种未命中：补一条音标、词性和一行中文释义，发音仍走内置 Kokoro，不显示插画，也不提供“查看词卡”。

```bash
python3 scripts/atlas/import_ecdict.py --source ../ECDICT/stardict.csv
```

- 数据来自 ECDICT 的 `stardict.csv`（不在本仓库，已在 `.gitignore` 忽略）；只收 ASCII 单词语、有中文释义且有可用音标的行，旧式音标会做 `ә→ə`、`'→ˈ` 等归一化，`英 … 美 …` 拆成 UK/US。
- 每行 `[uk, us, pos, zh]`，按首字母分片；当前 341,575 条、约 26 MB。`import_ecdict.py --dry-run` 只统计不落盘。
- 运行时 `src/lib/fallback.ts` 才加载对应首字母分片：Web 走 `fetch`，APK 走 `shell.assetDataUrl` 从打包资源读同一文件；最多缓存 4 片。
- 这份数据不参与 `build_atlas.py` 编译，也不在 `data/word-atlas.json` 里；`npm run check:atlas` 不校验它。

## 同形异音 / Two readings of one spelling

`tear`（撕 / 眼泪）、`use`、`present` 等 14 个词，一个拼写两个读音，两个读音各有自己的录音。词条用 `pron` 存读音组、`senses[i].v` 指回其中一组：

```json
"pron": [{ "uk": "/teə/", "us": "/ter/" }, { "uk": "/tɪə/", "us": "/tɪr/" }],
"senses": [{ "pos": "v.", "zh": "撕破；扯开" }, { "pos": "n.", "zh": "眼泪", "v": 1 }, …]
```

- 读音组的来源、义项归属、OALDPEX 的音频文件名都只写在 `scripts/atlas/pron.json`，`apply_pron.py` 负责落盘。
- 第一读音的录音是 `audio/{uk,us}/<id>.mp3`，第二读音是 `audio/{uk,us}2/<id>.mp3`。
- 分享版要自己录第二读音（14 词 × 2 音 = 28 条），放在 `public/atlas/audio/{uk,us}2/<id>.mp3`：`python3 scripts/atlas/gen_word_audio.py --pron`。它给每个词建一条 IPA 音素规则（ElevenLabs pronunciation dictionary），`npm run check:atlas` 的 `secondReadingAudio` 会一直数着缺口，归零就是补齐了。
- **字典只是「大概率」**：`eleven_v4_turbo` 对 pronunciation dictionary 的遵循是概率性的，同一份规则重录一次可能就忽略掉（实测 `tear` 美音重录后仍是 /ter/）。所以这 28 条必须听检，别只看 `secondReadingAudio` 归零。
- 单条读错时，改拼写比改字典可靠：`teer` / `tair` / `bough` 这类同音拼写每次都能读出想要的音，生成后写回 `<id>.mp3` 即可。`--force` 只影响已有文件是否跳过，`tmp.replace()` 才能在 Windows 上真正覆盖。
- 私用版用 `import_audio.py --heteronyms` 从 OALDPEX 抽，两组都抽，因为 `bow` 的第一读音在 OALDPEX 里排在第二条。
- 文件名不能按序号推：`use` 从 `gb_3` 起、`content` 存在 `xcontent` 名下、`object` 的美音是 `_rr` 重录。所以 `pron.json` 里存的是原样文件名。

## 质量边界

自动校验覆盖结构、字段、顺序和文件，不覆盖语义正确性。插画和例句没有逐条人工审校；发现问题请提 Issue 或 PR。
