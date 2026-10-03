import assert from "node:assert/strict";
import test from "node:test";
import { canonicalize, retrieveEvidence, textOnly } from "@aihot/backend/insights/evidence-retrieval";

test("G07 canonical fetch identity and readable body helpers", () => {
  assert.equal(canonicalize("https://example.com/a/?utm_source=x#frag"), "https://example.com/a");
  assert.match(textOnly("<nav>Menu</nav><main>Direct benchmark result with enough text.</main>"), /Direct benchmark/);
});

test("G08 executed adapters are explicitly audited", async () => {
  const result = await retrieveEvidence(["AI benchmark methodology"]);
  assert.equal(result.audits.length, 2);
  for (const audit of result.audits) {
    assert.ok(["success", "no_result", "blocked", "rate_limited", "error"].includes(audit.status));
    assert.equal(audit.query, "AI benchmark methodology");
    assert.equal(typeof audit.executedAt, "string");
    assert.equal(audit.resultCount, audit.urls.length);
  }
  assert.ok(result.audits.some((x) => x.status === "success" || x.status === "no_result" || x.status === "blocked"));
});
