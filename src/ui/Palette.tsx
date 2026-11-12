import { CornerDownLeft, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WordRef } from "../atlas/types";
import { useAtlas } from "../atlas/context";
import { focusField } from "../lib/keyboard";
import { registerOverlay, isShell, shell } from "../lib/native";
import { go, openWord } from "../lib/router";
import { clearRecent, dailyPicks, pushRecent, resolveRecent, subscribeRecent } from "../lib/recent";
import { isChinese, matchSense, searchAtlas } from "../lib/search";
import { Illustration } from "./Illustration";
import { toast } from "./Toast";

/** The panel previews six; the standalone page holds the full twenty. */
const PREVIEW = 6;
/** Matches `palette-in` in the stylesheet: the IME waits for the panel to land. */
const ENTER_MS = 180;

export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const atlas = useAtlas();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [recents, setRecents] = useState<WordRef[]>([]);
  const [total, setTotal] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  // `onClose` is an inline arrow in Shell; a ref keeps it out of effect deps so
  // typing does not re-run the "just opened" reset and blank the query.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const term = q.trim();
  const results = useMemo(() => (term ? searchAtlas(atlas, q, 30) : []), [atlas, q, term]);
  const picks = useMemo(() => dailyPicks(atlas, PREVIEW), [atlas, open]);
  const shown = term ? results : recents;
  const showOptions = !!term || recents.length > 0;

  // When a hit comes from a later sense (缠绕 on `wind`), show that sense, not
  // the first one — otherwise the result looks unrelated to what was typed.
  const gloss = (w: WordRef) => (isChinese(term) ? (matchSense(w, term)?.sense ?? w.zh) : w.zh);

  const refresh = useCallback(() => {
    const words = resolveRecent(atlas);
    setTotal(words.length);
    setRecents(words.slice(0, PREVIEW));
  }, [atlas]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setSel(0);
    refresh();
    // WebView only raises the IME on a real focus change; focusField handles it.
    //
    // In the APK the shell can raise the keyboard whenever it likes, so the
    // field waits for the panel to land first: the keyboard resizes the
    // WebView, which re-lays out the page and every blurred surface on it, and
    // doing that halfway through the entrance is what made search feel jumpy.
    // A browser has no such bridge and has to focus inside the tap gesture or
    // no keyboard appears at all, so the web build keeps the next-frame focus.
    const raf = isShell ? 0 : requestAnimationFrame(() => focusField(input.current));
    const timer = isShell ? window.setTimeout(() => focusField(input.current), ENTER_MS) : 0;
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [open, refresh]);

  // Claim the hardware back key before the router sees it.
  useEffect(() => {
    if (!open) return;
    return registerOverlay(() => {
      closeRef.current();
      return true;
    });
  }, [open]);

  // Put the keyboard down with the panel instead of waiting for the field to
  // lose focus on unmount: Android keeps the IME up for a beat after that,
  // while the tab bar behind the palette is waiting to come back.
  useEffect(() => {
    if (!open) return;
    return () => shell?.hideKeyboard?.();
  }, [open]);

  // Clearing on the history page, or a write in another tab, updates the panel.
  useEffect(() => {
    if (!open) return;
    return subscribeRecent(refresh);
  }, [open, refresh]);

  useEffect(() => setSel(0), [q]);
  if (!open) return null;

  const pick = (w: WordRef) => {
    pushRecent(w.id);
    closeRef.current();
    openWord(w.id);
  };
  const clear = () => {
    if (!confirm("清空全部查词历史？此操作无法撤销。")) return;
    clearRecent();
    toast("查词历史已清空", "ok");
    refresh();
  };
  const viewAll = () => {
    closeRef.current();
    go({ page: "history" });
  };

  return (
    <div className="palette-root" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="搜索单词">
        <div className="palette-input">
          <Search size={20} />
          <input
            ref={input}
            value={q}
            placeholder="搜索单词或中文释义"
            aria-label="搜索单词"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeRef.current();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(shown.length - 1, s + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              }
              if (e.key === "Enter" && shown[sel]) pick(shown[sel]);
            }}
            aria-controls="palette-list"
            aria-activedescendant={showOptions && shown[sel] ? `pal-${shown[sel].id}` : undefined}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          <kbd>Esc</kbd>
          <button type="button" className="palette-cancel" onClick={() => closeRef.current()}>
            取消
          </button>
        </div>

        {!term && (
          <div className="palette-section">
            <span>{recents.length ? "最近查过" : "试试这些词"}</span>
            {recents.length > 0 && (
              <span className="palette-section-actions">
                <button type="button" className="palette-clear" onClick={clear}>
                  清空
                </button>
                <button type="button" className="palette-more" onClick={viewAll}>
                  查看全部 {total} 条 →
                </button>
              </span>
            )}
          </div>
        )}

        <ul id="palette-list" className="palette-list" role={showOptions ? "listbox" : undefined}>
          {showOptions
            ? shown.map((w, i) => (
                <li
                  key={w.id}
                  id={`pal-${w.id}`}
                  role="option"
                  aria-selected={i === sel}
                  className={i === sel ? "is-sel" : ""}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => pick(w)}
                >
                  <Illustration src={atlas.img(w, "thumb")} word={w.word} topic={w.topic} className="palette-thumb" />
                  <span className="palette-word" lang="en">
                    {w.word}
                  </span>
                  <span className="palette-zh">{gloss(w)}</span>
                  {i === sel && <CornerDownLeft size={15} className="palette-enter" />}
                </li>
              ))
            : !term && (
                <li className="palette-try">
                  {picks.map((w) => (
                    <button key={w.id} type="button" className="chip-btn" onClick={() => pick(w)} lang="en">
                      {w.word}
                    </button>
                  ))}
                </li>
              )}
          {term && !results.length && <li className="palette-empty">没有找到“{q}”。换个拼写，或试试中文释义。</li>}
        </ul>

        <div className="palette-keys">
          <span>{atlas.count.toLocaleString()} 个词条 · 支持英文前缀与全部中文义项搜索</span>
          <span className="palette-keys-kbd">
            <kbd>↑</kbd>
            <kbd>↓</kbd> 选择 <kbd>↵</kbd> 打开 <kbd>Esc</kbd> 关闭
          </span>
        </div>
      </div>
    </div>
  );
}
