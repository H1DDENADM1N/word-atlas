import { Grid3x3, List, Search, Sparkles, X } from "lucide-react";
import { Galaxy, useGalaxyLayout } from "../galaxy/Galaxy";
import { topicProgress } from "../galaxy/constellation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAtlas } from "../atlas/context";
import type { WordRef } from "../atlas/types";
import { morphFrom } from "../lib/motion";
import { go, openWord, type Route } from "../lib/router";
import { pushRecent } from "../lib/recent";
import { isMastered } from "../store/srs";
import { useStore } from "../store/store";
import { Illustration } from "../ui/Illustration";
import { isChinese, matchSense, searchAtlas } from "../lib/search";
import { Speak } from "../ui/Speak";
import { TopicConstellations } from "../ui/TopicConstellations";

type Status = "all" | "new" | "learning" | "mastered" | "saved";
const STATUS: [Status, string][] = [
  ["all", "全部"],
  ["new", "未学"],
  ["learning", "学习中"],
  ["mastered", "较熟悉"],
  ["saved", "收藏"],
];

/** Level names as the atlas chips show them. */
const LEVEL_NAME: Record<string, string> = {
  A1: "入门",
  A2: "基础",
  B1: "进阶",
  B2: "中高级",
  C1: "高级",
  C2: "熟练",
};

type View = "grid" | "list" | "galaxy";
function readView(): View {
  try {
    const v = localStorage.getItem("word-atlas:view");
    return v === "list" || v === "galaxy" ? v : "grid";
  } catch {
    return "grid";
  }
}

/**
 * The view a visit opens in. A link that names one wins — 今日's topic tiles
 * hand over `list`, where a topic reads as a column of headwords instead of a
 * wall of pictures — and everything else opens in whatever the reader chose
 * last time.
 */
function initialView(route: Extract<Route, { page: "atlas" }>): View {
  if (route.view === "grid" || route.view === "list" || route.view === "galaxy") return route.view;
  return readView();
}

/** Only a tap on the view switch becomes the default for the next visit. */
function rememberView(v: View) {
  try {
    localStorage.setItem("word-atlas:view", v);
  } catch {
    /* optional */
  }
}

/** Smooth slide, unless the reader asked the system to keep things still. */
function slideTo(row: HTMLElement, left: number) {
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  row.scrollTo({ left, behavior: still ? "auto" : "smooth" });
}

