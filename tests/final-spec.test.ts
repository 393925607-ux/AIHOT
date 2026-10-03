import assert from "node:assert/strict";
import test from "node:test";
import { fairRoundRobin } from "@aihot/backend/insights/discovery-queue";
import { buildPrivateRecord } from "@aihot/backend/insights/personal";

test("discovery queue gives each source family a turn and preserves leftovers", () => {
  const items = ["a1", "a2", "b1", "b2", "c1"].map((id) => ({ sourceFamily: id[0]!, payload: id }));
  assert.deepEqual(fairRoundRobin(items, 4).map((x) => x.payload), ["a1", "b1", "c1", "a2"]);
});

test("private inbox record stores only a hashable private envelope", () => {
  const record = buildPrivateRecord({ sourceUrl: "https://example.invalid/private", textFile: null, hint: "own-test", text: "sentinel private input", ownTest: true });
  assert.equal(record.privacy, "private");
  assert.equal(record.ownTest, true);
  assert.equal(record.textLength, 22);
  assert.match(record.contentHash, /^[a-f0-9]{64}$/);
});
