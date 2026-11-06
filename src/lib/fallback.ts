/**
 * Out-of-atlas lookup fallback (ECDICT).
 *
 * The 7,298 cards are the product, but a tapped word outside them should still
 * be readable: the bundled ECDICT extract supplies a transcription, a part of
 * speech and a one-line Chinese gloss. It is split by first letter so a miss
 * fetches at most one small file; inside the APK the same files are read from
 * the packaged assets through the shell bridge.
 *
 * Nothing here touches the atlas dataset or the entry card — the fallback only
 * fills the "not in the atlas" popover.
 */
import { assetDataUrl } from "./asset";
import { lookupCandidates } from "./lookup";

/** [UK, US, part of speech, Chinese gloss] */
export type FallbackEntry = [string, string | null, string, string];

type Shard = Record<string, FallbackEntry>;

// `import.meta.env` only exists under Vite; the Node tests import the pure
// helpers directly, so fall back to the site root there.
const BASE = (import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "");
const shardUrl = (letter: string) => `${BASE}/atlas/fallback/${letter}.json`;

/** Only the first letter matters; the generator writes one file per letter. */
export function fallbackShard(raw: string): string | null {
  const match = /^[a-z]/.exec(raw.trim().toLowerCase());
  return match ? match[0] : null;
}

/**
 * Turn the shell's `data:` URL back into text.
 *
 * `assetDataUrl` labels JSON as application/octet-stream, which a data-URL
 * fetch may refuse, so the base64 is decoded here. Keeping it synchronous also
 * means one less round trip per miss.
 */
export function decodeDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("invalid data URL");
  const meta = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  if (!meta.includes(";base64")) return decodeURIComponent(body);
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const SHARD_LIMIT = 4;
const shards = new Map<string, Shard>();
const pending = new Map<string, Promise<Shard>>();

async function loadShard(letter: string): Promise<Shard> {
  const local = assetDataUrl(shardUrl(letter));
  if (local) return JSON.parse(decodeDataUrl(local)) as Shard;
  const res = await fetch(shardUrl(letter));
  if (!res.ok) throw new Error(`兜底词库加载失败（${res.status}）`);
  return (await res.json()) as Shard;
}

function readShard(letter: string): Promise<Shard> {
  const cached = shards.get(letter);
  if (cached) return Promise.resolve(cached);

  let request = pending.get(letter);
  if (!request) {
    request = loadShard(letter)
      .then((shard) => {
        // Four shards cover most reading sessions; dropping the oldest keeps
        // the 26 files from turning into tens of megabytes of live strings.
        shards.set(letter, shard);
        if (shards.size > SHARD_LIMIT) {
          const oldest = shards.keys().next().value;
          if (oldest !== undefined) shards.delete(oldest);
        }
        pending.delete(letter);
        return shard;
      })
      .catch((error) => {
        pending.delete(letter);
        throw error;
      });
    pending.set(letter, request);
  }
  return request;
}

/** The fallback row for a tapped word, or null when ECDICT has nothing. */
export async function lookupFallback(raw: string): Promise<FallbackEntry | null> {
  for (const candidate of lookupCandidates(raw)) {
    const letter = fallbackShard(candidate);
    if (!letter) continue;
    try {
      const shard = await readShard(letter);
      const row = shard[candidate];
      if (row) return row;
    } catch {
      // A missing or broken shard is the same as no fallback at all: the card
      // still shows the "not in the atlas" line.
      return null;
    }
  }
  return null;
}