export function AtlasPage({
  route,
}: {
  route: Extract<Route, { page: "atlas" }>;
}) {
  const atlas = useAtlas();
  const cards = useStore((s) => s.progress.cards);
  const bookmarks = useStore((s) => s.progress.bookmarks);
  const [q, setQ] = useState(route.q ?? "");
  const [status, setStatus] = useState<Status>("all");
  const [view, setViewState] = useState<View>(() => initialView(route));
  // Follow the URL when a link switches views while this page is already open.
  useEffect(() => {
    if (route.view === "grid" || route.view === "list" || route.view === "galaxy") setViewState(route.view);
  }, [route.view]);

  /**
   * A word handed over from another app (PROCESS_TEXT / SEND) arrives as a raw
   * query in the URL. Record the best match in "最近查过" so the user can
   * reopen it later, exactly like any other lookup — and when the query is an
   * exact English spelling, open the card straight away so choosing 词光 in a
   * translate menu behaves like a dictionary, not just a search box.
   *
   * Keyed on `route.q`, not the input state: typing in the search box must not
   * keep moving fresh words to the top of the history, and the ref makes sure
   * one hand-off is recorded once even if the effect re-runs.
   */
  const externalHandled = useRef<string | null>(null);
  useEffect(() => {
    const query = route.q?.trim();
    if (!query || route.waSource !== "external") return;
    if (externalHandled.current === query) return;
    externalHandled.current = query;
    const match = searchAtlas(atlas, query, 1)[0];
    if (!match) return;
    pushRecent(match.id);
    if (match.word.toLowerCase() === query.toLowerCase()) openWord(match.id);
  }, [atlas, route.q, route.waSource]);
  const setView = (v: View) => {
    setViewState(v);
    rememberView(v);
    go(
      {
        page: "atlas",
        topic: route.topic,
        level: route.level,
        view: v === "grid" ? undefined : v,
      },
      null,
      true,
    );
  };
  const topic = route.topic;
  const level = route.level;

  const list = useMemo(() => {
    const saved = new Set(bookmarks);
    const ti = topic ? atlas.topics.findIndex((t) => t[0] === topic) : -1;
    const li = level ? atlas.cefr.indexOf(level) : -1;
    const base = q.trim() ? searchAtlas(atlas, q, 5000) : atlas.words;
    return base.filter((w) => {
      if (ti >= 0 && w.topic !== ti) return false;
      if (li >= 0 && w.cefr !== li) return false;
      const c = cards[w.id];
      if (status === "new") return !c;
      if (status === "learning") return !!c && !isMastered(c);
      if (status === "mastered") return isMastered(c);
      if (status === "saved") return saved.has(w.id);
      return true;
    });
  }, [atlas, q, topic, level, status, cards, bookmarks]);

  const setFilter = (patch: Partial<Extract<Route, { page: "atlas" }>>) =>
    go({ page: "atlas", topic, level, view: route.view, ...patch }, null, true);

  const topicRow = useRef<HTMLDivElement>(null);
  const levelRow = useRef<HTMLDivElement>(null);
  // Nineteen chips never fit on a phone, and 今日's tiles link straight to any
  // of them. Slide the row until the active chip sits in the middle; when the
  // reader can already see it, leave the row alone so a tap does not shift the
  // chips under the finger. Measure on the next frame — the page transition
  // mounts this page before the row has taken its final width.
  //
  // The six level chips are short enough to fit at 100% zoom, but not once the
  // interface scale is turned up or on a 320 px phone, and 今日's learning path
  // hands over a level the same way the topic tiles hand over a topic.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const pick = (row: HTMLDivElement | null, key: "topic" | "level", value?: string) => {
        if (!row || !value) return undefined;
        return Array.from(row.querySelectorAll<HTMLElement>(`[data-${key}]`)).find(
          (el) => el.dataset[key] === value,
        );
      };
      const centre = (row: HTMLDivElement | null, chip: HTMLElement | undefined) => {
        if (!row) return;
        // "全部…" is the first chip, so "nothing selected" means the row starts at 0.
        if (!chip) {
          if (row.scrollLeft > 0) slideTo(row, 0);
          return;
        }
        const box = row.getBoundingClientRect();
        const chipBox = chip.getBoundingClientRect();
        // A chip at the very edge counts as hidden: centre it rather than leave
        // it half behind the mask.
        if (chipBox.left >= box.left + 12 && chipBox.right <= box.right - 12) return;
        const far = Math.max(0, row.scrollWidth - row.clientWidth);
        const left = row.scrollLeft + chipBox.left - box.left - (row.clientWidth - chipBox.width) / 2;
        slideTo(row, Math.max(0, Math.min(left, far)));
      };
      centre(levelRow.current, pick(levelRow.current, "level", level));
      centre(topicRow.current, pick(topicRow.current, "topic", topic));
    });
    return () => cancelAnimationFrame(raf);
  }, [topic, level, view]);

  // Nineteen constellations. The geometry comes from the layout (it depends on
  // where the stars are), the progress from the card store — so a word learned
  // anywhere in the app redraws the panel without rebuilding the sky.
  const layout = useGalaxyLayout();
  const constellations = useMemo(() => topicProgress(atlas, layout.figures, cards), [atlas, layout, cards]);
  const litCount = useMemo(() => constellations.filter((c) => c.lit).length, [constellations]);
  const [focusTopic, setFocusTopic] = useState<number | null>(null);
  // On a phone the panel sits under the star map, so a tap has to bring the
  // map back into view — otherwise the camera flies somewhere off screen.
  const pickTopic = (i: number | null) => {
    setFocusTopic(i);
    if (i !== null && window.matchMedia("(max-width: 999px)").matches) {
      document.querySelector(".constellation-workspace .galaxy-full")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div className={`page atlas ${view === "galaxy" ? "is-galaxy" : ""}`}>
      <header className="atlas-head">
        <div>
          <p className="eyebrow">图鉴 · {atlas.count.toLocaleString()} 词</p>
          <h1 className="display">
            看图学词，
            <br className="br-sm" />
            在语境中理解。
          </h1>
          <p className="lede">
            {atlas.examples.toLocaleString()} 条原创例句 · 英美发音 · 按难度和 {atlas.topics.length} 个雅思话题整理
          </p>
        </div>
        <label className="search">
          <Search size={19} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索单词或中文释义"
            spellCheck={false}
            autoComplete="off"
          />
          {q && (
            <button
              className="icon-btn"
              onClick={() => setQ("")}
              aria-label="清空搜索"
            >
              <X size={16} />
            </button>
          )}
        </label>
      </header>

      <div className="filters">
        {view !== "galaxy" && (
          <>
            <div className="chips chips-scroll" role="group" aria-label="难度" ref={levelRow}>
              <button
                className={`chip-btn ${!level ? "is-on" : ""}`}
                onClick={() => setFilter({ level: undefined })}
                aria-pressed={!level}
              >
                全部难度
              </button>
              {atlas.cefr.map((l) => (
                <button
                  key={l}
                  className={`chip-btn lv lv-${l} ${level === l ? "is-on" : ""}`}
                  data-level={l}
                  onClick={() =>
                    setFilter({ level: level === l ? undefined : l })
                  }
                  aria-pressed={level === l}
                >
                  {LEVEL_NAME[l] ? `${LEVEL_NAME[l]} ${l}` : l}
                </button>
              ))}
            </div>
            <div className="chips chips-scroll" role="group" aria-label="话题" ref={topicRow}>
              <button
                className={`chip-btn ${!topic ? "is-on" : ""}`}
                onClick={() => setFilter({ topic: undefined })}
                aria-pressed={!topic}
              >
                全部话题
              </button>
              {atlas.topics.map(([k, name]) => (
                <button
                  key={k}
                  className={`chip-btn ${topic === k ? "is-on" : ""}`}
                  data-topic={k}
                  onClick={() =>
                    setFilter({ topic: topic === k ? undefined : k })
                  }
                  aria-pressed={topic === k}
                >
                  {name}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="filters-row">
          {view !== "galaxy" && (
            <div className="segmented" role="group" aria-label="学习状态">
              {STATUS.map(([k, label]) => (
                <button
                  key={k}
                  className={status === k ? "is-on" : ""}
                  onClick={() => setStatus(k)}
                  aria-pressed={status === k}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <span className="result-count">
            {view === "galaxy"
              ? "搜索单词，在星图中定位"
              : `${list.length.toLocaleString()} 个结果`}
          </span>
          <div
            className="segmented segmented-icons"
            role="group"
            aria-label="视图"
          >
            <button
              className={view === "grid" ? "is-on" : ""}
              onClick={() => setView("grid")}
              aria-label="图片视图"
              aria-pressed={view === "grid"}
            >
              <Grid3x3 size={17} />
            </button>
            <button
              className={view === "list" ? "is-on" : ""}
              onClick={() => setView("list")}
              aria-label="列表视图"
              aria-pressed={view === "list"}
            >
              <List size={17} />
            </button>
            <button
              className={view === "galaxy" ? "is-on" : ""}
              onClick={() => setView("galaxy")}
              aria-label="星图视图"
              aria-pressed={view === "galaxy"}
            >
              <Sparkles size={17} />
            </button>
          </div>
        </div>
      </div>

      {view === "galaxy" ? (
        <div className="constellation-workspace">
          <Galaxy
            mode="full"
            focus={q.trim() ? list[0]?.id : null}
            focusTopic={focusTopic}
            constellationStat={{ lit: litCount, total: constellations.length }}
          />
          <TopicConstellations items={constellations} selected={focusTopic} onPick={pickTopic} />
        </div>
      ) : list.length === 0 ? (
        <div className="empty">
          <img src={`${import.meta.env.BASE_URL}brand/empty.webp`} alt="" />
          <p>没有找到符合条件的词，试试其他关键词或筛选条件。</p>
        </div>
      ) : view === "grid" ? (
        <VirtualGrid items={list} cards={cards} query={q} />
      ) : (
        <VirtualList items={list} cards={cards} query={q} />
      )}
    </div>
  );
}

function useWindowRange(
  container: React.RefObject<HTMLDivElement | null>,
  rowHeight: number,
  rows: number,
  overscan = 4,
) {
  const [range, setRange] = useState<[number, number]>([0, 12]);
  useLayoutEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = container.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const first = Math.max(0, Math.floor(-top / rowHeight) - overscan);
      const last = Math.min(
        rows,
        Math.ceil((window.innerHeight - top) / rowHeight) + overscan,
      );
      setRange((r) => (r[0] === first && r[1] === last ? r : [first, last]));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      cancelAnimationFrame(raf);
    };
  }, [container, rowHeight, rows, overscan]);
  return range;
}

function useWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** The gloss under a headword: whichever sense the Chinese query hit, else the first. */
function glossFor(w: WordRef, query: string) {
  const term = query.trim();
  return term && isChinese(term) ? (matchSense(w, term)?.sense ?? w.zh) : w.zh;
}

function VirtualGrid({
  items,
  cards,
  query,
}: {
  items: WordRef[];
  cards: Record<string, { s: number; st: number }>;
  query: string;
}) {
  const atlas = useAtlas();
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const gap = width < 560 ? 10 : 16;
  const cols = Math.max(
    2,
    Math.floor((width + gap) / ((width < 560 ? 150 : 188) + gap)),
  );
  const cell = (width - gap * (cols - 1)) / cols;
  const rowH = cell + (width < 560 ? 62 : 74) + gap;
  const rows = Math.ceil(items.length / cols);
  const [a, b] = useWindowRange(box, rowH, rows);
  const visible: React.ReactNode[] = [];
  if (width > 0)
    for (let r = a; r < b; r++)
      for (let c = 0; c < cols; c++) {
        const w = items[r * cols + c];
        if (!w) break;
        const card = cards[w.id];
        const st = card
          ? card.st === 2 && card.s >= 21
            ? "is-mastered"
            : "is-learning"
          : "";
        visible.push(
          <button
            key={w.id}
            className={`tile ${st}`}
            style={{
              transform: `translate(${c * (cell + gap)}px, ${r * rowH}px)`,
              width: cell,
              height: rowH - gap,
            }}
            onClick={(e) =>
              morphFrom(e.currentTarget.querySelector<HTMLElement>(".illo"), () => {
                // Only a word found through the atlas search field is a "lookup";
                // browsing the unfiltered grid does not fill the history.
                if (query.trim()) pushRecent(w.id);
                openWord(w.id);
              })
            }
          >
            <Illustration
              src={atlas.img(w, "thumb")}
              word={w.word}
              topic={w.topic}
            />
            <span className="tile-no">
              词汇 {String(w.order + 1).padStart(4, "0")}
            </span>
            <span className="tile-text">
              <span className="tile-word" lang="en">
                {w.word}
              </span>
              <span className={`tile-lv lv-${atlas.cefr[w.cefr]}`}>
                {atlas.cefr[w.cefr]}
              </span>
              <span className="tile-zh">{glossFor(w, query)}</span>
            </span>
          </button>,
        );
      }
  return (
    <div ref={box} className="vgrid" style={{ height: rows * rowH }}>
      {visible}
    </div>
  );
}

function VirtualList({
  items,
  cards,
  query,
}: {
  items: WordRef[];
  cards: Record<string, { s: number; st: number }>;
  query: string;
}) {
  const atlas = useAtlas();
  const accent = useStore((s) => s.settings.accent);
  const box = useRef<HTMLDivElement>(null);
  const rowH = 68;
  const [a, b] = useWindowRange(box, rowH, items.length, 8);
  return (
    <div ref={box} className="vlist" style={{ height: items.length * rowH }}>
      {items.slice(a, b).map((w, i) => {
        const card = cards[w.id];
        const pick = () => {
          if (query.trim()) pushRecent(w.id);
          openWord(w.id);
        };
        return (
          <div
            key={w.id}
            className="row"
            style={{ transform: `translateY(${(a + i) * rowH}px)` }}
            onClick={pick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && pick()}
          >
            <Illustration
              src={atlas.img(w, "thumb")}
              word={w.word}
              topic={w.topic}
              className="row-art"
            />
            <span className="row-word" lang="en">
              {w.word}
            </span>
            <span className="row-ipa ipa">{w.ipa}</span>
            <span className="row-zh">{glossFor(w, query)}</span>
            <span
              className={`row-dot ${card ? (card.st === 2 && card.s >= 21 ? "is-mastered" : "is-learning") : ""}`}
            />
            <Speak
              url={atlas.audio(w, accent)}
              text={w.word}
              accent={accent}
              size="sm"
            />
          </div>
        );
      })}
    </div>
  );
}
