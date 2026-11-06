import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeDataUrl, fallbackShard } from "./fallback";

test("a fallback shard is chosen by the first letter only", () => {
  assert.equal(fallbackShard("Serendipity"), "s");
  assert.equal(fallbackShard("  obfuscate "), "o");
  assert.equal(fallbackShard("'tis"), null);
  assert.equal(fallbackShard("3D"), null);
  assert.equal(fallbackShard("—"), null);
});

test("the shell's base64 data URL decodes to UTF-8 JSON", () => {
  const payload = JSON.stringify({ serendipity: ["ˌserənˈdɪpəti", null, "n.", "奇遇"] });
  const bytes = new TextEncoder().encode(payload);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const dataUrl = `data:application/octet-stream;base64,${btoa(binary)}`;
  assert.equal(decodeDataUrl(dataUrl), payload);
});

test("a plain percent-encoded data URL also decodes", () => {
  assert.equal(decodeDataUrl("data:application/json,%7B%22a%22%3A1%7D"), '{"a":1}');
});
