import assert from "node:assert/strict";
import test from "node:test";
import { decideClaimGate, exactRelation } from "@aihot/backend/insights/claim-gate";

const accepted = { eligible: true, atomic: true, atomicEnough: true, attributable: true, specific: true, material: true, verifiable: true, confidence: "high", claimantName: "OpenAI", claimantType: "company" as const, claimantInterest: "interested" as const, claimType: "性能" as const, reason: "specific", reasonCode: "other" as const };

test("a new id uses the same production decision as an old id", () => {
  for (const id of [165, 999]) {
    const result = decideClaimGate({ model: accepted });
    assert.equal(result.decision, "publish", String(id));
  }
});

test("an unqualified new claim is rejected and malformed output stays reviewable", () => {
  assert.equal(decideClaimGate({ model: { ...accepted, eligible: false, reason: "news headline", reasonCode: "generic_announcement" } }).decision, "reject");
  assert.equal(decideClaimGate({ modelError: "invalid_schema" }).decision, "model_error");
  assert.equal(decideClaimGate({ model: null }).decision, "needs_review");
});

test("independent strong claims can publish when all factual gates are explicit", () => {
  assert.equal(decideClaimGate({ model: { ...accepted, claimantInterest: "independent" } }).decision, "publish");
  assert.equal(decideClaimGate({ model: { ...accepted, verifiable: undefined } }).decision, "needs_review");
});

test("unsupported and unknown relations are not treated as support", () => {
  assert.equal(exactRelation("unsupported"), null);
  assert.equal(exactRelation("not_supported"), null);
  assert.equal(exactRelation("不支持"), null);
  assert.equal(exactRelation(""), null);
  assert.equal(exactRelation("supports"), "supports");
});
