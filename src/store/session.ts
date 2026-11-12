import type { Atlas, WordRef } from "../atlas/types";
import { MEDIA } from "../atlas/types";
import { hashSeed, normalize, shuffle } from "../lib/text";
import { isMastered, review, Rating, type Grade } from "./srs";
import { bumpDay, dayKey, store, type ActiveSession, type Progress, type QuizKind, type Settings, type Step } from "./store";

export function dueIds(p: Progress, now = Date.now()) {
  return Object.entries(p.cards)
    .filter(([, c]) => c.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([id]) => id);
}

export function newToday(p: Progress, date = dayKey()) {
  return p.days[date]?.n ?? 0;
}

/** Next unseen words along the learning path, starting at the learner's level. */
export function nextNew(atlas: Atlas, p: Progress, settings: Settings, count: number) {
  const out: string[] = [];
  const pass = (from: number) => {
    for (const w of atlas.words) {
      if (out.length >= count) return;
      if (w.cefr < from || p.cards[w.id] || out.includes(w.id)) continue;
      out.push(w.id);
    }
  };
  pass(settings.startLevel);
  if (out.length < count) pass(0);
  return out;
}

/**
 * `now` / `date` default to the present, so every existing caller keeps the
 * Today page's numbers. The widget publisher passes a future hour boundary to
 * project what the plan will look like as cards come due while the app is closed.
 */
export function todayPlan(atlas: Atlas, p: Progress, s: Settings, now = Date.now(), date = dayKey()) {
  const due = dueIds(p, now).filter((id) => atlas.byId.has(id));
  const newLeft = Math.max(0, s.dailyNew - newToday(p, date));
  const fresh = nextNew(atlas, p, s, newLeft);
  return { due, fresh, minutes: Math.max(1, Math.round(due.length * 0.25 + fresh.length * 0.9)) };
}

function quizKind(ref: WordRef, p: Progress, s: Settings, salt: number): QuizKind {
  const c = p.cards[ref.id];
  const hasImg = !!(ref.media & MEDIA.img);
  const roll = hashSeed(ref.id + salt) % 100;
  if (!c || c.s < 2) {
    if (hasImg && roll < 45) return "picture";
    return roll < 80 ? "meaning" : "listen";
  }
  if (s.spell && (c.s >= 4 || roll < 35)) return roll < 75 ? "spell" : hasImg ? "picture" : "listen";
  return roll < 50 ? "listen" : hasImg ? "picture" : "meaning";
}

/** The text a choice shows: the meaning for a meaning quiz, the word otherwise. */
const optionLabel = (w: WordRef, kind: QuizKind) => (kind === "meaning" ? w.zh : w.word).trim().replace(/\s+/g, " ").toLowerCase();

/** Two words with the same transcription are both correct in a listening quiz. */
const ipaKey = (s: string) => s.toLowerCase().replace(/[/[\]]/g, "").replace(/[ˈˌ]/g, "").trim();

