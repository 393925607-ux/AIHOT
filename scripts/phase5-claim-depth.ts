/** Phase 5: retrieve a small, curated set of public evidence candidates for eligible Claims. */
import { z } from "zod";
import { closeDb, sql } from "@aihot/backend/db";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { claimStatus, publicCanonical, type VerifiedEvidence } from "@aihot/backend/insights/validity";
import { judge } from "./phase4-common.ts";
import { exactRelation } from "@aihot/backend/insights/claim-gate";

type Claim = { id: number; claim: string; claimant: string; original_source: string; evidence: VerifiedEvidence[]; status: string };
type Candidate = { url: string; label: string; independence?: "independent" | "same_source" | "reprint"; tier: "A" | "B" | "C" | "D" };
const candidates: Record<number, Candidate[]> = {
  165: [{ url: "https://bito.ai/blog/inside-our-coding-model-cost-research/", label: "Bito 方法说明", independence: "same_source", tier: "A" }],
  177: [{ url: "https://labs.scale.com/leaderboard/drugdiscoverybench", label: "Scale DrugDiscoveryBench", independence: "independent", tier: "C" }],
  181: [
    { url: "https://kie.ai/blog/qwen-image-2-1-vs-nano-banana-2-0", label: "Kie 独立资料整理", independence: "independent", tier: "C" },
    { url: "https://www.gradually.ai/en/ai-image-model-comparison/nano-banana-2-vs-qwen-image-2-1/", label: "Gradually 对比方法", independence: "independent", tier: "C" },
    { url: "https://blog.buildfastwithai.com/qwen-image-2-1-review", label: "BuildFastWithAI 复核报道", independence: "reprint", tier: "C" },
  ],
  183: [{ url: "https://krisp.ai/blog/voice-isolation-benchmark/", label: "Krisp Benchmark 原始页", independence: "same_source", tier: "A" }],
  186: [
    { url: "https://the-decoder.com/xai-launches-grok-4-7-at-bargain-prices-but-benchmarks-reveal-a-wide-gap-to-claude-and-gpt-6/", label: "The Decoder 独立报道", independence: "independent", tier: "C" },
    { url: "https://capitalandcompute.net/blog/grok-4-7-benchmarks/", label: "Capital & Compute 方法分析", independence: "independent", tier: "C" },
  ],
  195: [{ url: "https://oliverdb.ai/snowflake.html", label: "OliverDB Snowflake 对比", independence: "same_source", tier: "A" }, { url: "https://oliverdb.ai/blog/244-queries.html", label: "OliverDB 244 查询方法", independence: "same_source", tier: "A" }, { url: "https://devcuration.com/articles/oliverai-pre-seed-oliverdb-agent-native-data", label: "DevCuration 外部报道", independence: "reprint", tier: "C" }],
  199: [{ url: "https://www.askcooper.ai/labs/insurance-agent-benchmark", label: "AskCooper Benchmark 原始页", independence: "same_source", tier: "A" }],
};
const Relation = z.object({ relation: z.string(), confidence: z.string().optional(), quote: z.string().optional(), reason: z.string().optional() });
const VerdictOutput = z.object({ claim_id: z.number().optional(), verdict: z.string(), quote: z.string().optional(), reason: z.string().optional() });
const JudgmentOutput = z.object({ claim_id: z.number().optional(), judgment: z.string(), quote: z.string().optional(), reason: z.string().optional() });
const RelationOutput = z.union([Relation, VerdictOutput, JudgmentOutput, z.object({ result: Relation }), z.object({ judgement: Relation })]);
function normalizeRelation(raw: z.infer<typeof Relation> | z.infer<typeof VerdictOutput> | z.infer<typeof JudgmentOutput>) {
  const r = ("verdict" in raw ? raw.verdict : "judgment" in raw ? raw.judgment : raw.relation);
  const relation = exactRelation(r);
  if (!relation) throw new Error("unknown_relation");
  const c = ("confidence" in raw ? raw.confidence ?? "medium" : "medium").toLowerCase();
  const confidence = c.includes("high") || c.includes("高") ? "high" : c.includes("low") || c.includes("低") ? "low" : "medium";
  return { relation, confidence, quote: (raw.quote ?? "").slice(0, 600), reason: (raw.reason ?? "").slice(0, 400) } as const;
}
function cleanText(html: string) { return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 12000); }
function domain(url: string) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "unknown"; } }
async function fetchCandidate(c: Candidate) {
  try {
    const res = await guardedFetch(c.url, { timeoutMs: 18_000, maxBytes: 4 * 1024 * 1024 });
    if (res.status !== 200) return { ...c, text: "", fetchStatus: `http_${res.status}` };
    return { ...c, text: cleanText(res.text()), fetchStatus: "ok" };
  } catch (error) { return { ...c, text: "", fetchStatus: error instanceof Error ? error.name : "fetch_error" }; }
}
async function main() {
  const claims = await sql<Claim[]>`SELECT id, claim, claimant, original_source, evidence, status FROM insight_claims WHERE strong_claim ORDER BY id`;
  let judged = 0, fetched = 0, supports = 0, conflicts = 0;
  for (const claim of claims) {
    const got = await Promise.all((candidates[claim.id] ?? []).map(fetchCandidate));
    fetched += got.filter(x => x.fetchStatus === "ok").length;
    const audit: Record<string, unknown> = { phase: 5, searchedAt: new Date().toISOString(), candidates: got.map(x => ({ url: x.url, label: x.label, domain: domain(x.url), fetchStatus: x.fetchStatus, independence: x.independence, tier: x.tier })) };
    const additions: VerifiedEvidence[] = [];
    for (const item of got.filter(x => x.text.length >= 120)) {
      let relation: ReturnType<typeof normalizeRelation>;
      try {
        const result = await judge("claim_evidence_depth_v5", `claim:${claim.id}:${domain(item.url)}`, "判断候选网页是否对原始 Claim 提供直接证据。只返回 JSON。supports 只用于候选明确测量/复现了同一主张；conflicts 只用于明确反驳同一主张或在相同指标上给出相反结果；只有相关背景、转载、同源材料或缺少相同测试条件才用 related；完全无关用 unrelated。quote 必须逐字来自候选文本，不得补写。", { claim: { id: claim.id, text: claim.claim, claimant: claim.claimant, originalSource: claim.original_source }, candidate: { url: item.url, source: item.label, domain: domain(item.url), text: item.text.slice(0, 7000) } }, RelationOutput, 1800);
        const raw = result.data; relation = normalizeRelation("relation" in raw || "verdict" in raw || "judgment" in raw ? raw : "result" in raw ? raw.result : raw.judgement); judged++;
      } catch (error) { audit[`error_${domain(item.url)}`] = error instanceof Error ? error.message.slice(0, 240) : "judge_failed"; continue; }
      if (relation.relation === "unrelated") continue;
      const same = publicCanonical(item.url) === publicCanonical(claim.original_source) || domain(item.url) === domain(claim.original_source);
      const direct = relation.relation === "supports" || relation.relation === "conflicts";
      const independent = direct && !same && item.independence === "independent";
      const kind = direct && !same ? (relation.relation === "supports" ? "support" : "conflict") : "related";
      additions.push({ kind, url: item.url, quote: relation.quote, source: item.label, original_quote: relation.quote, independenceKey: domain(item.url), independent, confidence: relation.confidence as "high" | "medium" | "low" });
      if (relation.relation === "supports" && independent) supports++;
      if (relation.relation === "conflicts" && independent) conflicts++;
    }
    const dedup = new Map<string, VerifiedEvidence>();
    for (const e of [...(claim.evidence ?? []), ...additions]) { const normalized = (e.kind === "support" || e.kind === "conflict") && e.independent !== true ? { ...e, kind: "related" as const } : e; dedup.set(`${normalized.kind}:${publicCanonical(normalized.url)}:${normalized.quote}`, normalized); }
    const evidence = [...dedup.values()];
    const status = claimStatus(evidence);
    const missing = status === "未验证" ? `已检查 ${got.length} 个候选来源，尚未找到可独立复现“${claim.claim.slice(0, 80)}”的公开测试条件、原始数据和结果。` : status === "部分支持" ? "已有一份直接材料，仍缺第二个可核对相同指标和测试条件的独立来源。" : "";
    const generatedQueries = [claim.claim, `${claim.claimant} ${claim.claim}`, `${claim.claim} independent benchmark`].slice(0, 3);
    audit["queryIntents"] = generatedQueries;
    audit["queryGenerated"] = generatedQueries.length;
    audit["queryExecuted"] = 0;
    audit["searchStatus"] = "search_blocked";
    audit["searchReason"] = "No unattended web-search provider is configured; official source links and seeded public URLs were fetched instead.";
    audit["tierCounts"] = got.reduce((m,x) => { if (x.fetchStatus === "ok") m[x.tier] = (m[x.tier] ?? 0) + 1; return m; }, {} as Record<string,number>);
    audit["deepRead"] = got.filter(x => x.fetchStatus === "ok").map(x => x.url);
    audit["manualReview"] = [165,181,195].includes(claim.id) ? "pending" : "evidence_only";
    audit["evidenceCount"] = evidence.length; audit["independentSupports"] = evidence.filter(e => e.kind === "support" && e.independent).length; audit["independentConflicts"] = evidence.filter(e => e.kind === "conflict" && e.independent).length;
    await sql`UPDATE insight_claims SET evidence=${sql.json(evidence as never)}, evidence_audit=${sql.json(audit as never)}, status=${status}, missing_evidence=${missing}, evidence_updated_at=now(), relation_reviewed=true WHERE id=${claim.id}`;
  }
  const partial = fetched > 0 && judged < fetched;
  console.log(JSON.stringify({ ok: !partial, claims: claims.length, fetched, judged, independentSupports: supports, independentConflicts: conflicts, partial }));
  // A single web/LLM candidate may be unavailable; keep the fetched audit and
  // let the next locked timer run resume the same claim instead of failing the
  // whole content pipeline.
}
try { await main(); } finally { await closeDb(); }
