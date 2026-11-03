import { useCallback, useEffect, useRef, useState } from "react";
import { splitHighlight } from "../../src/lib/text";
import {
  audioUrl,
  getEntry,
  imageRelPath,
  imageUrl,
  loadChunk,
  loadQueue,
  type Entry,
  type Queue,
} from "./data";
import {
  canPickFile,
  clearState,
  downloadMarkdown,
  ensurePermission,
  loadHandle,
  pickMarkdownFile,
  readState,
  renderMarkdown,
  saveHandle,
  writeMarkdown,
  writeState,
  type FileHandleLike,
  type Mark,
} from "./persist";

type Phase = "boot" | "idle" | "loading" | "deciding";
type SaveState = "idle" | "writing" | "saved" | "error" | "memory";

/**
 * 在中文译文里找词条对应的译法。
 * 先按义项精确匹配；译文常换说法（「星期四」写成「周四」），
 * 再退回最长公共子串，但至少两个字，否则宁可不标。
 */
function splitZh(zh: string, senses: { zh: string }[]): [string, string, string] | null {
  const cands = Array.from(
    new Set(
      senses
        .flatMap((s) => s.zh.split(/[；;，,、/]/))
        .map((x) => x.trim())
        .filter((x) => x.length >= 2),
    ),
  ).sort((a, b) => b.length - a.length);

  for (const c of cands) {
    const at = zh.indexOf(c);
    if (at >= 0) return [zh.slice(0, at), c, zh.slice(at + c.length)];
  }

  let best = "";
  for (const c of cands) {
    for (let i = 0; i + 2 <= c.length; i++) {
      for (let j = c.length; j - i > best.length; j--) {
        const sub = c.slice(i, j);
        if (zh.includes(sub)) {
          best = sub;
          break;
        }
      }
    }
  }
  if (!best) return null;
  const at = zh.indexOf(best);
  return [zh.slice(0, at), best, zh.slice(at + best.length)];
}

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} 小时前`;
  return `${Math.round(diff / 86_400_000)} 天前`;
}

export default function App() {
  const [boot] = useState(readState);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [cursor, setCursor] = useState(0);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [phase, setPhase] = useState<Phase>("boot");
  const [marks, setMarks] = useState<Mark[]>([]);
  const [flash, setFlash] = useState<"ok" | "no" | null>(null);
  const [started, setStarted] = useState(false);
  const [focused, setFocused] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [resume, setResume] = useState<{ cursor: number; marks: number; at: number; clean: boolean } | null>(
    null,
  );

  const toastTimer = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
  const preloadImageRef = useRef<HTMLImageElement | null>(null);
  const lockRef = useRef(false);
  const reqRef = useRef(0);
  const handleRef = useRef<FileHandleLike | null>(null);
  const startedAtRef = useRef(Date.now());
  const queueRef = useRef<Queue | null>(null);
  const liveRef = useRef<{ cursor: number; marks: Mark[]; total: number }>({ cursor: 0, marks: [], total: 0 });
  const startedRef = useRef(false);

  useEffect(() => {
    loadQueue()
      .then((q) => {
        queueRef.current = q;
        setQueue(q);
        if (!boot) return;
        // 按 id 定位：词库若变过，下标会漂，id 不会。
        const found = boot.cursorId ? q.words.findIndex((w) => w[0] === boot.cursorId) : -1;
        const at = found >= 0 ? found : Math.min(boot.cursor, q.words.length - 1);
        setCursor(at);
        setMarks(boot.marks);
        startedAtRef.current = boot.startedAt || Date.now();
        setResume({ cursor: at, marks: boot.marks.length, at: boot.updatedAt, clean: boot.closedCleanly });
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));

    // 句柄要先拿到，begin() 里才能第一时间申请权限（必须贴着用户手势）
    void loadHandle().then((h) => {
      if (!h) return;
      handleRef.current = h;
      setFileName(h.name);
    });
  }, [boot]);

  const total = queue?.words.length ?? 0;

  useEffect(() => {
    if (!queue) return;
    if (cursor >= queue.words.length) {
      setEntry(null);
      setPhase("idle");
      return;
    }
    const token = ++reqRef.current;
    setPhase("loading");
    getEntry(queue, cursor)
      .then((next) => {
        if (token !== reqRef.current) return;
        setEntry(next);
        setPhase("idle");
      })
      .catch((err: unknown) => {
        if (token !== reqRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    // 临近块尾时预取下一块，切条不落在网络等待上。
    if (cursor % queue.chunk >= queue.chunk - 10) {
      void loadChunk(Math.floor(cursor / queue.chunk) + 1).catch(() => undefined);
    }
  }, [queue, cursor]);

  // 换条即播。只依赖 entry，避免判定态变化把同一句重播。
  useEffect(() => {
    if (!started || !entry) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = audioUrl(entry.id);
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, [entry, started]);

  // 预取下一张图与下一条音频。音频用池化的第二个 <audio>，
  // 不要每条 new Audio()——一场七千多条会堆出七千个媒体元素。
  useEffect(() => {
    if (!queue || cursor + 1 >= queue.words.length) return;
    const nextId = queue.words[cursor + 1][0];
    const img = new Image();
    img.src = imageUrl(nextId);
    preloadImageRef.current = img;
    const audio = preloadAudioRef.current;
    if (audio) audio.src = audioUrl(nextId);
  }, [queue, cursor]);

  const decide = useCallback(
    (kind: "j" | "f") => {
      if (phase !== "idle" || !entry || lockRef.current) return;
      lockRef.current = true;
      setPhase("deciding");
      setFlash(kind === "j" ? "ok" : "no");
      if (kind === "f") {
        const id = entry.id;
        const ex = entry.ex[0];
        setMarks((prev) => [
          ...prev.filter((m) => m.id !== id),
          {
            id,
            w: entry.w,
            en: ex?.en ?? "",
            zh: ex?.zh ?? "",
            img: imageRelPath(id),
            t: Date.now(),
          },
        ]);
      }
      // 120ms 视觉确认，再进下一条——闪太快人会怀疑没记上。
      window.setTimeout(() => {
        lockRef.current = false;
        setFlash(null);
        setPhase("loading");
        setCursor((c) => c + 1);
      }, 120);
    },
    [phase, entry],
  );

  /** 空操作也要出声，否则用户会以为快捷键坏了。 */
  const say = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1600);
  }, []);

  const replay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !started) return;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, [started]);

  const back = useCallback(() => {
    if (!queue) return;
    if (cursor === 0) {
      say("已经是第一条");
      return;
    }
    // 回退即撤销：退回去的那条若已标记，判定一并撤掉。
    const target = cursor - 1;
    const id = queue.words[target][0];
    setMarks((prev) => prev.filter((m) => m.id !== id));
    setCursor(target);
  }, [queue, cursor, say]);

  /** 开始前先落定保存位置；拿不到就降级为浏览器内保存。 */
  const begin = useCallback(
    async (restart = false) => {
      if (restart) {
        clearState();
        setMarks([]);
        setCursor(0);
        setResume(null);
        startedAtRef.current = Date.now();
      }
      // 重新开始不沿用旧句柄：否则一上来就把上一份清单覆盖成空表。
      let handle = restart ? null : handleRef.current;
      if (handle) {
        const ok = await ensurePermission(handle);
        if (!ok) handle = null;
      }
      if (!handle && canPickFile()) {
        const picked = await pickMarkdownFile();
        if (picked) {
          await saveHandle(picked);
          handle = picked;
          setFileName(picked.name);
        }
      }
      handleRef.current = handle;
      setSave(handle ? "writing" : "memory");
      setStarted(true);
      if (!handle) say("未连接文件，先存在浏览器里，可随时导出");
    },
    [say],
  );

  useEffect(() => {
    startedRef.current = started;
  }, [started]);

  useEffect(() => {
    liveRef.current = { cursor, marks, total };
  }, [cursor, marks, total]);

  // L2：每次判定/移动同步落 localStorage，进程被杀也能恢复。
  useEffect(() => {
    if (!started || !queue) return;
    const ok = writeState({
      v: 1,
      total: queue.words.length,
      cursor,
      cursorId: queue.words[cursor]?.[0] ?? null,
      marks,
      startedAt: startedAtRef.current,
      updatedAt: Date.now(),
      closedCleanly: false,
    });
    if (!ok) setSave("error");
  }, [started, queue, cursor, marks]);

  // L3：整文件重写，200ms 合并写。
  useEffect(() => {
    if (!started || !queue) return;
    const handle = handleRef.current;
    if (!handle) {
      setSave("memory");
      return;
    }
    setSave("writing");
    const timer = window.setTimeout(() => {
      void writeMarkdown(handle, renderMarkdown(marks, startedAtRef.current, queue.words.length)).then(
        (ok) => setSave(ok ? "saved" : "error"),
      );
    }, 200);
    return () => window.clearTimeout(timer);
  }, [started, queue, marks]);

  // 正常离开时补一次写盘并标记"干净退出"，下次就不弹恢复提示。
  useEffect(() => {
    const flush = () => {
      // 还没开始就关页面时不要写：liveRef 是空的，写下去会把已有进度抹掉。
      if (!startedRef.current) return;
      const live = liveRef.current;
      const q = queueRef.current;
      writeState({
        v: 1,
        total: live.total,
        cursor: live.cursor,
        cursorId: q?.words[live.cursor]?.[0] ?? null,
        marks: live.marks,
        startedAt: startedAtRef.current,
        updatedAt: Date.now(),
        closedCleanly: true,
      });
      const handle = handleRef.current;
      if (handle) {
        void writeMarkdown(handle, renderMarkdown(live.marks, startedAtRef.current, live.total));
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      // 同时认 e.code：非英文键盘布局下 e.key 不是字母，快捷键会失效
      const action =
        key === "j" || e.code === "KeyJ"
          ? "j"
          : key === "f" || e.code === "KeyF"
            ? "f"
            : key === "r" || e.code === "KeyR"
              ? "replay"
              : key === "backspace" || e.code === "Backspace"
                ? "back"
                : key === " " || e.code === "Space"
                  ? "replay"
                  : null;

      if (!started) {
        if (action === "j" || action === "replay" || key === "enter") {
          e.preventDefault();
          void begin();
        }
        return;
      }
      if (action === "replay" || action === "back") e.preventDefault();
      switch (action) {
        case "j":
          decide("j");
          break;
        case "f":
          decide("f");
          break;
        case "back":
          back();
          break;
        case "replay":
          replay();
          break;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [started, decide, back, replay, begin]);

  // 内嵌预览/切窗口时焦点会跑掉，快捷键看起来就像"坏了"。明确告诉用户点一下。
  useEffect(() => {
    const onBlur = () => setFocused(false);
    const onFocus = () => setFocused(true);
    const onVisible = () => setFocused(!document.hidden && document.hasFocus());
    setFocused(document.hasFocus());
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const done = !!queue && cursor >= total;
  const ex = entry?.ex[0];
  const parts = entry && ex ? splitHighlight(ex.en, entry.w) : null;
  const topicZh = queue?.topics.find((t) => t[0] === entry?.topic)?.[1] ?? entry?.topic ?? "";
  const progress = total ? Math.min(100, (cursor / total) * 100) : 0;

  const saveLabel =
    save === "saved"
      ? "已保存"
      : save === "writing"
        ? "写入中"
        : save === "error"
          ? "保存失败"
          : save === "memory"
            ? "仅浏览器"
            : "";

  if (error) {
    return (
      <div className="fatal">
        <h1>跑不起来</h1>
        <p>{error}</p>
        <p className="fatal-hint">
          确认是用 <code>npm run dev</code> 从仓库根启动，并且 <code>public/atlas/</code> 完整。
        </p>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="bar">
        <span className="brand">词光 · 图片检查</span>
        <span className="topic">{topicZh}</span>
        <span className="count">
          {Math.min(cursor + 1, total)} / {total}
        </span>
        <span className="spacer" />
        <span className="marked">已标记 {marks.length}</span>
        {started && saveLabel && (
          <span className={`save ${save}`} title={fileName ?? "尚未选择文件"}>
            <i />
            {saveLabel}
          </span>
        )}
        <div className="progress" style={{ width: `${progress}%` }} />
      </header>

      <main className="stage">
        {done ? (
          <div className="done">
            <p className="done-num">{marks.length}</p>
            <p className="done-label">条标记为不合适</p>
            <p className="done-sub">
              {fileName ? `清单已写入 ${fileName}` : "清单只在浏览器里，建议现在就导出。"}
            </p>
          </div>
        ) : (
          <>
            <div className={`frame ${flash ?? ""} ${phase === "loading" ? "is-loading" : ""}`}>
              {entry ? <img src={imageUrl(entry.id)} alt={entry.w} draggable={false} /> : null}
            </div>

            <div className="word">
              <h1>{entry?.w ?? ""}</h1>
              <span className="ipa">{entry?.uk ?? ""}</span>
              <span className="sense">{entry?.senses[0]?.zh ?? ""}</span>
            </div>

            <p className="sentence" lang="en">
              <span>
                {parts ? (
                  <>
                    {parts[0]}
                    <mark>{parts[1]}</mark>
                    {parts[2]}
                  </>
                ) : (
                  ex?.en ?? ""
                )}
              </span>
            </p>

            <p className="trans">
              {(() => {
                const zhParts = entry && ex ? splitZh(ex.zh, entry.senses) : null;
                if (!ex) return null;
                return zhParts ? (
                  <>
                    {zhParts[0]}
                    <mark>{zhParts[1]}</mark>
                    {zhParts[2]}
                  </>
                ) : (
                  ex.zh
                );
              })()}
            </p>
          </>
        )}
      </main>

      <footer className="bar foot">
        <button className="key no" type="button" onClick={() => decide("f")}>
          <span className="cap">F</span>不合适
        </button>
        <button className="key" type="button" onClick={() => decide("j")}>
          <span className="cap">J</span>合适
        </button>
        <span className="spacer" />
        {toast ? (
          <span className="toast">{toast}</span>
        ) : (
          <span className="hints">
            <button
              className="hint"
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                back();
              }}
            >
              ⌫ 回退
            </button>
            <button
              className="hint"
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                replay();
              }}
            >
              R 重听
            </button>
            {(save === "memory" || save === "error") && (
              <button
                className="hint"
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  downloadMarkdown(renderMarkdown(marks, startedAtRef.current, total));
                }}
              >
                导出 md
              </button>
            )}
          </span>
        )}
      </footer>

      <audio ref={audioRef} preload="auto" hidden />
      <audio ref={preloadAudioRef} preload="auto" hidden />

      {started && !focused && (
        <div className="focus-hint" onClick={() => window.focus()}>
          点一下页面，键盘才生效
        </div>
      )}

      {!started && (
        <div className="gate" onClick={() => void begin()}>
          <div className="gate-card" onClick={(e) => e.stopPropagation()}>
            <p className="gate-kicker">
              {resume && !resume.clean ? "上次检查未正常结束" : "词条图片检查"}
            </p>
            <h2>{resume ? (resume.clean ? "接着上次继续" : "从中断处继续") : "看图，听句，按一个键"}</h2>
            <p className="gate-sub">
              {resume
                ? `上次停在第 ${resume.cursor + 1} 条（${relTime(resume.at)}），已标记 ${resume.marks} 条。`
                : "7,298 条词条。每打开一条，自动朗读日常例句。"}
            </p>
            <div className="gate-keys">
              <span>
                <b>F</b> 不合适
              </span>
              <span>
                <b>J</b> 合适
              </span>
              <span>
                <b>⌫</b> 回退
              </span>
            </div>
            <button className="gate-btn" type="button" onClick={() => void begin()}>
              {resume ? "继续检查" : "开始检查"}
            </button>
            {resume && (
              <button className="gate-link" type="button" onClick={() => void begin(true)}>
                重新开始（清空标记）
              </button>
            )}
            <p className="gate-note">
              {canPickFile()
                ? "会先让你选一个 md 文件位置，之后每条判定都直接写进去。"
                : "当前浏览器不支持直写文件：将只在浏览器内保存，可随时导出 md。"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
