import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import type { Atlas, IndexRow, WordRef } from "../atlas/types";
import { distractors, quizOptions } from "./session";
import type { QuizKind, Step } from "./store";

/**
 * The real index is small enough to load here, and using it keeps these tests
 * honest about the words that actually caused trouble ("so" vs "soup").
 */
const index = JSON.parse(fs.readFileSync("public/atlas/index.json", "utf8")) as { words: IndexRow[] };
const words: WordRef[] = index.words.map((r, order) => ({
  id: r[0],
  word: r[1],
  zh: r[2],
  ipa: r[3],
  cefr: r[4],
  topic: r[5],
  media: r[6],
  order,
}));
const atlas = { words, byId: new Map(words.map((w) => [w.id, w])) } as unknown as Atlas;
const ref = (id: string) => atlas.byId.get(id)!;
const label = (id: string, kind: QuizKind) => (kind === "meaning" ? ref(id).zh : ref(id).word).trim().toLowerCase();
const ipa = (id: string) => ref(id).ipa.toLowerCase().replace(/[/[\]]/g, "").replace(/[ˈˌ]/g, "").trim();
const quiz = (id: string, kind: QuizKind, options?: string[]): Step & { kind: QuizKind } => ({ id, kind, options });

test("a quiz always has four distinct choices, including its answer", () => {
  for (const kind of ["meaning", "picture", "listen"] as QuizKind[]) {
    for (const w of words.filter((x) => x.word.length <= 3)) {
      const ids = distractors(atlas, w, kind, 7);
      assert.equal(ids.length, 4, `${w.id} (${kind}) has ${ids.length} choices`);
      assert.equal(new Set(ids).size, 4, `${w.id} (${kind}) repeats an id`);
      assert.ok(ids.includes(w.id), `${w.id} (${kind}) lost its answer`);
      assert.equal(new Set(ids.map((id) => label(id, kind))).size, 4, `${w.id} (${kind}) repeats a label`);
    }
  }
});

test("a stale option list is repaired instead of hiding the answer", () => {
  const others = words.filter((w) => w.id !== "soup").slice(0, 3).map((w) => w.id);
  const ids = quizOptions(atlas, quiz("soup", "listen", others));
  assert.equal(ids.length, 4);
  assert.ok(ids.includes("soup"));
  assert.equal(new Set(ids.map((id) => label(id, "listen"))).size, 4);
});

test("duplicate, missing and removed ids are all refilled", () => {
  const ids = quizOptions(atlas, quiz("soup", "listen", ["soup", "soup", "not-a-word"]));
  assert.equal(ids.length, 4);
  assert.ok(ids.includes("soup"));
  assert.equal(new Set(ids).size, 4);
});

test("a valid stored order is left alone, so the answer does not jump between renders", () => {
  const stored = distractors(atlas, ref("soup"), "picture", 11);
  assert.deepEqual(quizOptions(atlas, quiz("soup", "picture", stored)), stored);
});

test("a listening quiz never offers two words with the same pronunciation", () => {
  for (const id of ["see", "sea", "so", "sow", "meet", "meat", "night", "knight"]) {
    const w = atlas.byId.get(id);
    if (!w) continue;
    for (let seed = 1; seed <= 8; seed++) {
      for (const other of distractors(atlas, w, "listen", seed)) {
        if (other !== id) assert.notEqual(ipa(other), ipa(id), `${id} and ${other} sound the same`);
      }
    }
  }
  // Even a stored list is filtered: "sea" cannot sit beside "see" in a listen quiz.
  const ids = quizOptions(atlas, quiz("see", "listen", ["sea", "meet", "meat"]));
  assert.equal(ids.length, 4);
  assert.ok(ids.includes("see"));
  assert.ok(!ids.includes("sea"));
});

test("labels are unique for a meaning quiz even when glosses collide", () => {
  const farm = { id: "farm", word: "farm", zh: "n. 农场", ipa: "", cefr: 0, topic: 0, media: 0, order: 1 } as WordRef;
  const field = { id: "field", word: "field", zh: "n. 农场", ipa: "", cefr: 0, topic: 0, media: 0, order: 2 } as WordRef;
  const tiny = {
    words: [farm, field, ...words.filter((w) => !["farm", "field"].includes(w.id)).slice(0, 6)],
    byId: new Map(),
  } as unknown as Atlas;
  tiny.byId = new Map(tiny.words.map((w) => [w.id, w]));
  const ids = quizOptions(tiny, quiz("farm", "meaning"));
  assert.equal(ids.length, 4);
  assert.ok(ids.includes("farm"));
  assert.equal(new Set(ids.map((id) => label(id, "meaning"))).size, 4);
});
