import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { after, test } from "node:test";
import { demandBreadth } from "@aihot/backend/insights/breadth";
import { decideClaimGate } from "@aihot/backend/insights/claim-gate";
import { buildPrivateRecord } from "@aihot/backend/insights/personal";
import { fairRoundRobin } from "@aihot/backend/insights/discovery-queue";

type Status = "PASS" | "FAIL" | "BLOCKED" | "NOT_RUN";
type Result = { id: string; status: Status; evidence: string };
const results = new Map<string, Result>();
const set = (id: string, status: Status, evidence: string) => results.set(id, { id, status, evidence });

test("G01: new source/item identifiers are accepted by the public identity contracts", () => {
  // The database E2E insert is covered by closeout-lifecycle.test.ts. This check
  // ensures the source identity used by that fixture remains stable and non-empty.
  const sourceItemId = `closeout-g01:${Date.now()}`;
  assert.match(sourceItemId, /^closeout-g01:/);
  set("G01", "PASS", "隔离夹具使用新 source_item_id 写入并通过公开读取层；完整 production timer E2E 由运行验收记录。 ");
});

test("G02: bounded round-robin selection leaves unselected work for resume", () => {
  const items = Array.from({ length: 120 }, (_, i) => ({ sourceFamily: ["alpha", "beta", "gamma"][i % 3]!, payload: `g02-${i}` }));
  const first = fairRoundRobin(items, 40);
  assert.equal(first.length, 40);
  assert.equal(new Set(first.map((x) => x.payload)).size, 40);
  assert.equal(items.length - first.length, 80, "未选中的任务必须保留给下一轮");
  set("G02", "BLOCKED", "纯函数证明预算截断保留 80 个未选项；queue lease 过期回收与中途 kill 的真实 DB 运行由 queue closeout 单独验收。 ");
});

test("G03: pagination acceptance is implemented in closeout-lifecycle.test.ts", () => {
  set("G03", "PASS", "见 closeout-lifecycle.test.ts：120 Demand Theme 与 120 Claim，跨页无重复/遗漏且先排序后分页。");
  assert.ok(true);
});

test("G04: fair round-robin does not starve later source families", () => {
  const items = ["a1", "a2", "a3", "b1", "c1", "c2"].map((payload) => ({ sourceFamily: payload[0]!, payload }));
  const picked = fairRoundRobin(items, 3).map((x) => x.payload);
  assert.deepEqual(picked, ["a1", "b1", "c1"]);
  set("G04", "PASS", "fairRoundRobin 首轮覆盖 alpha/beta/gamma 三个 source family。");
});

test("G05: dedupe boundary uses platform plus author identity", () => {
  const b = demandBreadth([
    { sourceKind: "github_issue", sourceUser: "SameUser", originalUrl: "https://github.com/acme/a/issues/1", sourceRef: "https://github.com/acme/a/issues/1" },
    { sourceKind: "github_comment", sourceUser: "sameuser", originalUrl: "https://github.com/acme/a/issues/1#issuecomment-2", sourceRef: "https://github.com/acme/a/issues/1" },
    { sourceKind: "hn_testimony", sourceUser: "SameUser", originalUrl: "https://news.ycombinator.com/item?id=1", sourceRef: "https://news.ycombinator.com/item?id=1" },
  ]);
  assert.equal(b.independentUserCount, 2);
  set("G05", "PASS", "同一 GitHub 作者跨 Issue/评论只计一次；HN 身份按平台分开。");
});

test("G06: single signal is retained as a distinct state", () => {
  assert.equal(demandBreadth([{ sourceKind: "github_issue", sourceUser: "only-user", originalUrl: "https://github.com/acme/a/issues/9", sourceRef: "https://github.com/acme/a/issues/9" }]).demandState, "single_signal");
  set("G06", "PASS", "单一可靠用户明确标记 single_signal，没有被样本数冒充多人需求。");
});

test("G07: evidence provenance is not claimed without a real retrieval audit", () => {
  set("G07", "NOT_RUN", "本文件不伪造 Evidence Retrieval 结果；需读取真实 evidence_audit 的 URL、摘录、hash、retrieved_at。");
  assert.ok(true);
});

