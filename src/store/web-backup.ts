/**
 * Interop with the upstream web edition (https://0xlei.tech/words/).
 *
 * The fork and the site store the same thing in the same place — one
 * `word-atlas:v2:word-atlas-open` record of FSRS cards — but the site kept
 * growing while this fork was frozen: it also records reading drills
 * (`progress.drills`), an exam plan (`examDate`, `targetBand`, `planAuto`) and a
 * few study options (`recall`, `route`, `routeTopic`, `illus`).
 *
 * Its importer is strict on purpose. It re-sanitises the file and demands that
 * every setting it knows about is *present* and survives unchanged, that
 * `progress.drills` exists, and that every day satisfies `correct <= reviews`.
 * A plain backup from this app therefore fails with
 * 「备份内容不完整或格式有误」 — it has no `drills`, and its settings lack the
 * seven keys the site has since added (`recall`, `route`, `routeTopic`, `illus`,
 * `examDate`, `targetBand`, `planAuto`; `repeatGap` is the one it lets you omit).
 *
 * So we write a file that passes those checks, and read one back. Nothing here
 * touches the store: every function is a pure transform, which keeps the
 * validator testable against the site's own rules.
 */
import { legacyTheme } from "../lib/theme-model";
import type { CardState } from "./srs";
import type { Progress, Settings } from "./store";

/** The site's settings defaults, copied key for key from its own bundle. */
const WEB_DEFAULTS = {
  accent: "uk",
  autoplay: true,
  repeatGap: 0,
  recall: true,
  route: "level",
  routeTopic: "",
  dailyNew: 10,
  retention: 0.9,
  theme: "starlight",
  wordFont: "sans",
  illus: "atlas",
  sfx: true,
  spell: true,
  startLevel: 0,
  onboarded: false,
  dataset: "open",
  ambience: "stars",
  ambienceVolume: 0.45,
  splash: true,
  examDate: "",
  targetBand: 6.5,
  planAuto: false,
};

type WebSettings = typeof WEB_DEFAULTS;

/**
 * The eight ambience ids the site knows. This fork ships thirty; anything it
 * does not recognise would fail the site's own sanitiser, so it travels as the
 * default bed instead of blocking the whole import.
 */
const WEB_AMBIENCE = [
  "off",
  "stars",
  "rain",
  "sea",
  "forest",
  "fire",
  "voyage",
  "cafe",
];

/* ---------- small predicates, mirroring the site's ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, lo = -Infinity, hi = Infinity) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const int = (v: unknown, lo = 0) => num(v, lo) && Number.isInteger(v);
const strList = (v: unknown) =>
  Array.isArray(v) && v.every((x) => typeof x === "string" && x.length > 0);
/** `2026-11-01` and nothing that merely parses. */
const isDayKey = (v: unknown) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;

/** Epoch milliseconds, kept inside the range the site accepts. */
const MS_MAX = 864e13;

/* ---------- writing a file the site will take ---------- */

const whole = (v: number, lo = 0) => Math.max(lo, Math.round(v));
const stamp = (v: number) => Math.min(MS_MAX, Math.max(0, Math.round(v)));

function webCard(c: CardState) {
  const reps = whole(c.reps);
  return {
    due: stamp(c.due),
    s: Math.max(0, c.s),
    d: Math.min(11, Math.max(0, c.d)),
    el: Math.max(0, c.el),
    sd: Math.max(0, c.sd),
    ls: whole(c.ls),
    reps,
    // The site insists lapses never exceed reps; FSRS keeps that true, but a
    // card written by an older build could still carry the odd pair.
    lapses: Math.min(reps, whole(c.lapses)),
    st: c.st,
    ...(c.last === undefined ? {} : { last: stamp(c.last) }),
    seen: stamp(c.seen),
  };
}

/** The `progress` half of a web backup: same data, minus what the site can't read. */
export function webProgress(p: Progress) {
  const cards: Record<string, ReturnType<typeof webCard>> = {};
  for (const [id, c] of Object.entries(p.cards)) cards[id] = webCard(c);

  const days: Record<string, { n: number; r: number; c: number; t: number }> =
    {};
  for (const [k, d] of Object.entries(p.days)) {
    const r = whole(d.r);
    days[k] = {
      n: whole(d.n),
      r,
      c: Math.min(whole(d.c), r),
      t: Math.max(0, d.t),
    };
  }

  return {
    version: 2 as const,
    datasetId: p.datasetId,
    cards,
    bookmarks: p.bookmarks
      .filter((x) => typeof x === "string" && x.length > 0)
      .slice(0, 20000),
    days,
    typing: p.typing.slice(-500).map((t) => ({
      at: t.at,
      mode: t.mode,
      items: t.items,
      wpm: t.wpm,
      accuracy: t.accuracy,
    })),
    // A half-finished quiz is device state, not progress: the site validates the
    // shape of a live session and would reject the whole file over a mismatch.
    session: null,
    mistakes: p.mistakes
      .filter((x) => typeof x === "string" && x.length > 0)
      .slice(0, 300),
    drills: {},
  };
}

