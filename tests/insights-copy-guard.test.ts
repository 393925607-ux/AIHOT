import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeCopy, refreshCopy, sourceTextHash, type CopyJudgement } from "../packages/backend/src/insights/copy-guard.ts";

type Copy = { problemZh: string | null; scenarioZh: string | null; workaroundZh: string | null };
const generated = (problemZh: string, scenarioZh = "用户在实际使用中遇到该问题。", workaroundZh: string | null = "") => ({ problemZh, scenarioZh, workaroundZh });

test("source hash is deterministic and normalizes line endings", () => {
  assert.equal(sourceTextHash("问题\n场景"), sourceTextHash("问题\r\n场景"));
  assert.notEqual(sourceTextHash("问题\n场景"), sourceTextHash("另一个问题\n场景"));
});

test("a first source fills empty copy and records the current baseline", () => {
  const result = mergeCopy<Copy>({ sourceText: "raw-v1", generated: generated("具体问题") });
  assert.deepEqual(result.copy, generated("具体问题"));
  assert.deepEqual(result.judgement.copyReview, { sourceHash: sourceTextHash("raw-v1"), state: "current" });
  assert.equal(result.needsRefresh, false);
});

test("same source preserves non-empty reviewed fields while filling an empty field", () => {
  const first = mergeCopy<Copy>({ sourceText: "raw-v1", generated: generated("人工确认的问题", "人工确认的场景", null) });
  const second = mergeCopy<Copy>({
    sourceText: "raw-v1",
    generated: generated("模型改写的问题", "模型改写的场景", "新的临时办法"),
    existing: first.copy,
    judgement: first.judgement,
  });
  assert.equal(second.copy.problemZh, "人工确认的问题");
  assert.equal(second.copy.scenarioZh, "人工确认的场景");
  assert.equal(second.copy.workaroundZh, "新的临时办法");
  assert.equal(second.needsRefresh, false);
});

test("changed raw source keeps reviewed copy and records a pending refresh", () => {
  const first = mergeCopy<Copy>({ sourceText: "raw-v1", generated: generated("已审阅的问题") });
  const changed = mergeCopy<Copy>({
    sourceText: "raw-v2",
    generated: generated("新来源的问题"),
    existing: first.copy,
    judgement: first.judgement,
  });
  assert.deepEqual(changed.copy, first.copy);
  assert.equal(changed.needsRefresh, true);
  assert.deepEqual(changed.judgement.copyReview, {
    sourceHash: sourceTextHash("raw-v1"),
    pendingSourceHash: sourceTextHash("raw-v2"),
    state: "needs_refresh",
  });
});

test("explicit refresh applies new copy and clears pending metadata", () => {
  const first = mergeCopy<Copy>({ sourceText: "raw-v1", generated: generated("旧问题") });
  const pending = mergeCopy<Copy>({ sourceText: "raw-v2", generated: generated("新问题"), existing: first.copy, judgement: first.judgement });
  const refreshed = refreshCopy<Copy>({ sourceText: "raw-v2", generated: generated("新问题", "新场景", "新办法"), existing: pending.copy, judgement: pending.judgement });
  assert.deepEqual(refreshed.copy, generated("新问题", "新场景", "新办法"));
  assert.deepEqual(refreshed.judgement.copyReview, { sourceHash: sourceTextHash("raw-v2"), state: "current" });
  assert.equal(refreshed.needsRefresh, false);
});

test("explicit refresh may intentionally clear a stale field", () => {
  const first = mergeCopy<Copy>({ sourceText: "raw-v1", generated: generated("旧问题", "旧场景", "旧办法") });
  const pending = mergeCopy<Copy>({ sourceText: "raw-v2", generated: generated("新问题"), existing: first.copy, judgement: first.judgement });
  const refreshed = refreshCopy<Copy>({ sourceText: "raw-v2", generated: generated("新问题", "新场景", ""), existing: pending.copy, judgement: pending.judgement });
  assert.equal(refreshed.copy.workaroundZh, "");
  assert.deepEqual(refreshed.judgement.copyReview, { sourceHash: sourceTextHash("raw-v2"), state: "current" });
});

test("source reversion returns to the reviewed baseline and clears pending", () => {
  const first = mergeCopy<Copy>({ sourceText: "raw-v1", generated: generated("稳定问题") });
  const pending = mergeCopy<Copy>({ sourceText: "raw-v2", generated: generated("变化问题"), existing: first.copy, judgement: first.judgement });
  const reverted = mergeCopy<Copy>({ sourceText: "raw-v1", generated: generated("再次生成的问题"), existing: pending.copy, judgement: pending.judgement });
  assert.deepEqual(reverted.copy, first.copy);
  assert.deepEqual(reverted.judgement.copyReview, { sourceHash: sourceTextHash("raw-v1"), state: "current" });
  assert.equal(reverted.needsRefresh, false);
});

test("unknown baseline never overwrites existing copy and establishes a safe baseline", () => {
  const judgement: CopyJudgement = { phase: 6, other: "kept" };
  const result = mergeCopy<Copy>({ sourceText: "raw-unknown", generated: generated("模型问题"), existing: generated("人工问题"), judgement });
  assert.equal(result.copy.problemZh, "人工问题");
  assert.equal(result.judgement.other, "kept");
  assert.deepEqual(result.judgement.copyReview, { sourceHash: sourceTextHash("raw-unknown"), state: "current" });
});

test("unknown baseline fills missing fields without inventing a pending refresh", () => {
  const result = mergeCopy<Copy>({ sourceText: "raw-new", generated: generated("模型问题"), existing: { problemZh: null, scenarioZh: "已有场景", workaroundZh: null } });
  assert.deepEqual(result.copy, { problemZh: "模型问题", scenarioZh: "已有场景", workaroundZh: null });
  assert.equal(result.needsRefresh, false);
});
