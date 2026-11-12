import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isPullDown,
  pullOffset,
  pullProgress,
  PULL_ARM,
  PULL_MAX,
} from "./pull";

test("a pull is downward and more vertical than horizontal", () => {
  assert.equal(isPullDown(0, 40), true);
  assert.equal(isPullDown(30, 40), true);
  assert.equal(isPullDown(-30, 40), true);
  // A scroll upwards, or a sideways drag through the topic chips, is not ours.
  assert.equal(isPullDown(0, -40), false);
  assert.equal(isPullDown(60, 40), false);
  assert.equal(isPullDown(0, 0), false);
});

test("the hint follows the finger and then slows down, never past the ceiling", () => {
  assert.equal(pullOffset(-10), 0);
  assert.equal(pullOffset(0), 0);
  assert.equal(pullOffset(24), 24);
  assert.equal(pullOffset(40), 40);
  // Past the free distance the pill lags behind the finger.
  assert.ok(pullOffset(80) > 40 && pullOffset(80) < 80);
  // However long the drag, the pill stays under the header.
  assert.equal(pullOffset(400), PULL_MAX);
  assert.ok(pullOffset(120) <= PULL_MAX);
});

test("progress arms exactly at the threshold and never exceeds one", () => {
  assert.equal(pullProgress(0), 0);
  assert.equal(pullProgress(-20), 0);
  assert.equal(pullProgress(PULL_ARM / 2), 0.5);
  assert.equal(pullProgress(PULL_ARM), 1);
  assert.equal(pullProgress(PULL_ARM * 4), 1);
});
