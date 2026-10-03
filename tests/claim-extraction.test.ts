import assert from "node:assert/strict";
import test from "node:test";
import { extractionErrorClass, normalizeStageA } from "@aihot/backend/insights/claim-extraction";

test("stage A accepts items, claims, and bare arrays", () => {
  const item = { statement: "Official model reaches 1,000 tokens per second on selected hardware.", verifiable: true };
  assert.equal(normalizeStageA({ items: [item] }).length, 1);
  assert.equal(normalizeStageA({ claims: [item] }).length, 1);
  assert.equal(normalizeStageA([item]).length, 1);
});

test("model failures stay classified instead of becoming zero claims", () => {
  assert.equal(extractionErrorClass(new Error("JSON parse failed")), "json_parse");
  assert.equal(extractionErrorClass(new Error("invalid enum")), "schema_invalid_enum");
  assert.equal(extractionErrorClass(new Error("request timeout")), "timeout");
});