/** Distractors that look plausible: similar spelling or length, different meaning. */
export function distractors(atlas: Atlas, ref: WordRef, kind: QuizKind, seed: number) {
  const target = normalize(ref.word);
  const answerLabel = optionLabel(ref, kind);
  const answerIpa = kind === "listen" ? ipaKey(ref.ipa) : "";
  const zhCore = ref.zh.replace(/^[a-z.]+\s*/, "").split(/[；;，,]/)[0];
  const scored: [number, WordRef][] = [];
  const scanned = new Set<string>();

  const scan = (w: WordRef) => {
    if (scanned.has(w.id)) return;
    scanned.add(w.id);
    if (w.id === ref.id || normalize(w.word) === target) return;
    if (optionLabel(w, kind) === answerLabel) return;
    if (answerIpa && ipaKey(w.ipa) === answerIpa) return;
    if (zhCore && w.zh.includes(zhCore)) return;
    let score = hashSeed(w.id + seed) % 100;
    // Keep the old neighbourhood preference, but never let a small window
    // leave the quiz with fewer than three choices.
    if (Math.abs(w.order - ref.order) <= 400) score += 40;
    if (kind === "listen" || kind === "picture") {
      if (w.word[0]?.toLowerCase() === target[0]) score += 120;
      score += Math.max(0, 60 - Math.abs(w.word.length - target.length) * 20);
    } else {
      if (w.cefr === ref.cefr) score += 40;
      if (w.zh.split(" ")[0] === ref.zh.split(" ")[0]) score += 60; // same part of speech
    }
    scored.push([score, w]);
  };

  for (const w of atlas.words) {
    if (Math.abs(w.order - ref.order) <= 400) scan(w);
  }
  const choose = () => {
    scored.sort((a, b) => b[0] - a[0]);
    const labels = new Set<string>([answerLabel]);
    const sounds = new Set<string>(answerIpa ? [answerIpa] : []);
    const picks: string[] = [];
    for (const [, w] of scored) {
      const label = optionLabel(w, kind);
      if (labels.has(label)) continue;
      if (answerIpa) {
        const sound = ipaKey(w.ipa);
        if (sounds.has(sound)) continue;
        sounds.add(sound);
      }
      labels.add(label);
      picks.push(w.id);
      if (picks.length === 3) break;
    }
    return picks;
  };

  let picks = choose();
  if (picks.length < 3) {
    // A short window (a small private set, or a word at the edge of the atlas)
    // must not leave the question with fewer than four choices.
    for (const w of atlas.words) scan(w);
    picks = choose();
  }
  return shuffle([ref.id, ...picks], seed);
}

/**
 * The four ids a quiz shows. A stored set can be stale (an older build, a
 * dataset change, a hand-edited backup), so the correct id is always put back
 * and a missing slot is refilled — the answer can never be absent from its own
 * question.
 */
export function quizOptions(atlas: Atlas, step: Step & { kind: QuizKind }): string[] {
  const ref = atlas.byId.get(step.id);
  if (!ref) return [];
  const kind = step.kind;
  const stored = (step.options ?? []).filter((id) => atlas.byId.has(id));
  const label = (id: string) => optionLabel(atlas.byId.get(id)!, kind);
  const answerIpa = kind === "listen" ? ipaKey(ref.ipa) : "";
  const sounds = new Set<string>(answerIpa ? [answerIpa] : []);
  const homophone = (id: string) => !!answerIpa && id !== ref.id && sounds.has(ipaKey(atlas.byId.get(id)!.ipa));
  if (
    stored.length === 4 &&
    stored.includes(ref.id) &&
    new Set(stored.map(label)).size === 4 &&
    (!answerIpa || new Set(stored.map((id) => ipaKey(atlas.byId.get(id)!.ipa))).size === 4)
  )
    return stored;

  const out: string[] = [];
  const seen = new Set<string>();
  const labels = new Set<string>();
  const push = (id: string) => {
    const w = atlas.byId.get(id);
    if (!w || seen.has(id) || homophone(id)) return;
    if (answerIpa) sounds.add(ipaKey(w.ipa));
    const l = optionLabel(w, kind);
    if (labels.has(l)) return;
    seen.add(id);
    labels.add(l);
    out.push(id);
  };

  for (const id of stored) {
    if (out.length === 4) break;
    push(id);
  }
  if (!seen.has(ref.id)) {
    if (out.length === 4) {
      const dropped = out.pop()!;
      seen.delete(dropped);
      labels.delete(label(dropped));
    }
    push(ref.id);
  }
  if (out.length < 4) {
    for (const id of distractors(atlas, ref, kind, hashSeed(`${step.id}:${kind}`))) {
      push(id);
      if (out.length === 4) break;
    }
  }
  return out.length === 4 ? shuffle(out, hashSeed(`${step.id}:${kind}`)) : out;
}

