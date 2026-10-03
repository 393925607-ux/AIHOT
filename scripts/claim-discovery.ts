/** Incremental official-source Claim discovery. Raw pages are never published directly. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { closeDb, sql } from "@aihot/backend/db";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { publicCanonical } from "@aihot/backend/insights/validity";
import { sha256 } from "@aihot/backend/lib/ids";
import { StageASchema, extractionErrorClass, normalizeStageA, type StageAItem } from "@aihot/backend/insights/claim-extraction";
import { decideClaimGate, type GateModel, type ClaimReasonCode } from "@aihot/backend/insights/claim-gate";
import { judge, safeError } from "./phase4-common.ts";

const FEEDS = [["DeepMind", "https://deepmind.google/blog/rss.xml"], ["NVIDIA", "https://blogs.nvidia.com/feed/"], ["Microsoft Research", "https://www.microsoft.com/en-us/research/feed/"], ["Mistral", "https://mistral.ai/rss.xml"], ["Google Research", "https://research.google/blog/rss/"], ["Hugging Face", "https://huggingface.co/blog/feed.xml"]] as const;
const CLAIM_TYPES = ["性能", "成本", "用户量", "Benchmark", "产品能力"] as const;
const CLAIMANT_TYPES = ["company", "official_account", "founder_or_executive", "project_author", "benchmark_publisher", "researcher", "media_or_analyst"] as const;
const REASON_CODES = ["not_attributable", "not_specific", "not_verifiable", "not_material", "question_only", "generic_announcement", "project_description", "dataset_only", "vague_marketing", "compound_claim", "insufficient_context", "fetch_incomplete", "model_error", "other"] as const;
const GateSchema = z.object({
  eligible: z.boolean(), atomic: z.boolean().optional(), atomic_enough: z.boolean().optional(), attributable: z.boolean().optional(), specific: z.boolean().optional(), material: z.boolean().optional(), verifiable: z.boolean().optional(), confidence: z.string().optional(),
  claimantName: z.string().trim().max(200).nullable().optional(), claimantType: z.enum(CLAIMANT_TYPES).nullable().optional(), claimantInterest: z.enum(["interested", "independent"]).nullable().optional(), claimType: z.enum(CLAIM_TYPES).nullable().optional(), claimZh: z.string().trim().max(800).nullable().optional(), originalClaimUrl: z.string().url().nullable().optional(), reasonCode: z.enum(REASON_CODES).nullable().optional(), reasonZh: z.string().max(600).nullable().optional(), reason: z.string().max(600).nullable().optional(),
}).passthrough();
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", textNodeName: "#text", trimValues: true });
const text = (v: any): string => typeof v === "string" || typeof v === "number" ? String(v) : Array.isArray(v) ? text(v[0]) : v && typeof v === "object" && "#text" in v ? text(v["#text"]) : "";
const link = (v: any): string => typeof v === "string" ? v : Array.isArray(v) ? link(v.find((x) => x?.["@rel"] === "alternate") ?? v[0]) : v && typeof v === "object" && "@href" in v ? String(v["@href"]) : "";
const clean = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<header[\s\S]*?<\/header>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const claimType = (hint: string | undefined): (typeof CLAIM_TYPES)[number] => hint && CLAIM_TYPES.includes(hint as any) ? hint as any : /cost|成本/i.test(hint ?? "") ? "成本" : /benchmark|基准/i.test(hint ?? "") ? "Benchmark" : /speed|throughput|latency|性能/i.test(hint ?? "") ? "性能" : "产品能力";
const checkpoint = (value: unknown) => { mkdirSync(".data/dual-recovery", { recursive: true, mode: 0o700 }); writeFileSync(".data/dual-recovery/claim-discovery-checkpoint.json", JSON.stringify(value, null, 2), { mode: 0o600 }); };

type Page = { source: string; title: string; url: string; body: string; publishedAt?: string };
type Audit = { source: string; title: string; url: string; candidate: StageAItem; stageB: unknown; decision: ReturnType<typeof decideClaimGate>; claimZhReady: boolean; inserted: boolean; error?: string };

async function retryJudge<S extends z.ZodType>(purpose: string, subject: string, system: string, input: unknown, schema: S, maxTokens: number) {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await judge(purpose, `${subject}:attempt-${attempt + 1}`, system, input, schema, maxTokens); } catch (error) { last = error; }
  }
  throw last;
}

async function discoverPages(cutoff: number): Promise<Page[]> {
  const pages: Page[] = [];
  for (const [source, feed] of FEEDS) {
    try {
      const res = await guardedFetch(feed, { timeoutMs: 15_000, maxBytes: 1_500_000 });
      const doc = parser.parse(res.text());
      const raw = doc.rss?.channel?.item ?? doc.feed?.entry ?? [];
      for (const item of (Array.isArray(raw) ? raw : [raw]).filter((x) => Date.parse(text(x.pubDate ?? x.published ?? x.updated)) >= cutoff).slice(0, 1)) {
        const url = link(item.link), title = text(item.title);
        if (/^https?:/.test(url)) pages.push({ source, title, url, body: "", publishedAt: text(item.pubDate ?? item.published ?? item.updated) });
      }
    } catch {
      // A single feed is allowed to fail; the checkpoint records the partial run.
    }
  }
  // Keep the unattended daily run bounded; the same script can be run manually
  // with cached pages when a wider audit is needed.
  return pages.slice(0, 4);
}

function cachedPages(): Page[] {
  const path = ".data/claims-recovery/page-audit-body.json";
  const rows = JSON.parse(readFileSync(path, "utf8")) as Array<{ source: string; title: string; url: string; body: string }>;
  return rows.map((r) => ({ source: r.source, title: r.title, url: r.url, body: r.body }));
}

async function main() {
  const cached = process.argv.includes("--cached");
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const pages = cached ? cachedPages() : await discoverPages(cutoff);
  const funnel: Record<string, number> = { pages_discovered: pages.length, pages_deduped: 0, pages_fetch_ok: 0, pages_fetch_failed: 0, pages_with_enough_text: 0, extract_success_pages: 0, extract_zero_pages: 0, extract_model_error_pages: 0, candidate_statements: 0, gate_eligible: 0, gate_rejected: 0, gate_needs_review: 0, inserted: 0, duplicates: 0 };
  const errors: Record<string, number> = {};
  const audits: Audit[] = [];
  const seenPages = new Set<string>();
  for (const page of pages) {
    const canonical = publicCanonical(page.url);
    if (seenPages.has(canonical)) { funnel.pages_deduped++; continue; }
    seenPages.add(canonical);
    let body = page.body;
    if (!body && !cached) {
      try { const fetched = await guardedFetch(page.url, { timeoutMs: 15_000, maxBytes: 1_200_000 }); if (fetched.status !== 200) throw new Error(`http_${fetched.status}`); body = clean(fetched.text()); funnel.pages_fetch_ok++; } catch (error) { funnel.pages_fetch_failed++; errors[extractionErrorClass(error)] = (errors[extractionErrorClass(error)] ?? 0) + 1; continue; }
    } else if (body) funnel.pages_fetch_ok++;
    if (body.length < 300) continue;
    funnel.pages_with_enough_text++;
    const start = body.search(/\b(Introducing|delivers|available|faster|benchmark|tokens|percent|%|model|throughput|cost)\b/i);
    const context = `${body.slice(0, 700)}\n${body.slice(Math.max(0, start), Math.max(0, start) + 3600)}`;
    let extracted: StageAItem[];
    try {
      const result = await retryJudge("claim_stage_a_v2", `stage-a:${canonical}`, "从官方或研究页面正文中找出最多 8 条值得进入 Claim Gate 的完整陈述。每条必须逐字来自正文，保留数字和限定条件。补充 speaker（页面明确的公司/作者/发布者；不能确定则 null）、evidence_span（短原文片段）、claim_type_hint、verifiable、attributable、specific、material、atomic_enough、interest_hint。普通公告、项目介绍、方法背景可以列出但标 verifiable=false。没有就返回 items 空数组。严格 JSON。", { source: page.source, title: page.title, url: page.url, text: context }, StageASchema, 1100);
      extracted = normalizeStageA(result.data);
      funnel.extract_success_pages += extracted.length ? 1 : 0;
      funnel.extract_zero_pages += extracted.length ? 0 : 1;
    } catch (error) { funnel.extract_model_error_pages++; errors[extractionErrorClass(error)] = (errors[extractionErrorClass(error)] ?? 0) + 1; continue; }
    funnel.candidate_statements += extracted.length;
    for (let candidateIndex = 0; candidateIndex < extracted.length; candidateIndex++) {
      const candidate = extracted[candidateIndex]!;
      let stageB: any = null;
      let decision: ReturnType<typeof decideClaimGate>;
      let errorText: string | undefined;
      try {
        const result = await retryJudge("claim_stage_b_v2", `stage-b:${canonical}:${candidateIndex}:${sha256(candidate.statement).slice(0, 12)}`, "判断候选是否是 AI 圈中可归因、具体、显著、可验证的强公开主张。利益相关方和独立 Benchmark/研究者/媒体都可以作为来源角色；claimantInterest 只记录 provenance，不是硬门槛。拒绝普通新闻、公告、项目介绍、数据集说明、纯问句、空泛营销。必须返回 reasonCode/reasonZh。保留 up to、at least、approximately、特定硬件/地区/测试条件等限定词。只保留一个核心命题。严格 JSON。", { source: page.source, title: page.title, url: page.url, candidate, pageContext: body.slice(0, 3000) }, GateSchema, 900);
        stageB = result.data;
        const model: GateModel = { ...stageB, atomicEnough: stageB.atomic_enough, reasonCode: stageB.reasonCode as ClaimReasonCode | null, reasonZh: stageB.reasonZh };
        if (model.eligible === true) {
          model.claimantName = model.claimantName ?? candidate.speaker ?? page.source;
          model.claimantType = model.claimantType ?? "company";
          model.claimType = model.claimType ?? claimType(candidate.claim_type_hint);
          model.claimantInterest = model.claimantInterest ?? (candidate.interest_hint === "independent" ? "independent" : "interested");
          model.attributable = model.attributable ?? candidate.attributable;
          model.specific = model.specific ?? candidate.specific;
          model.material = model.material ?? candidate.material;
          model.verifiable = model.verifiable ?? (candidate.verifiable === true ? true : undefined);
          model.atomicEnough = model.atomicEnough ?? candidate.atomic_enough;
          stageB = { ...stageB, ...model };
        }
        decision = decideClaimGate({ model });
      } catch (error) { errorText = safeError(error); decision = decideClaimGate({ modelError: errorText }); }
      const claimZh = typeof stageB?.claimZh === "string" ? stageB.claimZh.trim() : "";
      const claimZhReady = !!claimZh && /[\u3400-\u9fff]/.test(claimZh);
      if (decision.decision === "publish" && !claimZhReady) decision = { decision: "needs_review", reason: "missing_chinese_claim", reasonCode: "insufficient_context" };
      if (decision.decision === "publish") funnel.gate_eligible++; else if (decision.decision === "reject") funnel.gate_rejected++; else funnel.gate_needs_review++;
      let inserted = false;
      if (decision.decision === "publish") {
        const sourceItemId = `claim:${canonical}:${sha256(candidate.statement.trim().toLowerCase()).slice(0, 16)}`;
        const rows = await sql<{ id: number }[]>`INSERT INTO insight_claims(claim,claim_zh,claimant,claimant_name,claimant_type,claimant_interest,claim_type,original_source,original_claim_url,status,missing_evidence,source_item_id,observed_at,strong_claim,claim_gate_judgement)
          VALUES(${candidate.statement},${claimZh},${stageB.claimantName},${stageB.claimantName},${stageB.claimantType},${stageB.claimantInterest ?? null},${stageB.claimType},${canonical},${canonical},'未验证','原始主张已确认；自动外部证据检索当前受限，尚未取得独立复核。',${sourceItemId},${new Date(page.publishedAt || Date.now())},true,${sql.json({ phase: 6, version: "v2", source: page.source, candidate, stageB, decision } as never)}) ON CONFLICT(source_item_id) DO NOTHING RETURNING id`;
        inserted = rows.length > 0; if (inserted) funnel.inserted++; else funnel.duplicates++;
      }
      audits.push({ source: page.source, title: page.title, url: canonical, candidate, stageB, decision, claimZhReady, inserted, error: errorText });
    }
  }
  writeFileSync(".data/dual-recovery/claim-discovery-audit.json", JSON.stringify({ cached, funnel, errors, audits }, null, 2), { mode: 0o600 });
  checkpoint({ ...funnel, errors, cached, completedAt: new Date().toISOString() });
  console.log(JSON.stringify({ ok: true, ...funnel, errors, cached }));
}
try { await main(); } finally { await closeDb(); }
