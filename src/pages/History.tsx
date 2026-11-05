import { ChevronLeft, ChevronRight, RotateCcw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { WordRef } from "../atlas/types";
import { useAtlas } from "../atlas/context";
import { openPalette } from "../lib/palette";
import { clearRecent, pushRecent, RECENT_CAP, resolveRecent, subscribeRecent } from "../lib/recent";
import { go, openWord } from "../lib/router";
import { Illustration } from "../ui/Illustration";
import { toast } from "../ui/Toast";

/**
 * The full lookup history. Deliberately flat and undated: order is recency,
 * and nothing here is part of a backup or a learning record.
 */
export function HistoryPage() {
  const atlas = useAtlas();
  const [words, setWords] = useState<WordRef[]>(() => resolveRecent(atlas));

  useEffect(() => {
    const refresh = () => setWords(resolveRecent(atlas));
    refresh();
    return subscribeRecent(refresh);
  }, [atlas]);

  const clear = () => {
    if (!words.length) return;
    if (!confirm("清空全部查词历史？此操作无法撤销。")) return;
    clearRecent();
    toast("查词历史已清空", "ok");
  };

  const open = (w: WordRef) => {
    // Re-opening an older word makes it the most recent one again.
    pushRecent(w.id);
    openWord(w.id);
  };

  return (
    <div className="page history">
      <header className="history-head">
        <button type="button" className="icon-btn history-back" onClick={() => go({ page: "me" }, null, true)} aria-label="返回我的">
          <ChevronLeft size={22} />
        </button>
        <div className="history-title">
          <p className="eyebrow">查词记录</p>
          <h1 className="display">最近查过</h1>
        </div>
        <button type="button" className="btn btn-ghost btn-danger history-clear" onClick={clear} disabled={!words.length}>
          <RotateCcw size={16} /> 清空
        </button>
      </header>

      <p className="history-note">
        最多 {RECENT_CAP} 条 · 只存这台设备，不随备份迁移{words.length ? ` · 当前 ${words.length} 条` : ""}
      </p>

      {words.length === 0 ? (
        <div className="empty">
          <img src={`${import.meta.env.BASE_URL}brand/empty.webp`} alt="" />
          <p>还没有查过词。搜一个词，它就会出现在这里。</p>
          <button type="button" className="btn btn-primary" onClick={openPalette}>
            <Search size={18} /> 去搜索
          </button>
        </div>
      ) : (
        <ol className="history-list">
          {words.map((w, i) => (
            <li key={w.id}>
              <button type="button" className="history-row" onClick={() => open(w)}>
                <span className="history-no">{String(i + 1).padStart(2, "0")}</span>
                <Illustration src={atlas.img(w, "thumb")} word={w.word} topic={w.topic} className="history-thumb" />
                <span className="history-text">
                  <b lang="en">{w.word}</b>
                  <small>{w.zh}</small>
                </span>
                <span className={`history-lv lv-${atlas.cefr[w.cefr]}`}>{atlas.cefr[w.cefr]}</span>
                <ChevronRight size={17} className="history-arrow" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
