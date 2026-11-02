#!/usr/bin/env node
/**
 * Audit the two things a quiz must never get wrong:
 *   1. Every example sentence can be blanked at its own headword.
 *   2. Every multiple-choice question has four distinct choices, one of which
 *      is the answer — including when the stored session is stale.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Atlas, IndexRow, WordRef } from "../src/atlas/types";
import { gap, headwordForms } from "../src/lib/text";
import { distractors, quizOptions } from "../src/store/session";
import type { QuizKind } from "../src/store/store";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(root, "public/atlas");
const index = JSON.parse(fs.readFileSync(path.join(pub, "index.json"), "utf8")) as { words: IndexRow[]; chunk: number };
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
const byId = new Map(words.map((w) => [w.id, w]));
const atlas = { words, byId } as unknown as Atlas;
const errors: string[] = [];
const fail = (msg: string) => errors.length < 40 && errors.push(msg);
const label = (id: string, kind: QuizKind) => (kind === "meaning" ? byId.get(id)!.zh : byId.get(id)!.word).trim().toLowerCase();
const ipa = (id: string) => byId.get(id)!.ipa.toLowerCase().replace(/[/[\]]/g, "").replace(/[ˈˌ]/g, "").trim();

let examples = 0;
for (let n = 0; n * index.chunk < index.words.length; n++) {
  const rows = JSON.parse(fs.readFileSync(path.join(pub, `entries/${n}.json`), "utf8"));
  for (const entry of rows) {
    for (const ex of entry.ex ?? []) {
      examples++;
      const g = gap(ex.en, entry.w);
      if (!g) {
        fail(`${entry.id}: no cloze in “${ex.en}”`);
        continue;
      }
      if (!headwordForms(entry.w).includes(g.hidden.toLowerCase())) fail(`${entry.id}: blanked “${g.hidden}” in “${ex.en}”`);
    }
  }
}

let optionSets = 0;
for (const w of words) {
  for (const kind of ["meaning", "picture", "listen"] as QuizKind[]) {
    optionSets++;
    const ids = distractors(atlas, w, kind, 1);
    if (ids.length !== 4) fail(`${w.id} (${kind}): ${ids.length} choices`);
    else if (new Set(ids).size !== 4) fail(`${w.id} (${kind}): repeated id`);
    else if (!ids.includes(w.id)) fail(`${w.id} (${kind}): answer missing`);
    else if (new Set(ids.map((id) => label(id, kind))).size !== 4) fail(`${w.id} (${kind}): repeated label`);
    else if (kind === "listen" && w.ipa && new Set(ids.map(ipa)).size !== 4) fail(`${w.id} (${kind}): two choices sound the same`);
  }
}

let repaired = 0;
for (let i = 0; i < words.length; i += 251) {
  const w = words[i];
  for (const kind of ["meaning", "picture", "listen"] as QuizKind[]) {
    const others = [words[(i + 1) % words.length].id, words[(i + 2) % words.length].id, words[(i + 3) % words.length].id];
    const ids = quizOptions(atlas, { id: w.id, kind, options: others.filter((id) => id !== w.id) });
    repaired++;
    if (ids.length !== 4 || !ids.includes(w.id) || new Set(ids).size !== 4) fail(`${w.id} (${kind}): stale options were not repaired`);
  }
}

console.log(JSON.stringify({ words: words.length, examples, optionSets, repaired, errors: errors.length }, null, 1));
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
