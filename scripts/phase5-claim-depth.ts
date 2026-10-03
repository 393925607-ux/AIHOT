/** Evidence depth: execute public retrieval adapters, then deep-read and judge bounded candidates. */
import { z } from "zod";
import { closeDb, sql } from "@aihot/backend/db";
import { claimStatus, publicCanonical, type VerifiedEvidence } from "@aihot/backend/insights/validity";
import { retrieveEvidence } from "@aihot/backend/insights/evidence-retrieval";
import { sha256 } from "@aihot/backend/lib/ids";
import { judge } from "./phase4-common.ts";
import { exactRelation } from "@aihot/backend/insights/claim-gate";

type Claim = { id: number; claim: string; claimant: string; original_source: string; evidence: VerifiedEvidence[] | null; status: string; evidence_audit: Record<string, unknown> | null };
const Relation = z.object({ relation: z.string().optional(), verdict: z.string().optional(), judgment: z.string().optional(), confidence: z.string().optional(), quote: z.string().optional(), reason: z.string().optional() });
function normalize(raw: z.infer<typeof Relation>) {
  const relation = exactRelation(raw.relation ?? raw.verdict ?? raw.judgment ?? "");
  if (!relation) throw new Error("unknown_relation");
  const c = (raw.confidence ?? "medium").toLowerCase();
  return { relation, confidence: (c.includes("high") || c.includes("高") ? "high" : c.includes("low") || c.includes("低") ? "low" : "medium") as "high" | "medium" | "low", quote: (raw.quote ?? "").slice(0, 600), reason: (raw.reason ?? "").slice(0, 400) };
}
function sameJson(a: unknown, b: unknown) { return sha256(JSON.stringify(a)) === sha256(JSON.stringify(b)); }
function queryIntents(claim: Claim): string[] {
  const text = claim.claim.replace(/\s+/g, " ").trim().slice(0, 180);
  return [text, `${claim.claimant} ${text}`, `${text} benchmark results methodology`, "AI benchmark independent results"].filter((x, i, arr) => x.length >= 8 && arr.indexOf(x) === i).slice(0, 4);
}
async function main() {
  const claims = await sql<Claim[]>`SELECT id, claim, claimant, original_source, evidence, status, evidence_audit FROM insight_claims WHERE strong_claim ORDER BY id`;
  let fetched = 0, deepRead = 0, judged = 0, supports = 0, conflicts = 0, queryExecuted = 0;
  for (const claim of claims) {
    const intents = queryIntents(claim);
    const retrieved = await retrieveEvidence(intents);
    const claimExecuted = retrieved.audits.filter((x) => x.status === "success" || x.status === "no_result").length;
    const claimDeepRead = retrieved.deepReads.filter((x) => x.status === "ok").length;
    queryExecuted += claimExecuted;
    fetched += claimDeepRead;
    deepRead += claimDeepRead;
    const additions: VerifiedEvidence[] = [];
    let claimJudged = 0;
    let claimSupports = 0;
    let claimConflicts = 0;
    for (const item of retrieved.deepReads.filter((x) => x.status === "ok").slice(0, 5)) {
      try {
        const result = await judge("claim_evidence_depth_v6", `claim:${claim.id}:${item.canonicalUrl}`, "判断候选网页是否对原始 Claim 提供直接证据。只返回 JSON。supports 仅用于明确测量/复现同一主张；conflicts 仅用于相同指标和条件下明确相反结果；相关背景、转载、同源材料或缺少可比条件用 related；完全无关用 unrelated。quote 必须逐字来自候选文本。", { claim: { id: claim.id, text: claim.claim, claimant: claim.claimant, originalSource: claim.original_source }, candidate: { url: item.canonicalUrl, text: item.text.slice(0, 7000) } }, Relation, 1300);
        const r = normalize(result.data); judged++; claimJudged++;
        if (r.relation === "unrelated") continue;
        const sourceHost = new URL(claim.original_source).hostname.replace(/^www\./, "");
        const candidateHost = new URL(item.canonicalUrl).hostname.replace(/^www\./, "");
        const sameSource = sourceHost === candidateHost || publicCanonical(item.canonicalUrl) === publicCanonical(claim.original_source);
        const direct = r.relation === "supports" || r.relation === "conflicts";
        const independent = direct && !sameSource;
        const kind = direct && !sameSource ? (r.relation === "supports" ? "support" : "conflict") : "related";
        additions.push({ kind, url: item.canonicalUrl, quote: r.quote, original_quote: r.quote, source: item.title, independenceKey: candidateHost, independent, confidence: r.confidence });
        if (kind === "support" && independent) { supports++; claimSupports++; }
        if (kind === "conflict" && independent) { conflicts++; claimConflicts++; }
      } catch { /* preserve fetched material; failed judgement is audited on the next run */ }
    }
    const merged = [...(claim.evidence ?? []), ...additions];
    const dedup = new Map<string, VerifiedEvidence>();
    for (const evidence of merged) {
      const normalized = (evidence.kind === "support" || evidence.kind === "conflict") && evidence.independent !== true ? { ...evidence, kind: "related" as const } : evidence;
      dedup.set(`${normalized.kind}:${publicCanonical(normalized.url)}:${normalized.quote}`, normalized);
    }
    const evidence = [...dedup.values()];
    const status = claimStatus(evidence);
    const audit = {
      phase: 6, retrievalVersion: "v6-public-adapters", updatedAt: new Date().toISOString(), queryIntents: intents,
      queryGenerated: intents.length, queryExecuted: claimExecuted, searchStatus: retrieved.audits.some((x) => x.status === "success") ? "executed" : retrieved.audits.some((x) => x.status === "blocked") ? "blocked" : "no_result",
      adapters: retrieved.audits, candidates: retrieved.candidates.map((x) => ({ url: x.url, title: x.title, adapterId: x.adapterId, sourceDate: x.sourceDate })),
      fetched: retrieved.deepReads.filter((x) => x.status === "ok").map((x) => ({ url: x.canonicalUrl, retrievedAt: x.retrievedAt, contentHash: x.contentHash, excerpt: x.excerpt, fetchStatus: x.fetchStatus })),
      deepRead: claimDeepRead, relationJudged: claimJudged, independentSupports: claimSupports, independentConflicts: claimConflicts,
      tierCounts: { A: 0, B: 0, C: retrieved.candidates.length, D: 0 }, noResult: retrieved.audits.filter((x) => x.status === "no_result").length, blocked: retrieved.audits.filter((x) => x.status === "blocked").length,
    };
    const missing = status === "未验证" ? `已执行 ${intents.length} 组检索并深读 ${claimDeepRead} 个页面，尚未找到可独立复现“${claim.claim.slice(0, 80)}”的公开测试条件、原始数据和结果。` : status === "部分支持" ? "已有直接材料，仍需第二个可核对相同指标和测试条件的独立来源。" : "";
    const evidenceChanged = !sameJson(claim.evidence ?? [], evidence);
    const auditChanged = !sameJson(claim.evidence_audit ?? null, audit);
    if (evidenceChanged) await sql`UPDATE insight_claims SET evidence=${sql.json(evidence as never)}, evidence_audit=${sql.json(audit as never)}, status=${status}, missing_evidence=${missing}, evidence_updated_at=now(), relation_reviewed=true WHERE id=${claim.id}`;
    else if (auditChanged) await sql`UPDATE insight_claims SET evidence_audit=${sql.json(audit as never)}, status=${status}, missing_evidence=${missing}, relation_reviewed=true WHERE id=${claim.id}`;
  }
  console.log(JSON.stringify({ ok: true, claims: claims.length, queryExecuted, fetched, deepRead, judged, independentSupports: supports, independentConflicts: conflicts }));
}
try { await main(); } finally { await closeDb(); }
