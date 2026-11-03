/** 检查器的数据层：词库队列 + 分块词条，只读，不写回词库。 */

export type WordRow = [string, string, string, string, number, number, number];

export type Entry = {
  id: string;
  w: string;
  uk: string;
  us: string;
  senses: { pos: string; zh: string; en: string }[];
  ex: { en: string; zh: string }[];
  cefr: string;
  topic: string;
  m: number;
};

export type Queue = {
  words: WordRow[];
  topics: [string, string][];
  chunk: number;
};

/** 站点根相对路径。review/ 只在 dev 下用，不跟随 ATLAS_BASE。 */
const ROOT = "/atlas";

let queuePromise: Promise<Queue> | null = null;

export function loadQueue(): Promise<Queue> {
  if (!queuePromise) {
    queuePromise = fetch(`${ROOT}/index.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`索引加载失败（${res.status}）`);
        return res.json() as Promise<{
          words: WordRow[];
          topics: [string, string][];
          chunk: number;
        }>;
      })
      .then((idx) => ({ words: idx.words, topics: idx.topics, chunk: idx.chunk }));
  }
  return queuePromise;
}

/** 只保留最近 3 块（300 条），避免长跑时内存爬升。 */
const CHUNK_CACHE = 3;
const chunks = new Map<number, Entry[]>();
const inflight = new Map<number, Promise<Entry[]>>();

export function loadChunk(n: number): Promise<Entry[]> {
  const cached = chunks.get(n);
  if (cached) {
    chunks.delete(n);
    chunks.set(n, cached);
    return Promise.resolve(cached);
  }
  const pending = inflight.get(n);
  if (pending) return pending;

  const task = fetch(`${ROOT}/entries/${n}.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`分块 ${n} 加载失败（${res.status}）`);
      return res.json() as Promise<Entry[]>;
    })
    .then((rows) => {
      chunks.set(n, rows);
      inflight.delete(n);
      while (chunks.size > CHUNK_CACHE) {
        const oldest = chunks.keys().next().value;
        if (oldest === undefined) break;
        chunks.delete(oldest);
      }
      return rows;
    })
    .catch((err: unknown) => {
      inflight.delete(n);
      throw err;
    });

  inflight.set(n, task);
  return task;
}

export async function getEntry(queue: Queue, i: number): Promise<Entry> {
  const n = Math.floor(i / queue.chunk);
  const rows = await loadChunk(n);
  const row = rows[i % queue.chunk];
  if (!row) throw new Error(`第 ${i + 1} 条不存在`);
  return row;
}

export const imageUrl = (id: string) => `${ROOT}/img/${id}.webp`;
export const audioUrl = (id: string) => `${ROOT}/audio/ex/${id}.mp3`;

/** md 清单里要写的是仓库根相对路径，不是站点路径。 */
export const imageRelPath = (id: string) => `public/atlas/img/${id}.webp`;
