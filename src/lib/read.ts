import type { Accent, Atlas, Entry, WordRef } from "../atlas/types";
import { play } from "./audio";

/** Which parts of a card should be read out. */
export interface ReadPlan {
  /** The headword itself. */
  word: boolean;
  /** The everyday example (`ex[0]`). */
  daily: boolean;
  /** The IELTS-context example (`ex[1]`), when the entry has one. */
  ielts: boolean;
  /** Speaking speed for the everyday example; the headword keeps its own. */
  dailyRate?: number;
  /** The same, for the IELTS-context example. */
  ieltsRate?: number;
}

/**
 * Read a word and then the examples the reader asked for, one after another.
 *
 * Each example is spoken at the speed picked for its kind — a daily sentence
 * and a long IELTS sentence rarely want the same pace. The chain gives up as
 * soon as playback is interrupted: `play` reports "stopped" when something
 * newer takes the speaker over, so a card that was left behind never keeps
 * talking over the next screen.
 */
export async function readEntry(atlas: Atlas, entry: Entry, refw: WordRef | Entry, accent: Accent, plan: ReadPlan) {
  const say = async (url: string | null, text: string, rate = 1) => (await play(url, text, accent, rate)) !== "stopped";

  if (plan.word && !(await say(atlas.audio(refw, accent), entry.w))) return;
  if (plan.daily && entry.ex[0] && !(await say(atlas.audio(entry, "ex"), entry.ex[0].en, plan.dailyRate ?? 1))) return;
  if (plan.ielts && entry.ex[1]) await say(atlas.audio(entry, "ex2"), entry.ex[1].en, plan.ieltsRate ?? 1);
}
