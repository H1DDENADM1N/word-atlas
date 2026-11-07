import assert from "node:assert/strict";
import { test } from "node:test";
import type { Progress, Settings } from "./store";
import { defaultSettings, emptyProgress, importAnyBackup } from "./store";
import { webBackupProblems, webProgress, webSettings } from "./web-backup";

const card = {
  due: 1_760_000_000_000,
  s: 12.5,
  d: 5.2,
  el: 3,
  sd: 7,
  ls: 0,
  reps: 4,
  lapses: 1,
  st: 2 as const,
  last: 1_759_000_000_000,
  seen: 1_700_000_000_000,
};

const progress = (): Progress => ({
  ...emptyProgress("word-atlas-open"),
  cards: { "star-1": card },
  bookmarks: ["star-1"],
  days: {
    "2026-10-31": { n: 2, r: 3, c: 3, t: 210 },
    "2026-11-01": { n: 1, r: 2, c: 1, t: 90 },
  },
  typing: [
    { at: 1_759_000_000_000, mode: "word", items: 12, wpm: 44, accuracy: 97 },
  ],
  mistakes: ["star-2"],
});

const envelope = (p: Progress, s: unknown) => ({
  app: "word-atlas",
  version: 2,
  exported: "2026-11-01T00:00:00.000Z",
  progress: p,
  settings: s,
});

test("the web export passes the site's import gate", () => {
  const file = envelope(webProgress(progress()), webSettings(defaultSettings));
  assert.deepEqual(webBackupProblems(file, "word-atlas-open"), []);
});

test("the plain export is what the site rejects, and why", () => {
  // This is the file the app shipped before: same data, none of the site's keys.
  const file = envelope(
    { ...progress(), session: null } as unknown as Progress,
    defaultSettings,
  );
  const problems = webBackupProblems(file, "word-atlas-open");
  assert.ok(
    problems.includes("缺少 drills（网页版 1.0 之后才有）"),
    problems.join("；"),
  );
  assert.ok(problems.includes("设置项 examDate 缺失"), problems.join("；"));
});

const cases: Partial<Settings>[] = [
  { themeFamily: "ink", themeMode: "system" },
  { themeFamily: "ink", themeMode: "light" },
  { themeFamily: "ink", themeMode: "dark" },
  { themeFamily: "night", nightSkin: "aurora" },
  { themeFamily: "night", nightSkin: "starlight" },
  {
    themeFamily: "m3e",
    themeMode: "dark",
    m3Variant: "expressive",
    m3Accent: "#5F88A8",
  },
  { themeFamily: "m3e", themeMode: "system", m3Variant: "fruitSalad" },
  { wordFont: "serif" },
  { wordFont: "sans" },
  { wordFont: "classic" },
  { dailyNew: 5 },
  { dailyNew: 30 },
  { retention: 0.85 },
  { retention: 0.95 },
  { startLevel: 5 },
  { accent: "us" },
  { ambience: "cafe" },
  { ambience: "off" },
];

test("every theme, face and pace survives the round trip to the site", () => {
  for (const patch of cases) {
    const s = { ...defaultSettings, ...patch };
    const problems = webBackupProblems(
      envelope(webProgress(progress()), webSettings(s)),
      "word-atlas-open",
    );
    assert.deepEqual(problems, [], JSON.stringify(patch));
  }
});

test("the folded theme always stays inside the site's five values", () => {
  const ok = ["system", "light", "dark", "aurora", "starlight"];
  for (const patch of [{}, ...cases]) {
    assert.ok(
      ok.includes(webSettings({ ...defaultSettings, ...patch }).theme),
      JSON.stringify(patch),
    );
  }
});

test("a track the site has never heard of travels as the default bed", () => {
  // 30 tracks ship here, the site knows 8. Sending "rain-window" would make its
  // sanitiser fall back to "stars" — and the mismatch then fails the whole file.
  const s = webSettings({ ...defaultSettings, ambience: "rain-window" });
  assert.equal(s.ambience, "stars");
  assert.equal(
    webSettings({ ...defaultSettings, ambience: "forest" }).ambience,
    "forest",
  );
});

test("days never leave with more correct answers than reviews", () => {
  // The site refuses `c > r`; a day written by a buggy build must not poison the file.
  const p = {
    ...progress(),
    days: { "2026-10-31": { n: 0, r: 1, c: 4, t: 5 } },
  };
  const out = webProgress(p).days["2026-10-31"];
  assert.equal(out.c, 1);
  assert.deepEqual(
    webBackupProblems(
      envelope(webProgress(p), webSettings(defaultSettings)),
      "word-atlas-open",
    ),
    [],
  );
});

test("a web backup lands in this app, minus what it cannot hold", () => {
  const fromSite = {
    app: "word-atlas",
    version: 2,
    exported: "2026-11-01T00:00:00.000Z",
    progress: {
      ...webProgress(progress()),
      // Fields only the site has: drills, and the reader's books.
      drills: { "para:1": { n: 5, c: 4, last: 1_759_000_000_000 } },
      session: null,
    },
    settings: {
      ...webSettings({ ...defaultSettings, themeMode: "light" }),
      examDate: "2027-03-06",
      targetBand: 7,
    },
    books: { chapters: [] },
  };
  const r = importAnyBackup(JSON.stringify(fromSite));
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.equal(r.web, true);
  assert.equal(r.cards, 1);
  assert.equal(r.days, 2);
});

test("a native backup still restores through the same door", () => {
  const r = importAnyBackup(
    JSON.stringify(
      envelope(
        { ...progress(), session: null } as unknown as Progress,
        defaultSettings,
      ),
    ),
  );
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.equal(r.web, false);
  assert.equal(r.cards, 1);
});

test("a backup from another atlas is refused before anything changes", () => {
  const r = importAnyBackup(
    JSON.stringify(
      envelope(
        { ...webProgress(progress()), datasetId: "word-atlas-private" },
        webSettings(defaultSettings),
      ),
    ),
  );
  assert.equal(r.ok, false);
});
