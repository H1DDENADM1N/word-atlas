import { ChevronRight, Clock3, Download, Globe, RotateCcw, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAtlas } from "../atlas/context";
import { isMastered } from "../store/srs";
import { buildPalette } from "../lib/m3";
import { saveBlob } from "../lib/native";
import { previewHaptic } from "../lib/feedback";
import { go } from "../lib/router";
import { RECENT_CAP, resolveRecent, subscribeRecent } from "../lib/recent";
import { resolveSeed, useThemeSettings } from "../lib/theme";
import {
  FAMILY_LABEL,
  MODE_LABEL,
  NIGHT_LABEL,
  PALETTES,
  VARIANTS,
  VARIANT_LABEL,
  type M3Variant,
  type ThemeFamily,
} from "../lib/theme-model";
import { dayKey, EX_RATE_STEP, exportBackup, exportWebBackup, FAMILIES as FAMILY_KEYS, MAX_EX_RATE, MIN_EX_RATE, MODES as MODE_KEYS, NIGHT_SKINS, importAnyBackup, resetProgress, store, TEXT_SCALES, UI_SCALES, useStore, type Settings } from "../store/store";
import { toast } from "../ui/Toast";

/** Five stops, short words: they sit in one row on a 375px phone. */
const TEXT_SIZE_LABEL = ["小", "较小", "标准", "大", "特大"];
import { streakOf } from "./Today";

/** A three-colour preview of each palette: page, surface, accent. */
type Swatch = [string, string, string];

const FAMILY_HINT: Record<ThemeFamily, string> = {
  ink: "浅色纸面与陶土点缀，就是现在的样子。",
  night: "把整页配色换成极光或星光的深空。",
  // The third chip is painted from the live seed, so it always matches the page.
  m3e: "跟随壁纸取色，圆角更柔和，回弹更活泼。",
};

const FAMILY_SWATCH: Record<ThemeFamily, Swatch> = {
  ink: ["#f6f1e7", "#fffdf8", "#cb922c"],
  night: ["#05060f", "#171d35", "#4fe8b8"],
  m3e: ["#f6f1e7", "#fffdf8", "#c4573a"],
};

const NIGHT_SWATCH: Record<"aurora" | "starlight", Swatch> = {
  aurora: ["#05060f", "#171d35", "#4fe8b8"],
  starlight: ["#06080f", "#10142a", "#e8c48a"],
};