export function buildSession(atlas: Atlas, p: Progress, s: Settings, opts?: { ids?: string[]; reviewOnly?: boolean }): ActiveSession {
  const seed = Date.now();
  const plan = todayPlan(atlas, p, s);
  const reviewIds = opts?.ids ? opts.ids.filter((id) => p.cards[id]) : plan.due.slice(0, 120);
  const newIds = opts?.ids ? opts.ids.filter((id) => !p.cards[id]) : opts?.reviewOnly ? [] : plan.fresh;
  const steps: Step[] = [];
  const quiz = (id: string, salt: number): Step => {
    const ref = atlas.byId.get(id)!;
    const kind = quizKind(ref, p, s, seed + salt);
    return { id, kind, options: kind === "spell" ? undefined : distractors(atlas, ref, kind, seed + salt) };
  };
  // Reviews first while attention is fresh, then new words in small groups:
  // meet five, then recall those five in a different order.
  reviewIds.forEach((id, i) => steps.push(quiz(id, i)));
  for (let g = 0; g < newIds.length; g += 5) {
    const group = newIds.slice(g, g + 5);
    group.forEach((id) => steps.push({ id, kind: "intro" }));
    shuffle(group, seed + g).forEach((id, i) => steps.push(quiz(id, 1000 + g + i)));
  }
  return { id: `s${seed}`, started: seed, steps, index: 0, graded: {}, newIds, reviewIds };
}

export function gradeFor(kind: QuizKind, correct: boolean, ms: number, hinted: boolean): Grade {
  if (!correct) return Rating.Again;
  if (hinted) return Rating.Hard;
  const slow = kind === "spell" ? 20000 : 9000;
  const fast = kind === "spell" ? 6000 : 2500;
  if (ms > slow) return Rating.Hard;
  if (ms < fast && kind === "spell") return Rating.Easy;
  return Rating.Good;
}

/** Apply an answer. Only the first attempt for a word in a session updates memory and stats. */
export function answer(atlas: Atlas, step: Step & { kind: QuizKind }, correct: boolean, grade: Grade, value: string) {
  const { settings } = store.get();
  store.progress((p) => {
    const sess = p.session;
    if (!sess) return p;
    let next: Progress = { ...p, session: { ...sess, pending: { correct, value } } };
    const first = !(step.id in sess.graded) && !step.retry;
    if (first) {
      next = {
        ...next,
        cards: { ...next.cards, [step.id]: review(p.cards[step.id], grade, Date.now(), settings.retention) },
        session: { ...next.session!, graded: { ...sess.graded, [step.id]: grade } },
        mistakes: correct ? next.mistakes : [step.id, ...next.mistakes.filter((x) => x !== step.id)].slice(0, 300),
      };
      next = bumpDay(next, { r: 1, c: correct ? 1 : 0, n: sess.newIds.includes(step.id) ? 1 : 0 });
    }
    if (!correct) {
      // Practise it again a few steps later in another format; never re-graded.
      const steps = [...next.session!.steps];
      const retries = steps.filter((x) => x.id === step.id && "retry" in x && x.retry).length;
      if (retries < 2) {
        const ref = atlas.byId.get(step.id)!;
        const kind: QuizKind = step.kind === "meaning" ? (ref.media & MEDIA.img ? "picture" : "listen") : "meaning";
        const at = Math.min(steps.length, sess.index + 4);
        steps.splice(at, 0, { id: step.id, kind, retry: true, options: distractors(atlas, ref, kind, Date.now()) });
        next = { ...next, session: { ...next.session!, steps } };
      }
    }
    return next;
  });
}

/** Move to the next step; `seconds` is time spent on this step, capped so idle tabs don't inflate stats. */
export function advance(seconds: number) {
  store.progress((p) => {
    const s = p.session;
    if (!s) return p;
    const index = s.index + 1;
    const finished = index >= s.steps.length ? Date.now() : undefined;
    const next = bumpDay(p, { t: Math.max(0, Math.min(90, Math.round(seconds))) });
    return { ...next, session: { ...s, index, pending: undefined, finished } };
  });
}

export function sessionStats(s: ActiveSession) {
  const graded = Object.values(s.graded);
  const correct = graded.filter((g) => g !== Rating.Again).length;
  return { total: graded.length, correct, accuracy: graded.length ? Math.round((correct / graded.length) * 100) : 0 };
}

export const masteredCount = (p: Progress) => Object.values(p.cards).filter(isMastered).length;
