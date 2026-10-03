import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const report = JSON.parse(readFileSync(new URL("../.data/final-closeout/vendor-probe.json", import.meta.url), "utf8")) as {
  statusEnum: string[];
  vendors: Array<{ vendor: string; status: string; paths: Array<{ category: string; sourcePlatform: string; sourceOwner: string; affectedVendor: string; affectedProduct: string; modelProvider: string; accessChannel: string; claimant: string; probe: { status: string; url: string; retrievedAt: string; }; }> }>;
  tooling: { agentReachDoctor: { status: string; command: string; } };
};

const required = ["official_claim", "developer_demand", "community_demand", "independent_evidence"];

test("Tier1 vendor probe covers all seven vendors and four required paths", () => {
  assert.equal(report.vendors.length, 7);
  const names = new Set(report.vendors.map((v) => v.vendor));
  for (const name of ["OpenAI", "Anthropic", "Google/Gemini", "xAI/Grok", "Microsoft/Copilot", "DeepSeek", "Qwen"]) assert.ok(names.has(name));
  for (const vendor of report.vendors) {
    assert.ok(report.statusEnum.includes(vendor.status), `${vendor.vendor} overall status`);
    assert.deepEqual(new Set(vendor.paths.map((p) => p.category)), new Set(required));
    for (const p of vendor.paths) {
      assert.ok(p.sourcePlatform && p.sourceOwner && p.affectedVendor && p.affectedProduct && p.accessChannel && p.claimant);
      const attribution = (p as typeof p & { attribution?: Record<string, string> }).attribution;
      assert.ok(attribution && attribution.source_platform && attribution.source_owner && attribution.affected_vendor && attribution.affected_product && attribution.model_provider && attribution.access_channel && attribution.claimant);
      assert.ok(report.statusEnum.includes(p.probe.status), `${vendor.vendor}/${p.category}`);
      assert.match(p.probe.url, /^https:\/\//);
      assert.ok(p.probe.retrievedAt);
    }
  }
});

test("vendor probe records unavailable agent-reach doctor without claiming ACTIVE", () => {
  assert.equal(report.tooling.agentReachDoctor.status, "UNAVAILABLE");
  assert.equal(report.tooling.agentReachDoctor.command, "agent-reach doctor --json");
  for (const vendor of report.vendors) {
    if (vendor.vendor !== "OpenAI") assert.notEqual(vendor.status, "ACTIVE", `${vendor.vendor} must not be promoted from a probe`);
  }
});

test("vendor probe artifact contains no credentials or personal identifiers", () => {
  const raw = readFileSync(new URL("../.data/final-closeout/vendor-probe.json", import.meta.url), "utf8");
  assert.doesNotMatch(raw, /gho_[A-Za-z0-9_\-]{20,}|ghp_[A-Za-z0-9_\-]{20,}|sk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._\-]{20,}/i);
  assert.doesNotMatch(raw, /sourceUser|username|authorLogin|email/i);
});
