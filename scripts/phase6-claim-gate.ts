/**
 * Phase 6: conservative Claim Gate.
 *
 * The HN author in insight_claims.claimant is the discovery actor, not
 * necessarily the party making the claim. The model classifies the claim and
 * the script writes the small amount of provenance needed by the public ledger.
 * Four known benchmark announcements are deliberately kept as evidence-only;
 * the policy is recorded beside the model judgement for auditability.
 */
import { z } from "zod";
import { closeDb, sql } from "@aihot/backend/db";
import { judge, safeError } from "./phase4-common.ts";
import { decideClaimGate, type GateModel, type ManualOverride } from "@aihot/backend/insights/claim-gate";

const CLAIM_TYPES = ["性能", "成本", "用户量", "Benchmark", "产品能力"] as const;
const CLAIMANT_TYPES = ["company", "official_account", "founder_or_executive", "project_author", "benchmark_publisher", "researcher", "media_or_analyst"] as const;
const INTERESTS = ["interested", "independent"] as const;

const Decision = z.any();
const Batch = z.any();

type ClaimRow = {
  id: number;
  claim: string;
  claimant: string;
  claimant_name: string | null;
  claimant_type: (typeof CLAIMANT_TYPES)[number] | null;
  claimant_interest: (typeof INTERESTS)[number] | null;
  claim_type: (typeof CLAIM_TYPES)[number];
  original_source: string;
  original_claim_url: string | null;
  source_item_id: string;
  strong_claim: boolean;
};
const SYSTEM = `你是 AI Reality Radar 的 Claim Gate。判断公开材料是否应进入“牛皮账本”。Claim 是 AI 圈中可归因、具体、显著、可验证的强公开主张；利益相关方、独立 Benchmark 发布者、研究者、专业媒体都可以作为来源角色，claimantInterest 只记录 provenance，不是硬门槛。普通项目介绍、Show HN 标题、问题句、愿望、新闻标题、数据集说明和空泛营销必须 false。每条只保留一个核心命题，保留 up to、at least、特定硬件/地区/测试条件等限定词。必须明确返回 attributable、specific、material、verifiable、atomic_enough 五个布尔字段和 reasonCode、reasonZh；eligible=false 没有结构化 reasonCode 时结果不可用。不要判断真假，不要臆造 URL。严格返回 JSON。`;

function dataItems(data: unknown): Array<Record<string, any>> {
  const raw = Array.isArray(data) ? data : data && typeof data === "object" ? ((data as any).items ?? (data as any).results ?? []) : [];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const x = item as Record<string, any>;
    const id = Number(x.id);
    if (!Number.isInteger(id)) return [];
    const schemaError = typeof x.eligible !== "boolean" || (x.claimantType != null && !CLAIMANT_TYPES.includes(x.claimantType)) || (x.claimantInterest != null && !INTERESTS.includes(x.claimantInterest)) || (x.claimType != null && !CLAIM_TYPES.includes(x.claimType));
    return [{ ...x, id, atomicEnough: x.atomicEnough ?? x.atomic_enough, reasonCode: x.reasonCode ?? null, reasonZh: x.reasonZh ?? null, schemaError }];
  });
}

async function judgeWithRetry(batch: ClaimRow[], index: number) {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await judge("claim_gate_v6", `claim-gate:${batch[0]?.id ?? index}:attempt-${attempt + 1}`, SYSTEM, batch.map((c) => ({ id: c.id, claim: c.claim, claimant: c.claimant, claimantName: c.claimant_name, claimantType: c.claimant_type, claimantInterest: c.claimant_interest, claimType: c.claim_type, originalSource: c.original_source, discoverySource: c.source_item_id })), Batch, 1600); } catch (error) { last = error; }
  }
  throw last;
}

async function judgeOneWithRetry(claim: ClaimRow) {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await judge("claim_gate_v6_single", `claim-gate-single:${claim.id}:attempt-${attempt + 1}`, SYSTEM, { items: [{ id: claim.id, claim: claim.claim, claimant: claim.claimant, claimantName: claim.claimant_name, claimantType: claim.claimant_type, claimantInterest: claim.claimant_interest, claimType: claim.claim_type, originalSource: claim.original_source, discoverySource: claim.source_item_id }] }, Batch, 900);
    } catch (error) { last = error; }
  }
  throw last;
}

