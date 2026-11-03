/**
 * M2 持久化：localStorage 兜底 + File System Access 直写 markdown。
 * 分三层：内存（React state）→ localStorage（每次判定同步写）→ md 文件（节流重写）。
 */

export type Mark = { id: string; w: string; en: string; zh: string; img: string; t: number };

export type Snapshot = {
  v: 1;
  total: number;
  cursor: number;
  cursorId: string | null;
  marks: Mark[];
  startedAt: number;
  updatedAt: number;
  closedCleanly: boolean;
};

const STATE_KEY = "wa-review-v1";

export function readState(): Snapshot | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.marks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 配额满时返回 false，调用方要能看见。 */
export function writeState(snapshot: Snapshot): boolean {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
}

/* ---------- markdown ---------- */

/** 单元格转义：竖线会打断表格，换行要变 <br>。 */
const cell = (s: string) =>
  s
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, "<br>")
    .trim();

const pad = (n: number) => String(n).padStart(2, "0");

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function renderMarkdown(marks: Mark[], startedAt: number, total: number): string {
  const lines = [
    "# 词条图片检查 · 不合适清单",
    "",
    `- 词库：word-atlas-open · ${total} 条`,
    "- 判定口径：插画与「日常例句 ex[0]」是否互相适配",
    "- 路径基准：仓库根目录",
    `- 会话开始：${formatTime(startedAt)}`,
    "",
    "| 单词 | 日常例句 | 日常例句翻译 | 图片相对路径 |",
    "| --- | --- | --- | --- |",
  ];
  for (const m of marks) {
    lines.push(`| ${cell(m.w)} | ${cell(m.en)} | ${cell(m.zh)} | ${cell(m.img)} |`);
  }
  lines.push("");
  return lines.join("\n");
}

/* ---------- File System Access ---------- */

type PermState = "granted" | "denied" | "prompt";

type WritableLike = {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
};

export type FileHandleLike = {
  name: string;
  createWritable: (opts?: { keepExistingData?: boolean }) => Promise<WritableLike>;
  queryPermission?: (d: { mode: "readwrite" }) => Promise<PermState>;
  requestPermission?: (d: { mode: "readwrite" }) => Promise<PermState>;
};

declare global {
  interface Window {
    showSaveFilePicker?: (opts?: {
      suggestedName?: string;
      types?: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<FileHandleLike>;
  }
}

export const canPickFile = () => typeof window.showSaveFilePicker === "function";

/** 用户取消返回 null——不是错误，降级为浏览器内保存即可。 */
export async function pickMarkdownFile(): Promise<FileHandleLike | null> {
  if (!window.showSaveFilePicker) return null;
  try {
    return await window.showSaveFilePicker({
      suggestedName: "review-marks.md",
      types: [{ description: "Markdown", accept: { "text/markdown": [".md"] } }],
    });
  } catch {
    return null;
  }
}

/**
 * 刷新后句柄还在，但读写权限必须由用户手势重新授予——浏览器硬性要求，
 * 所以这个函数只能在 click 里调用。
 */
export async function ensurePermission(handle: FileHandleLike): Promise<boolean> {
  try {
    if (handle.queryPermission && (await handle.queryPermission({ mode: "readwrite" })) === "granted") {
      return true;
    }
    if (!handle.requestPermission) return true;
    return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

/** 整文件覆盖写。失败返回 false，由调用方显示"保存失败"。 */
export async function writeMarkdown(handle: FileHandleLike, text: string): Promise<boolean> {
  try {
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

/* ---------- 句柄持久化（IndexedDB） ---------- */

const DB_NAME = "wa-review";
const STORE = "handles";
const HANDLE_KEY = "marks-md";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveHandle(handle: FileHandleLike): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* 存不下就算了，下次重新选 */
  }
}

export async function loadHandle(): Promise<FileHandleLike | null> {
  try {
    const db = await openDb();
    const handle = await new Promise<FileHandleLike | null>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileHandleLike) ?? null);
      req.onerror = () => resolve(null);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

/** 浏览器内保存模式下的兜底导出。 */
export function downloadMarkdown(text: string, name = "review-marks.md"): void {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