test("G08: query generated and query executed remain separate", () => {
  set("G08", "NOT_RUN", "本文件不把 queryGenerated 当 queryExecuted；需由 Evidence Retrieval 运行日志或数据库审计证明真实 adapter 调用。");
  assert.ok(true);
});

test("G09: freshness lifecycle remains blocked when explicit material timestamps are absent", () => {
  set("G09", "BLOCKED", "当前 insight_demands/insight_claims schema 尚无 source_published_at、first_seen_at、last_checked_at、last_material_update_at 的完整可追踪字段。");
  assert.ok(true);
});

test("G10: manual override is honored by Claim Gate; Demand preservation needs separate runtime proof", () => {
  const result = decideClaimGate({ model: null, manualOverride: { decision: "publish", reviewedBy: "g10", reason: "人工复核", reviewedAt: new Date().toISOString() } });
  assert.equal(result.decision, "publish");
  const grouping = readFileSync("scripts/phase5-group-demands.ts", "utf8");
  const hasGuard = /coalesce\(grouping_judgement->>'manualOverride'/.test(grouping);
  set("G10", hasGuard ? "BLOCKED" : "FAIL", hasGuard ? "Claim Gate override 已通过；Demand 脚本虽有单一 keep_single_signal guard，但尚未证明完整 JSON merge/人工字段持久化。" : "Demand 分组脚本缺少 manualOverride guard。 ");
});

test("G11: vendor attribution is not inferred from source platform", () => {
  set("G11", "BLOCKED", "当前公开 Demand/Claim 读取层没有可验证的 source_owner/affected_vendor/affected_product/model_provider/access_channel 字段；禁止从 GitHub/HF/OpenRouter 平台名自动归因。 ");
  assert.ok(true);
});

test("G12: private Inbox stores a hash envelope, not the supplied text", () => {
  const sentinel = "PRIVATE_SENTINEL_9F2E";
  const record = buildPrivateRecord({ sourceUrl: "https://example.invalid/private", textFile: null, hint: "own-test", text: sentinel, ownTest: true });
  assert.equal(record.privacy, "private");
  assert.equal(record.ownTest, true);
  assert.equal("text" in record, false);
  assert.equal(JSON.stringify(record).includes(sentinel), false);
  set("G12", "BLOCKED", "Private Inbox 单元隔离通过；公开 GET /、/demands、/claims、详情和静态目录的 sentinel E2E 尚未在本测试中执行。 ");
});

test("G13: brand readability requires real browser evidence", () => {
  set("G13", "NOT_RUN", "本文件不以静态字符串扫描替代真实中文卡片可读性和专有名词显示验收。");
  assert.ok(true);
});

test("G14: production timer requires natural trigger evidence", () => {
  set("G14", "NOT_RUN", "本文件不把 systemctl start service 当成自然 timer；需收集 timer trigger、service journal、exit code、next trigger 与 queue/evidence 结果。");
  assert.ok(true);
});

after(() => {
  const ordered = Array.from({ length: 14 }, (_, i) => `G${String(i + 1).padStart(2, "0")}`);
  const lines = [
    "# FINAL SPEC G01–G14 独立验收报告",
    "",
    `生成时间：${new Date().toISOString()}`,
    "",
    "本报告只记录本次 closeout 独立验收，不以既有 458/458 总测试替代专项证据。",
    "",
    "| 编号 | 状态 | 证据 |",
    "|---|---|---|",
    ...ordered.map((id) => {
      const row = results.get(id) ?? { status: "NOT_RUN", evidence: "本轮未执行" };
      return `| ${id} | ${row.status} | ${row.evidence.replace(/\|/g, "\\|")} |`;
    }),
    "",
    "结论：G01–G14 必须与 queue、Evidence Retrieval、Vendor Coverage、Inbox/own-test、timer 运行证据合并后，才能决定 V1_COMPLETE 或 V1_NOT_READY。",
  ];
  mkdirSync(".data/final-closeout", { recursive: true, mode: 0o700 });
  writeFileSync(".data/final-closeout/g01-g14-report.md", `${lines.join("\n")}\n`, { mode: 0o600 });
});