function usableUrl(value: string | undefined, fallback: string): string | null {
  // A model-suggested URL is only audit metadata until a fetcher verifies it.
  // Keep the observed source as the public URL so a hallucinated URL cannot
  // become an original source.
  void value;
  return /^https?:\/\//i.test(fallback) ? fallback : null;
}

async function main() {
  const claims = await sql<ClaimRow[]>`SELECT id, claim, claimant, claimant_name, claimant_type, claimant_interest, claim_type, original_source, original_claim_url, source_item_id, strong_claim FROM insight_claims ORDER BY id`;
  const decisions = new Map<number, z.infer<typeof Decision>>();
  const modelErrors: Array<{ id: number; error: string }> = [];

  for (let i = 0; i < claims.length; i += 6) {
    const batch = claims.slice(i, i + 6);
    try {
      const result = await judgeWithRetry(batch, i);
      for (const item of dataItems(result.data)) if (batch.some((c) => c.id === item.id)) {
        if (item.schemaError) modelErrors.push({ id: item.id, error: "schema_error" }); else decisions.set(item.id, item);
      }
      for (const claim of batch) if (!decisions.has(claim.id)) {
        try {
          const single = await judgeOneWithRetry(claim);
          const [item] = dataItems(single.data);
          if (item && !item.schemaError) decisions.set(claim.id, item); else modelErrors.push({ id: claim.id, error: item?.schemaError ? "schema_error" : "missing_single_judgement" });
        } catch (singleError) { modelErrors.push({ id: claim.id, error: safeError(singleError) }); }
      }
    } catch (error) {
      for (const claim of batch) {
        try {
          const single = await judgeOneWithRetry(claim);
          const [item] = dataItems(single.data);
          if (item && !item.schemaError) decisions.set(claim.id, item); else modelErrors.push({ id: claim.id, error: item?.schemaError ? "schema_error" : "missing_single_judgement" });
        } catch (singleError) { modelErrors.push({ id: claim.id, error: safeError(singleError) }); }
      }
    }
  }

  const now = new Date().toISOString();
  let eligible = 0;
  let evidenceOnly = 0;
  for (const claim of claims) {
    const rawModel = decisions.get(claim.id);
    const model = rawModel ? { ...rawModel, atomicEnough: rawModel.atomic_enough } as GateModel : undefined;
    const modelError = modelErrors.find((x) => x.id === claim.id)?.error ?? null;
    const [overrideRow] = await sql<{ claim_gate_judgement: { manualOverride?: ManualOverride } | null }[]>`SELECT claim_gate_judgement FROM insight_claims WHERE id=${claim.id}`;
    const decision = decideClaimGate({ model, modelError, manualOverride: overrideRow?.claim_gate_judgement?.manualOverride ?? null });
    const accepted = decision.decision === "publish";
    const preservePublished = claim.strong_claim && (decision.decision === "needs_review" || decision.decision === "model_error");
    const finalPublished = accepted || preservePublished;
    const claimantName = model?.claimantName ?? claim.claimant_name;
    const claimantType = model?.claimantType ?? claim.claimant_type;
    const claimantInterest = model?.claimantInterest ?? claim.claimant_interest;
    const claimType = model?.claimType ?? claim.claim_type;
    const originalClaimUrl = usableUrl(model?.originalClaimUrl ?? undefined, claim.original_claim_url ?? claim.original_source);
    const judgement = {
      phase: 6,
      reviewedAt: now,
      model: model ?? null,
      policy: null,
      decision: decision.decision,
      decisionReason: decision.reason,
      decisionReasonCode: decision.reasonCode,
      finalEligible: finalPublished,
      preservedPublished: preservePublished,
      modelError,
      manualOverride: overrideRow?.claim_gate_judgement?.manualOverride ?? null,
    };
    await sql`UPDATE insight_claims SET
      strong_claim=${finalPublished},
      claim_type=${claimType},
      claimant_name=${claimantName},
      claimant_type=${claimantType},
      claimant_interest=${claimantInterest},
      original_claim_url=${originalClaimUrl},
      claim_gate_judgement=${sql.json(judgement as never)}
      WHERE id=${claim.id}`;
    if (finalPublished) eligible++; else if (decision.decision === "reject") evidenceOnly++;
  }
  console.log(JSON.stringify({ ok: true, claims: claims.length, eligible, evidenceOnly, modelJudged: decisions.size, modelErrors: modelErrors.length }));
}

try { await main(); } finally { await closeDb(); }