/** The `settings` half: this app's choices, restated in the site's vocabulary.
 *  Android-only settings (`autoplayEx*`, `exRate*`, `blurZh`, `haptic`) are
 *  deliberately left out: the site has no such switches, and its validator only
 *  checks the keys it knows. A local backup keeps them via `sanitizeSettings`. */
export function webSettings(s: Settings) {
  return {
    accent: s.accent,
    autoplay: s.autoplay,
    // The site's options this fork does not have. Fixed values, so the file is
    // deterministic and always survives the site's sanitiser.
    recall: true,
    route: "level",
    routeTopic: "",
    illus: "atlas",
    dailyNew: Math.min(200, Math.max(1, Math.round(s.dailyNew))),
    retention: Math.min(0.97, Math.max(0.7, s.retention)),
    theme: legacyTheme(s),
    wordFont: s.wordFont,
    sfx: s.sfx,
    spell: s.spell,
    startLevel: Math.min(5, Math.max(0, Math.round(s.startLevel))),
    onboarded: true,
    dataset: s.dataset,
    ambience: WEB_AMBIENCE.includes(s.ambience) ? s.ambience : "stars",
    ambienceVolume: Math.min(1, Math.max(0, s.ambienceVolume)),
    splash: s.splash,
    examDate: "",
    targetBand: 6.5,
    planAuto: false,
  };
}

/* ---------- reading a file the site wrote ---------- */

/**
 * Settings the site understands, validated the way it validates them. Returns
 * the defaults with every good value applied, so a missing or malformed key
 * simply keeps its default rather than poisoning the import.
 */
export function sanitizeWebSettings(v: unknown): WebSettings {
  const s: WebSettings = { ...WEB_DEFAULTS };
  if (!isObj(v)) return s;
  if (v.accent === "uk" || v.accent === "us") s.accent = v.accent;
  if (typeof v.autoplay === "boolean") s.autoplay = v.autoplay;
  if (v.repeatGap === 0 || v.repeatGap === 0.5 || v.repeatGap === 1)
    s.repeatGap = v.repeatGap;
  if (typeof v.recall === "boolean") s.recall = v.recall;
  if (v.route === "level" || v.route === "topic") s.route = v.route;
  if (
    typeof v.routeTopic === "string" &&
    /^[a-z0-9_-]{0,64}$/i.test(v.routeTopic)
  )
    s.routeTopic = v.routeTopic;
  if (num(v.dailyNew, 1, 200)) s.dailyNew = Math.round(v.dailyNew as number);
  if (num(v.retention, 0.7, 0.97)) s.retention = v.retention as number;
  if (
    v.theme === "system" ||
    v.theme === "light" ||
    v.theme === "dark" ||
    v.theme === "aurora" ||
    v.theme === "starlight"
  )
    s.theme = v.theme;
  if (
    v.wordFont === "serif" ||
    v.wordFont === "sans" ||
    v.wordFont === "classic"
  )
    s.wordFont = v.wordFont;
  if (v.illus === "atlas" || v.illus === "classic") s.illus = v.illus;
  if (typeof v.sfx === "boolean") s.sfx = v.sfx;
  if (typeof v.spell === "boolean") s.spell = v.spell;
  if (num(v.startLevel, 0, 5))
    s.startLevel = Math.round(v.startLevel as number);
  if (typeof v.onboarded === "boolean") s.onboarded = v.onboarded;
  if (v.dataset === "open" || v.dataset === "private") s.dataset = v.dataset;
  if (typeof v.ambience === "string" && WEB_AMBIENCE.includes(v.ambience))
    s.ambience = v.ambience;
  if (num(v.ambienceVolume, 0, 1))
    s.ambienceVolume = v.ambienceVolume as number;
  if (typeof v.splash === "boolean") s.splash = v.splash;
  if (
    typeof v.examDate === "string" &&
    /^(\d{4}-\d{2}-\d{2})?$/.test(v.examDate)
  )
    s.examDate = v.examDate;
  if (num(v.targetBand, 5, 8.5))
    s.targetBand = Math.round((v.targetBand as number) * 2) / 2;
  if (typeof v.planAuto === "boolean") s.planAuto = v.planAuto;
  return s;
}

/* ---------- the site's import gate, restated ---------- */

/**
 * Everything the site's importer would refuse, in the order it checks it.
 *
 * Empty means the site will take the file. Used by the tests to prove that the
 * exported backup still passes after any change to cards, days or settings —
 * the site's rules are the spec, and this is the only way to keep up with them
 * from here.
 */