export function Me({ privateAvailable }: { privateAvailable: boolean }) {
  const atlas = useAtlas();
  const progress = useStore((s) => s.progress);
  const settings = useStore((s) => s.settings);
  const { mode } = useThemeSettings();
  const dark = mode === "dark";
  // Every chip in the expressive group previews the same seed the page uses.
  const seed = useMemo(() => resolveSeed(settings.m3Accent), [settings.m3Accent]);
  const saveError = useStore((s) => s.saveError);
  const file = useRef<HTMLInputElement>(null);
  const webFile = useRef<HTMLInputElement>(null);
  const [recentN, setRecentN] = useState(() => resolveRecent(atlas).length);

  useEffect(() => {
    const refresh = () => setRecentN(resolveRecent(atlas).length);
    refresh();
    return subscribeRecent(refresh);
  }, [atlas]);

  const stats = useMemo(() => {
    const cards = Object.values(progress.cards);
    const days = Object.values(progress.days);
    const r = days.reduce((n, d) => n + d.r, 0);
    const c = days.reduce((n, d) => n + d.c, 0);
    const t = days.reduce((n, d) => n + d.t, 0);
    const now = Date.now();
    const forecast = Array.from({ length: 7 }, (_, i) => {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      end.setDate(end.getDate() + i);
      const start = new Date(end);
      start.setHours(0, 0, 0, 0);
      return cards.filter((x) => (i === 0 ? x.due <= end.getTime() : x.due >= start.getTime() && x.due <= end.getTime())).length;
    });
    void now;
    return { learned: cards.length, mastered: cards.filter(isMastered).length, reviews: r, accuracy: r ? Math.round((c / r) * 100) : 0, minutes: Math.round(t / 60), forecast };
  }, [progress]);

  const set = (patch: Partial<Settings>) => store.settings(patch);
  /** Keep the speed on the 0.1 grid, so 0.3 − 0.1 cannot drift to 0.1999… */
  const setRate = (key: "exRateDaily" | "exRateIelts" | "exRateExam", v: number) =>
    set({
      [key]: Math.min(MAX_EX_RATE, Math.max(MIN_EX_RATE, Math.round(v * 10) / 10)),
    } as Partial<Settings>);
  const download = async () => {
    const blob = new Blob([exportBackup()], { type: "application/json" });
    const where = await saveBlob(blob, `word-atlas-backup-${dayKey()}.json`);
    toast(where === "shell" ? "备份已保存到下载目录" : "备份已下载", "ok");
  };
  const downloadWeb = async () => {
    const blob = new Blob([exportWebBackup()], { type: "application/json" });
    const where = await saveBlob(blob, `word-atlas-web-backup-${dayKey()}.json`);
    toast(where === "shell" ? "网页版备份已保存到下载目录" : "网页版备份已下载", "ok");
  };
  const restore = async (f: File) => {
    if (f.size > 30 * 1024 * 1024) return toast("文件超过 30 MiB，无法导入。请选择词光导出的备份文件。", "warn");
    const r = importAnyBackup(await f.text());
    if (!r.ok) return toast(r.error, "warn");
    const days = r.days ? `、${r.days} 天记录` : "";
    toast(`已恢复 ${r.cards} 个词的学习记录${days}`, "ok");
  };
  const maxF = Math.max(1, ...stats.forecast);
  const streak = streakOf(progress.days);

  return (
    <div className="page me">
      <header className="page-head">
        <p className="eyebrow">我的</p>
        <h1 className="display">我的学习</h1>
      </header>

      <a
        className="me-history-link"
        href="#/history"
        onClick={(e) => {
          e.preventDefault();
          go({ page: "history" });
        }}
      >
        <Clock3 size={19} />
        <span className="me-history-text">
          <b>查词历史</b>
          <small>最近查过的词，最多保留 {RECENT_CAP} 条</small>
        </span>
        <em>{recentN ? `${recentN} 条` : "暂无"}</em>
        <ChevronRight size={17} />
      </a>

      <section className="stat-strip" aria-label="学习统计">
        <div className="stat-lead">
          <dt>连续学习</dt>
          <dd>
            {streak}
            <small>天</small>
          </dd>
        </div>
        <div>
          <dt>已学</dt>
          <dd>
            {stats.learned.toLocaleString()}
            <small>词</small>
          </dd>
        </div>
        <div>
          <dt>较熟悉</dt>
          <dd>
            {stats.mastered.toLocaleString()}
            <small>词</small>
          </dd>
        </div>
        <div>
          <dt>首次正确率</dt>
          <dd>
            {stats.accuracy}
            <small>%</small>
          </dd>
        </div>
        <div>
          <dt>学习时长</dt>
          <dd>
            {stats.minutes}
            <small>分钟</small>
          </dd>
        </div>
      </section>

      <div className="me-grid">
        <section className="panel">
          <h3 className="eyebrow">过去 20 周</h3>
          <Heatmap days={progress.days} />
          <div className="heat-legend" aria-hidden="true">
            <span>少</span>
            <i className="h0" />
            <i className="h1" />
            <i className="h2" />
            <i className="h3" />
            <i className="h4" />
            <span>多</span>
          </div>
          <p className="muted">每格代表一天，颜色越深，作答越多。“较熟悉”按复习记录估算，仍需定期复习。</p>
        </section>

        <section className="panel">
          <h3 className="eyebrow">未来 7 天待复习</h3>
          <ol className="forecast">
            {stats.forecast.map((n, i) => (
              <li key={i} className={i === 0 ? "is-today" : ""}>
                <span style={{ height: `${(n / maxF) * 100}%` }} />
                <b>{n}</b>
                <small>{i === 0 ? "今天" : i === 1 ? "明天" : `+${i}`}</small>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel settings">
          <h3 className="eyebrow">学习设置</h3>

          <Group label="学习节奏" />
          <Field label="每日新词" hint="每天可设 1–200 个新词，复习另计。">
            <div className="segmented">
              {[5, 10, 15, 20, 30].map((n) => (
                <button key={n} className={settings.dailyNew === n ? "is-on" : ""} onClick={() => set({ dailyNew: n })}>
                  {n}
                </button>
              ))}
            </div>
          </Field>
          <Field label="学习起点" hint="只影响之后安排的新词，已学词的复习和当前这一轮保持不变。">
            <div className="segmented">
              {atlas.cefr.map((l, i) => (
                <button key={l} className={settings.startLevel === i ? "is-on" : ""} onClick={() => set({ startLevel: i })}>
                  {l}
                </button>
              ))}
            </div>
          </Field>
          <Field label="复习目标" hint="希望下次复习时仍记得的比例。数值越高，复习通常越频繁；可先用默认的 90%。">
            <div className="segmented">
              {[0.85, 0.9, 0.95].map((n) => (
                <button key={n} className={settings.retention === n ? "is-on" : ""} onClick={() => set({ retention: n })}>
                  {Math.round(n * 100)}%
                </button>
              ))}
            </div>
          </Field>

          <Group label="外观" />
          <Field label="主题家族" hint={FAMILY_HINT[settings.themeFamily]} stack>
            <div className="theme-picker" role="group" aria-label="主题家族">
              {FAMILY_KEYS.map((key) => (
                <button
                  key={key}
                  className={settings.themeFamily === key ? "is-on" : ""}
                  onClick={() => set({ themeFamily: key })}
                  aria-pressed={settings.themeFamily === key}
                >
                  {key === "m3e" ? (
                    <ThemeChip seed={seed} dark={dark} variant={settings.m3Variant} />
                  ) : (
                    <Chip swatch={FAMILY_SWATCH[key]} />
                  )}
                  <span>{FAMILY_LABEL[key]}</span>
                </button>
              ))}
            </div>
          </Field>
          {settings.themeFamily === "night" ? (
            <Field label="夜空" hint="极光偏冷绿，星光偏暖金。" stack>
              <div className="theme-picker" role="group" aria-label="夜空">
                {NIGHT_SKINS.map((key) => (
                  <button
                    key={key}
                    className={settings.nightSkin === key ? "is-on" : ""}
                    onClick={() => set({ nightSkin: key })}
                    aria-pressed={settings.nightSkin === key}
                  >
                    <Chip swatch={NIGHT_SWATCH[key]} />
                    <span>{NIGHT_LABEL[key]}</span>
                  </button>
                ))}
              </div>
            </Field>
          ) : (
            <Field label="深浅" hint="跟随系统会随手机的深色模式切换。">
              <div className="segmented">
                {MODE_KEYS.map((key) => (
                  <button key={key} className={settings.themeMode === key ? "is-on" : ""} onClick={() => set({ themeMode: key })}>
                    {MODE_LABEL[key]}
                  </button>
                ))}
              </div>
            </Field>
          )}
          {settings.themeFamily === "m3e" && (
            <>
              <Field label="强调色" hint="默认跟随手机壁纸的主色。" stack>
                <div className="accent-dots" role="group" aria-label="强调色">
                  <button
                    className={`accent-follow ${settings.m3Accent === "wallpaper" ? "is-on" : ""}`}
                    onClick={() => set({ m3Accent: "wallpaper" })}
                    aria-pressed={settings.m3Accent === "wallpaper"}
                  >
                    跟随壁纸
                  </button>
                  {PALETTES.map((p) => (
                    <button
                      key={p.hex}
                      className={`accent-dot ${settings.m3Accent === p.hex ? "is-on" : ""}`}
                      style={{ background: p.hex }}
                      title={p.name}
                      aria-label={p.name}
                      aria-pressed={settings.m3Accent === p.hex}
                      onClick={() => set({ m3Accent: p.hex })}
                    />
                  ))}
                </div>
              </Field>
              <Field label="调色板风格" hint="同一个种子在不同风格下会生成不同气质的整套配色。" stack>
                <div className="theme-picker" role="group" aria-label="调色板风格">
                  {VARIANTS.map((v) => (
                    <button
                      key={v}
                      className={settings.m3Variant === v ? "is-on" : ""}
                      onClick={() => set({ m3Variant: v })}
                      aria-pressed={settings.m3Variant === v}
                    >
                      <ThemeChip seed={seed} dark={dark} variant={v} />
                      <span>{VARIANT_LABEL[v]}</span>
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}
          <Field label="英文字体" hint="调整英文单词和例句的字体。">
            <div className="segmented">
              {(
                [
                  ["serif", "衬线"],
                  ["sans", "无衬线"],
                  ["classic", "复古"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} className={settings.wordFont === k ? "is-on" : ""} onClick={() => set({ wordFont: k })}>
                  {l}
                </button>
              ))}
            </div>
          </Field>
          <Field label="中文字体" hint="内置霞鹜文楷，只换中文字形，英文与数字不受影响。">
            <div className="segmented">
              {(
                [
                  ["system", "系统默认"],
                  ["wenkai", "霞鹜文楷"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} className={settings.cjkFont === k ? "is-on" : ""} onClick={() => set({ cjkFont: k })}>
                  {l}
                </button>
              ))}
            </div>
          </Field>
          <Field label="界面缩放" hint="整页等比放大或缩小，间距和按钮一起变。">
            <div className="segmented segmented-wide">
              {UI_SCALES.map((v) => (
                <button
                  key={v}
                  className={settings.uiScale === v ? "is-on" : ""}
                  onClick={() => set({ uiScale: v })}
                >
                  {Math.round(v * 100)}%
                </button>
              ))}
            </div>
          </Field>
          <Field label="字体大小" hint="只放大正文、释义和例句；标题与按钮不受影响。">
            <div className="segmented segmented-wide">
              {TEXT_SCALES.map((v, i) => (
                <button
                  key={v}
                  className={settings.textScale === v ? "is-on" : ""}
                  onClick={() => set({ textScale: v })}
                >
                  {TEXT_SIZE_LABEL[i]}
                </button>
              ))}
            </div>
          </Field>
          <Toggle
            label="隐藏练习"
            hint="底部导航只留今日、图鉴和我的；今日页的打字练习入口也一起收起。"
            on={settings.hidePractice}
            set={(v) => set({ hidePractice: v })}
          />

          <Group label="声音" />
          <Field label="默认发音">
            <div className="segmented">
              <button className={settings.accent === "uk" ? "is-on" : ""} onClick={() => set({ accent: "uk" })}>
                英音
              </button>
              <button className={settings.accent === "us" ? "is-on" : ""} onClick={() => set({ accent: "us" })}>
                美音
              </button>
            </div>
          </Field>
          <Toggle label="自动播放发音" on={settings.autoplay} set={(v) => set({ autoplay: v })} />
          <Toggle sub label="自动朗读日常例句" on={settings.autoplayEx} set={(v) => set({ autoplayEx: v })} />
          <Toggle sub label="自动朗读雅思语境例句" on={settings.autoplayEx2} set={(v) => set({ autoplayEx2: v })} />
          <RateField
            label="日常例句速度"
            hint="三种例句各调各的：只改这一种的快慢，单词发音和另外两种都不受影响。"
            value={settings.exRateDaily}
            set={(v) => setRate("exRateDaily", v)}
          />
          <RateField
            label="雅思语境例句速度"
            value={settings.exRateIelts}
            set={(v) => setRate("exRateIelts", v)}
          />
          <RateField
            label="真题例句速度"
            hint="词卡下方「真题例句」那一块，换句后仍按这个速度朗读。"
            value={settings.exRateExam}
            set={(v) => setRate("exRateExam", v)}
          />
          <Toggle label="界面音效" on={settings.sfx} set={(v) => set({ sfx: v })} />
          <Toggle
            label="界面震动"
            hint="点按钮、改配置、翻卡与判题时各给一下短震动；点空白处不震。走系统触感反馈通道，不申请任何权限。"
            on={settings.haptic}
            set={(v) => {
              set({ haptic: v });
              // Feel it immediately when switching on, without waiting for the
              // next press (the press itself happened while it was still off).
              if (v) previewHaptic();
            }}
          />

          <Group label="习惯" />
          <Toggle label="例句中文先模糊" hint="点一下模糊的中文就显示，离开词卡后恢复模糊。" on={settings.blurZh} set={(v) => set({ blurZh: v })} />
          <Toggle label="每日开屏动画" on={settings.splash} set={(v) => set({ splash: v })} />
          <Toggle label="复习时加入拼写题" on={settings.spell} set={(v) => set({ spell: v })} />
          {privateAvailable && (
            <Field label="词库" hint="本地词库仅供当前开发环境使用。">
              <div className="segmented">
                <button className={settings.dataset === "open" ? "is-on" : ""} onClick={() => set({ dataset: "open" })}>
                  公开词库
                </button>
                <button className={settings.dataset === "private" ? "is-on" : ""} onClick={() => set({ dataset: "private" })}>
                  本地词库
                </button>
              </div>
            </Field>
          )}
        </section>

        <section className="panel">
          <h3 className="eyebrow">学习数据</h3>
          <p className="muted">进度保存在当前浏览器，不会自动同步。换设备或清除浏览器数据前，请先导出备份。</p>
          {saveError && <p className="warn-text">进度未能保存。请先导出备份，再检查浏览器存储空间和隐私设置。</p>}
          <div className="data-actions">
            <button className="btn btn-ghost" onClick={download}>
              <Download size={18} /> 导出备份
            </button>
            <button className="btn btn-ghost" onClick={() => file.current?.click()}>
              <Upload size={18} /> 导入备份
            </button>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0]).finally(() => (e.target.value = ""))} />
            <button
              className="btn btn-ghost btn-danger"
              onClick={() => {
                if (confirm("清空当前词库的学习记录？清空后无法撤销。建议先导出备份。")) {
                  resetProgress();
                  toast("学习记录已清空");
                }
              }}
            >
              <RotateCcw size={18} /> 清空学习记录
            </button>
          </div>

          <h4 className="group-label">与网页版互通</h4>
          <p className="muted">
            网页版（0xlei.tech/words）的导入会逐项核对整份文件：少了 drills、或少一个它认得的设置项，就整份拒收。下面两个按钮负责在两边搬进度，它没有的选项按默认值补齐。
          </p>
          <div className="data-actions">
            <button className="btn btn-ghost" onClick={downloadWeb}>
              <Globe size={18} /> 导出网页版兼容备份
            </button>
            <button className="btn btn-ghost" onClick={() => webFile.current?.click()}>
              <Globe size={18} /> 从网页版备份导入
            </button>
            <input ref={webFile} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0]).finally(() => (e.target.value = ""))} />
          </div>
        </section>
      </div>
    </div>
  );
}

/** A quiet divider that groups the long settings list into readable runs. */
function Group({ label }: { label: string }) {
  return <h4 className="group-label">{label}</h4>;
}

function Field({ label, hint, stack, children }: { label: string; hint?: string; stack?: boolean; children: React.ReactNode }) {
  return (
    <div className={`field ${stack ? "field-stack" : ""}`}>
      <div>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </div>
  );
}

/** `sub` marks a switch that only refines the one above it. */
function Toggle({ label, hint, sub, on, set }: { label: string; hint?: string; sub?: boolean; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className={`field toggle ${sub ? "is-sub" : ""}`}>
      <div>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </div>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => set(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

/**
 * One example speed: the slider for the long drag, a −/+ pair that walks the
 * 0.1 grid exactly, and the readout saying where it landed.
 */
function RateField({ label, hint, value, set }: { label: string; hint?: string; value: number; set: (v: number) => void }) {
  return (
    <Field label={label} hint={hint} stack>
      <div className="rate-row">
        <button
          type="button"
          className="rate-step"
          onClick={() => set(value - EX_RATE_STEP)}
          disabled={value <= MIN_EX_RATE}
          aria-label={`${label}放慢一档`}
        >
          −
        </button>
        <input
          type="range"
          min={MIN_EX_RATE}
          max={MAX_EX_RATE}
          step={EX_RATE_STEP}
          value={value}
          onChange={(e) => set(Number(e.target.value))}
          aria-label={label}
          aria-valuetext={`${value.toFixed(1)} 倍速`}
        />
        <button
          type="button"
          className="rate-step"
          onClick={() => set(value + EX_RATE_STEP)}
          disabled={value >= MAX_EX_RATE}
          aria-label={`${label}加快一档`}
        >
          +
        </button>
        <output className="rate-value" aria-live="off">
          {value.toFixed(1)}×
        </output>
      </div>
    </Field>
  );
}

function Heatmap({ days }: { days: Record<string, { r: number }> }) {
  const weeks = 20;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (weeks * 7 - 1) - end.getDay());
  const cells: { k: string; v: number; future: boolean }[] = [];
  const d = new Date(start);
  for (let i = 0; i < (weeks + 1) * 7; i++) {
    const k = dayKey(d);
    cells.push({ k, v: days[k]?.r ?? 0, future: d > end });
    d.setDate(d.getDate() + 1);
  }
  const lvl = (v: number) => (v === 0 ? 0 : v < 10 ? 1 : v < 25 ? 2 : v < 50 ? 3 : 4);
  return (
    <div className="heatmap" role="img" aria-label="过去 20 周的每日作答记录">
      {cells.map((c) => (
        <span key={c.k} className={`h${c.future ? "x" : lvl(c.v)}`} title={`${c.k} · ${c.v} 题`} />
      ))}
    </div>
  );
}

/** A static three-colour swatch, the same shape the theme chips use. */
function Chip({ swatch }: { swatch: Swatch }) {
  return (
    <span
      className="theme-chip"
      style={{ "--tp": swatch[0], "--ts": swatch[1], "--ta": swatch[2] } as React.CSSProperties}
      aria-hidden="true"
    >
      <i />
      <i />
    </span>
  );
}

/** One palette-style chip, painted from that style's own computed palette.
 *  The page colour is the primary container, so the styles differ at a glance
 *  instead of nine near-identical dark squares with different pinpricks. */
function ThemeChip({ seed, dark, variant }: { seed: string; dark: boolean; variant: M3Variant }) {
  const p = useMemo(() => buildPalette(seed, dark, variant), [seed, dark, variant]);
  return (
    <span
      className="theme-chip"
      style={{ "--tp": p["--terra-soft"], "--ts": p["--card"], "--ta": p["--terra"] } as React.CSSProperties}
      aria-hidden="true"
    >
      <i />
      <i />
    </span>
  );
}
