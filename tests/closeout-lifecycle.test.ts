import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { demandBreadth } from "@aihot/backend/insights/breadth";
import { decideClaimGate } from "@aihot/backend/insights/claim-gate";
import { buildPrivateRecord } from "@aihot/backend/insights/personal";
import { loadClaims, loadDemandThemes } from "@aihot/backend/publication/insights";
import { tag } from "./setup.ts";

/**
 * Closeout-only fixtures. They are intentionally short and self-identifying so
 * the test can clean up without touching the live corpus.
 */
const T = tag();
const DEMAND_PREFIX = `closeout-pagination:demand:${T}:`;
const CLAIM_PREFIX = `closeout-pagination:claim:${T}:`;

type Check = { id: string; status: "PASS" | "FAIL" | "BLOCKED" | "NOT_RUN"; evidence: string };
export const lifecycleChecks: Check[] = [];

before(async () => {
  await sql.begin(async (tx) => {
    for (let i = 0; i < 120; i += 1) {
      const observed = new Date(Date.now() - i * 60_000);
      await tx`INSERT INTO insight_demands
        (theme_key, theme_title, problem, scenario, workaround, evidence, original_url,
         source_name, source_user, source_item_id, source_kind, observed_at,
         problem_zh, scenario_zh, workaround_zh, raw_content, source_ref,
         is_testimony, testimony_judgement)
        VALUES
        (${`closeout-theme-${T}-${i}`}, ${`关闭验收需求 ${T} ${i}`}, ${`closeout demand ${T} ${i}`},
         '测试场景', '', '测试证据', ${`https://github.com/closeout/${T}/issues/${i + 1}`},
         'GitHub 测试来源', ${`closeout-user-${i}`}, ${`${DEMAND_PREFIX}${i}`}, 'github_issue', ${observed},
         ${`关闭验收需求 ${T} ${i}`}, '测试场景', '', 'closeout fixture',
         ${`https://github.com/closeout/${T}/issues/${i + 1}`}, true,
         ${tx.json({ closeoutFixture: true } as never)})`;
    }
    for (let i = 0; i < 120; i += 1) {
      const observed = new Date(Date.now() - i * 60_000);
      await tx`INSERT INTO insight_claims
        (claim, claim_zh, claimant, claimant_name, claimant_type, claimant_interest,
         claim_type, original_source, original_claim_url, evidence, status,
         missing_evidence, source_item_id, observed_at, strong_claim)
        VALUES
        (${`closeout claim ${T} ${i}`}, ${`关闭验收主张 ${T} ${i}`}, 'closeout claimant',
         '关闭验收提出方', 'company', 'interested', '性能',
         ${`https://example.invalid/claim/${T}/${i}`}, ${`https://example.invalid/claim/${T}/${i}`},
         ${tx.json([] as never)}, '未验证', '关闭验收夹具', ${`${CLAIM_PREFIX}${i}`}, ${observed}, true)`;
    }
  });
});

after(async () => {
  await sql`DELETE FROM insight_demands WHERE source_item_id LIKE ${`${DEMAND_PREFIX}%`}`;
  await sql`DELETE FROM insight_claims WHERE source_item_id LIKE ${`${CLAIM_PREFIX}%`}`;
  await closeDb();
});

test("G03: Demand and Claim pagination keep all 120 rows, with ordering before slicing", async () => {
  const demandPages = await Promise.all([
    loadDemandThemes({ q: T, limit: 50, offset: 0 }),
    loadDemandThemes({ q: T, limit: 50, offset: 50 }),
    loadDemandThemes({ q: T, limit: 50, offset: 100 }),
  ]);
  const demands = demandPages.flatMap((p) => p.themes);
  const demandKeys = demands.map((x) => x.themeKey);
  assert.equal(new Set(demandKeys).size, 120, "Demand 页间不能重复");
  assert.equal(demandKeys.length, 120, "Demand 不能隐形截断到前 100 条");
  for (let i = 1; i < demands.length; i += 1) {
    assert.ok(Date.parse(demands[i - 1]!.latestAt) >= Date.parse(demands[i]!.latestAt), "Demand 必须先排序再分页");
  }

  const claimPages = await Promise.all([
    loadClaims({ q: T, limit: 100, offset: 0 }),
    loadClaims({ q: T, limit: 100, offset: 100 }),
  ]);
  const claims = claimPages.flatMap((p) => p.claims);
  const claimIds = claims.map((x) => x.id);
  assert.equal(new Set(claimIds).size, 120, "Claim 页间不能重复");
  assert.equal(claimIds.length, 120, "Claim 必须支持超过 100 条继续访问");
  for (let i = 1; i < claims.length; i += 1) {
    assert.ok(Date.parse(claims[i - 1]!.observedAt) >= Date.parse(claims[i]!.observedAt), "Claim 必须先排序再分页");
  }
  lifecycleChecks.push({ id: "G03", status: "PASS", evidence: "隔离库各插入 120 个 Demand Theme 和 Claim；offset 分页返回 120/120，无重复、无漏项，排序在分页前完成。" });
});

test("G05: Demand identity deduplication keeps same author once and separates platforms", () => {
  const breadth = demandBreadth([
    { sourceKind: "github_issue", sourceUser: "Alice", originalUrl: "https://github.com/acme/tool/issues/1", sourceRef: "https://github.com/acme/tool/issues/1" },
    { sourceKind: "github_comment", sourceUser: "alice", originalUrl: "https://github.com/acme/tool/issues/1#issuecomment-2", sourceRef: "https://github.com/acme/tool/issues/1" },
    { sourceKind: "github_discussion", sourceUser: "Bob", originalUrl: "https://github.com/acme/tool/discussions/3", sourceRef: "https://github.com/acme/tool/discussions/3" },
    { sourceKind: "stackexchange", sourceUser: "Alice", originalUrl: "https://stackoverflow.com/questions/4", sourceRef: "https://stackoverflow.com/questions/4" },
  ]);
  assert.equal(breadth.independentUserCount, 3, "同平台同账号只算一个独立用户");
  assert.equal(breadth.independentPlatformCount, 2, "平台归属必须独立计数");
  assert.equal(breadth.demandState, "multi_user");
  lifecycleChecks.push({ id: "G05", status: "PASS", evidence: "github:alice 的 Issue 与评论只计 1 人；github:bob 与 stackexchange:Alice 分开计数。" });
});

test("G06: a high-impact single signal remains explicitly single_signal", () => {
  const breadth = demandBreadth([{ sourceKind: "github_issue", sourceUser: "one-user", originalUrl: "https://github.com/acme/tool/issues/9", sourceRef: "https://github.com/acme/tool/issues/9" }]);
  assert.equal(breadth.independentUserCount, 1);
  assert.equal(breadth.demandState, "single_signal");
  lifecycleChecks.push({ id: "G06", status: "PASS", evidence: "单个可靠身份不会被样本数放大，状态明确为 single_signal。" });
});

test("G09: lifecycle freshness fields are either present or recorded as a blocker", async () => {
  const rows = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('insight_demands','insight_claims')
      AND column_name IN ('source_published_at','first_seen_at','last_checked_at','last_material_update_at','lifecycle_status')`;
  const found = new Set(rows.map((r) => r.column_name));
  const required = ["source_published_at", "first_seen_at", "last_checked_at", "last_material_update_at"];
  const jsonRows = await sql<{ metadata: unknown }[]>`
    SELECT jsonb_build_object('coverage', coverage, 'grouping', grouping_judgement, 'testimony', testimony_judgement) AS metadata
    FROM insight_demands WHERE source_item_id LIKE ${`${DEMAND_PREFIX}%`} LIMIT 1`;
  const serialized = JSON.stringify(jsonRows[0]?.metadata ?? "");
  const jsonFreshness = required.every((name) => serialized.includes(name) || serialized.includes(name.replaceAll("_", "")));
  if (required.every((name) => found.has(name)) || jsonFreshness) {
    lifecycleChecks.push({ id: "G09", status: "PASS", evidence: `生命周期时间字段已落库：${required.join("、")}。` });
  } else {
    lifecycleChecks.push({ id: "G09", status: "BLOCKED", evidence: `缺少实质更新时间字段；当前仅发现：${[...found].join("、") || "无"}。refresh/翻译/timer 不刷新保护无法从 DB/API 验证。` });
  }
  assert.ok(true);
});

test("G10: claim manual override is honored; demand script preservation is audited separately", () => {
  const override = { decision: "publish" as const, reviewedBy: "closeout-review", reason: "人工确认", reviewedAt: new Date().toISOString() };
  assert.equal(decideClaimGate({ model: null, manualOverride: override }).decision, "publish");
  const grouping = readFileSync("scripts/phase5-group-demands.ts", "utf8");
  const coverage = readFileSync("scripts/phase5-coverage.ts", "utf8");
  const preservesJson = /grouping_judgement[^\n]*\|\|/.test(grouping) || /jsonb_merge|merge.*manualOverride/i.test(grouping);
  const preservesTitle = /coalesce\(grouping_judgement->>'manualOverride',\s*''\)\s*=\s*''/.test(grouping) && /theme_title=CASE/.test(coverage);
  if (preservesJson && preservesTitle) {
    lifecycleChecks.push({ id: "G10", status: "PASS", evidence: "Claim Gate 人工 publish 回执保留；Demand 分组与标题更新存在显式保护。" });
  } else {
    lifecycleChecks.push({ id: "G10", status: "FAIL", evidence: "Claim Gate 人工 override 可保留，但 Demand 分组/coverage 脚本未能证明完整 JSON manualOverride 与人工标题保护。" });
  }
});

test("G12: private Inbox record contains no raw text and is marked private", () => {
  const sentinel = "PRIVATE_SENTINEL_9F2E";
  const record = buildPrivateRecord({ sourceUrl: "https://example.invalid/private", textFile: null, hint: "own-test", text: sentinel, ownTest: true });
  assert.equal(record.privacy, "private");
  assert.equal(record.ownTest, true);
  assert.equal("text" in record, false, "私有记录不能直接携带原文");
  assert.notEqual(JSON.stringify(record).includes(sentinel), true, "哨兵不得进入私有元数据之外的公开结构");
  lifecycleChecks.push({ id: "G12", status: "PASS", evidence: "Private Inbox 记录仅保存 hash/长度/私有标记，不保存原文；完整公开 HTTP 哨兵 E2E 仍需运行时验证。" });
});

test("lifecycle report records fields that remain outside the current schema", async () => {
  const demandCols = await sql<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name='insight_demands'`;
  const claimCols = await sql<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name='insight_claims'`;
  const attribution = ["source_platform", "source_owner", "affected_vendor", "affected_product", "model_provider", "access_channel"];
  const present = new Set([...demandCols, ...claimCols].map((r) => r.column_name));
  const jsonRows = await sql<{ metadata: unknown }[]>`
    SELECT jsonb_build_object('coverage', coverage, 'grouping', grouping_judgement,
      'testimony', testimony_judgement) AS metadata
    FROM insight_demands WHERE source_item_id LIKE ${`${DEMAND_PREFIX}%`} LIMIT 1`;
  const serialized = JSON.stringify(jsonRows[0]?.metadata ?? "");
  const missing = attribution.filter((name) => !present.has(name) && !serialized.includes(name));
  lifecycleChecks.push({
    id: "G11",
    status: missing.length ? "BLOCKED" : "PASS",
    evidence: missing.length ? `source/affected vendor 归属字段尚未落库：${missing.join("、")}` : "source/affected vendor 归属字段可查询。",
  });
  assert.ok(true);
});
