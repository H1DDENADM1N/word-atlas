import { test } from "node:test";
import assert from "node:assert/strict";

import { groupRelations } from "./relations";

test("groups words by sense and keeps unplaced words in other", () => {
  const grouped = groupRelations(["a", "b", "c", "d"], [1, -1, 0, 1], 2);

  assert.deepEqual(grouped.groups, [
    { sense: 0, words: ["c"] },
    { sense: 1, words: ["a", "d"] },
  ]);
  assert.deepEqual(grouped.other, ["b"]);
});

test("caps each sense at the display limit and moves overflow to other", () => {
  const words = Array.from({ length: 10 }, (_, index) => `w${index}`);
  const indexes = words.map(() => 0);

  const grouped = groupRelations(words, indexes, 1, 8);

  assert.equal(grouped.groups.length, 1);
  assert.deepEqual(grouped.groups[0].words, words.slice(0, 8));
  assert.deepEqual(grouped.other, words.slice(8));
});

test("treats missing, short, and out-of-range indexes as unplaced", () => {
  assert.deepEqual(groupRelations(["a", "b"], undefined, 2), {
    groups: [],
    other: ["a", "b"],
  });
  assert.deepEqual(groupRelations(["a", "b"], [0], 2), {
    groups: [],
    other: ["a", "b"],
  });
  assert.deepEqual(groupRelations(["a", "b", "c"], [0, 2, -2], 2), {
    groups: [{ sense: 0, words: ["a"] }],
    other: ["b", "c"],
  });
});

test("returns every word in original order when nothing is placed", () => {
  const grouped = groupRelations(["z", "y", "x"], [-1, -1, -1], 3);

  assert.deepEqual(grouped.groups, []);
  assert.deepEqual(grouped.other, ["z", "y", "x"]);
});