export function webBackupProblems(data: unknown, datasetId?: string): string[] {
  if (!isObj(data)) return ["不是 JSON 对象"];
  const out: string[] = [];
  if (data.app !== "word-atlas") out.push("app 不是 word-atlas");
  if (data.version !== 2) out.push("version 不是 2");
  if (!isObj(data.progress)) out.push("缺少 progress");
  if (!isObj(data.settings)) out.push("缺少 settings");
  if (out.length) return out;

  const p = data.progress as Record<string, unknown>;
  if (p.version !== 2) out.push("progress.version 不是 2");
  if (datasetId !== undefined && p.datasetId !== datasetId)
    out.push("datasetId 不匹配");
  if (!isObj(p.cards)) out.push("缺少 cards");
  else
    for (const [id, c] of Object.entries(p.cards)) {
      if (!isObj(c)) return [...out, `卡片 ${id} 不是对象`];
      if (!num(c.due, 0, MS_MAX)) out.push(`卡片 ${id} 的 due 无效`);
      if (!num(c.s, 0)) out.push(`卡片 ${id} 的 s 无效`);
      if (!num(c.d, 0, 11)) out.push(`卡片 ${id} 的 d 无效`);
      if (!num(c.el, 0)) out.push(`卡片 ${id} 的 el 无效`);
      if (!num(c.sd, 0)) out.push(`卡片 ${id} 的 sd 无效`);
      if (!int(c.ls)) out.push(`卡片 ${id} 的 ls 不是整数`);
      if (!int(c.reps)) out.push(`卡片 ${id} 的 reps 不是整数`);
      if (!int(c.lapses)) out.push(`卡片 ${id} 的 lapses 不是整数`);
      if (
        int(c.reps) &&
        int(c.lapses) &&
        (c.lapses as number) > (c.reps as number)
      )
        out.push(`卡片 ${id} 的 lapses 超过 reps`);
      if (![0, 1, 2, 3].includes(c.st as number))
        out.push(`卡片 ${id} 的 st 无效`);
      if (c.last !== undefined && !num(c.last, 0, MS_MAX))
        out.push(`卡片 ${id} 的 last 无效`);
      if (!num(c.seen, 0, MS_MAX)) out.push(`卡片 ${id} 的 seen 无效`);
    }
  if (!strList(p.bookmarks)) out.push("bookmarks 含空字符串或非字符串");
  else if ((p.bookmarks as string[]).length > 20000)
    out.push("bookmarks 超过 20000 条");
  if (!strList(p.mistakes)) out.push("mistakes 含空字符串或非字符串");
  else if ((p.mistakes as string[]).length > 300)
    out.push("mistakes 超过 300 条");
  if (!isObj(p.days)) out.push("缺少 days");
  else
    for (const [k, d] of Object.entries(p.days)) {
      if (!isDayKey(k)) return [...out, `days 的键 ${k} 不是日期`];
      if (
        !isObj(d) ||
        !num(d.n, 0) ||
        !num(d.r, 0) ||
        !num(d.c, 0) ||
        !num(d.t, 0)
      )
        return [...out, `days[${k}] 字段无效`];
      if ((d.c as number) > (d.r as number)) out.push(`days[${k}] 的 c 超过 r`);
    }
  if (!Array.isArray(p.typing)) out.push("缺少 typing");
  else if (p.typing.length > 500) out.push("typing 超过 500 条");
  else
    for (const t of p.typing)
      if (
        !isObj(t) ||
        !num(t.at, 0) ||
        !["word", "sentence", "dictation"].includes(t.mode as string) ||
        !num(t.items, 0) ||
        !num(t.wpm, 0, 400) ||
        !num(t.accuracy, 0, 100)
      )
        return [...out, "typing 有一条记录无效"];
  if (!isObj(p.drills)) out.push("缺少 drills（网页版 1.0 之后才有）");
  else
    for (const [k, d] of Object.entries(p.drills)) {
      if (!/^(para|conf|read):.+/.test(k))
        return [...out, `drills 的键 ${k} 无效`];
      if (!isObj(d) || !int(d.n) || !int(d.c) || !num(d.last, 0))
        return [...out, `drills[${k}] 字段无效`];
      if ((d.c as number) > (d.n as number))
        out.push(`drills[${k}] 的 c 超过 n`);
    }
  if (p.session !== null) out.push("session 未清空");

  const raw = data.settings as Record<string, unknown>;
  const clean = sanitizeWebSettings(raw);
  for (const k of Object.keys(WEB_DEFAULTS) as (keyof WebSettings)[]) {
    const has = Object.hasOwn(raw, k);
    // The site lets `repeatGap` be absent; everything else must be present and
    // must already equal what its sanitiser would make of it.
    if (!has) {
      if (k !== "repeatGap") out.push(`设置项 ${k} 缺失`);
      continue;
    }
    if (raw[k] !== clean[k]) out.push(`设置项 ${k} 无效`);
  }
  if (
    typeof raw.examDate === "string" &&
    raw.examDate &&
    !isDayKey(raw.examDate)
  )
    out.push("examDate 不是日期");
  return out;
}
