import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildPrivateRecord, parseOwnTest } from "@aihot/backend/insights/personal";

test("private Inbox classifies explicit labels and keeps uncertain input for review", () => {
  assert.equal(buildPrivateRecord({ sourceUrl: null, textFile: null, hint: "demand", text: "具体需求描述" }).classify, "Demand");
  assert.equal(buildPrivateRecord({ sourceUrl: null, textFile: null, hint: "claim", text: "明确主张" }).classify, "Claim");
  assert.equal(buildPrivateRecord({ sourceUrl: null, textFile: null, hint: "noise", text: "噪声" }).classify, "Noise");
  const uncertain = buildPrivateRecord({ sourceUrl: null, textFile: null, hint: null, text: "没有可判断类型的内容" });
  assert.equal(uncertain.classify, "Needs Review");
  assert.equal(uncertain.reviewStatus, "needs_review");
});

test("own-test JSON and Markdown are parsed as user supplied, non-independent evidence", () => {
  const json = JSON.stringify({ vendor: "Example", model: "Model 1", version: "1.0", access_channel: "API", region: "us", hardware: "GPU", concurrency: 2, task: "短文本", metric: "延迟", value: "120ms", timestamp: "2026-10-03T00:00:00Z", limitations: "单次运行" });
  const parsed = parseOwnTest(json);
  assert.equal(parsed.vendor, "Example");
  assert.equal(parsed.accessChannel, "API");
  assert.equal(parsed.concurrency, "2");
  assert.equal(parsed.evidenceType, "own_test");
  assert.equal(parsed.provenance, "user_supplied");
  assert.equal(parsed.independent, false);
  assert.equal(parsed.matchStatus, "needs_review");
  assert.match(parsed.artifactHash, /^[a-f0-9]{64}$/);

  const markdown = "Vendor: Example\nModel: Model 2\nTask: 任务\nMetric: 吞吐\nValue: 42\nLimitations: 仅供参考";
  const record = buildPrivateRecord({ sourceUrl: null, textFile: "result.md", hint: "own-test", text: markdown, ownTest: true });
  assert.equal(record.classify, "Evidence");
  assert.equal(record.reviewStatus, "needs_review");
  assert.equal(record.own_test, true);
  assert.equal(record.user_supplied, true);
  assert.equal(record.independent, false);
  assert.equal(record.ownTestMetadata?.metric, "吞吐");
  assert.equal(record.ownTestMetadata?.artifactHash, record.contentHash);
});

test("private envelope never serializes raw private text", () => {
  const sentinel = ["PRIVATE", "_SENTINEL", "_9F2E"].join("");
  const record = buildPrivateRecord({ sourceUrl: null, textFile: "private.txt", hint: null, text: sentinel, ownTest: false });
  assert.doesNotMatch(JSON.stringify(record), new RegExp(sentinel));
});

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(?:ts|tsx|js|jsx|json|css|html)$/.test(name)) out.push(path);
  }
  return out;
}

test("privacy sentinel is absent from public source and private envelope", () => {
  const sentinel = ["PRIVATE", "_SENTINEL", "_9F2E"].join("");
  const roots = ["apps/web/app", "apps/api/src", "packages/backend/src/publication"];
  for (const root of roots) {
    for (const file of sourceFiles(root)) assert.doesNotMatch(readFileSync(file, "utf8"), new RegExp(sentinel), file);
  }
});

const publicBase = process.env.PRIVACY_SCAN_BASE_URL;
test("privacy sentinel public GET scan", { skip: !publicBase }, async () => {
  const sentinel = ["PRIVATE", "_SENTINEL", "_9F2E"].join("");
  for (const path of ["/", "/demands", "/claims", "/api/site/demands", "/api/site/claims", "/robots.txt", "/sitemap.xml"]) {
    const response = await fetch(`${publicBase}${path}`);
    assert.ok(response.status < 500, `${path} returned ${response.status}`);
    assert.doesNotMatch(await response.text(), new RegExp(sentinel), path);
  }
});
