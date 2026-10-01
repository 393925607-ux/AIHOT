/** Reprocess existing signals with the live AIHOT LLM + embedding provider. */
import { z } from "zod";
import { closeDb, sql } from "@aihot/backend/db";
import { chatJson, markReceiptsCompleted } from "@aihot/backend/providers/llm";
import { compatibleEmbedding, cosine, ensureEmbeddings } from "@aihot/backend/providers/embeddings";
import { ReceiptUnknownError } from "@aihot/backend/providers/receipts";

const TopicAssignment = z.object({ id: z.number(), topicKey: z.string().trim().min(3).max(80), topicLabel: z.string().trim().min(1).max(80).optional() });
const TopicBatch = z.object({ items: z.array(TopicAssignment).optional(), assignments: z.array(TopicAssignment).optional() });
const RelationItem = z.object({ candidateId: z.number().optional(), id: z.number().optional(), relation: z.enum(["supports", "conflicts", "related", "unrelated"]) });
const RelationBatch = z.object({ items: z.array(RelationItem).optional(), results: z.array(RelationItem).optional() });
const DemandZhItem = z.object({ id: z.number(), problemZh: z.string().trim().min(1).max(240), scenarioZh: z.string().trim().min(1).max(400), workaroundZh: z.string().trim().max(240).optional() });
const DemandZhBatch = z.object({ items: z.array(DemandZhItem).optional(), translations: z.array(DemandZhItem).optional() });
const ClaimZhItem = z.object({ id: z.number(), claimZh: z.string().trim().min(1).max(400).optional(), translation: z.string().trim().min(1).max(400).optional() });
const ClaimZhBatch = z.object({ items: z.array(ClaimZhItem).optional(), translations: z.array(ClaimZhItem).optional() });
const TOPIC_LABELS: Record<string, string> = {
  "mobile-coding-agent": "移动远程 Coding Agent", "context-memory": "上下文与记忆", "tool-integration": "工具与集成",
  "benchmark-evaluation": "Benchmark 与评测", "cost-pricing": "成本与价格", reliability: "稳定性",
  "desktop-workflow": "桌面工作流", "remote-access": "远程连接", "model-capability": "模型能力",
};
type Material = { id: number; kind: "demand" | "claim"; text: string; url: string; actor: string; domain: string };

async function ask<S extends z.ZodType>(purpose: string, subject: string, system: string, user: string, schema: S): Promise<z.infer<S>> {
  const result = await chatJson({ model: "default", purpose, subject, promptVersion: "reality-radar-v1", system, user, schema, temperature: 0, maxTokens: 900 });
  await markReceiptsCompleted([result.receiptId]);
  return result.data;
}

function domain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "unknown"; }
}

async function assignTopics(table: "insight_demands" | "insight_claims", items: Array<{ id: number; text: string }>) {
  const [{ missing }] = await sql<{ missing: number }[]>`SELECT count(*)::int AS missing FROM ${sql(table)} WHERE topic_key IS NULL`;
  if (!missing) return;
  for (let i = 0; i < items.length; i += 8) {
    const batch = items.slice(i, i + 8);
    const result = await ask("insight_topic_assign", `${table}:${batch[0]!.id}`, "为每条 AI 现实信号分配共享 Topic。只返回 JSON，顶层字段可用 items 或 assignments。优先复用这些 canonical topicKey：mobile-coding-agent（移动远程 Agent）、context-memory（上下文与记忆）、tool-integration（工具与集成）、benchmark-evaluation（Benchmark 与评测）、cost-pricing（成本与价格）、reliability（稳定性）、desktop-workflow（桌面工作流）、remote-access（远程连接）、model-capability（模型能力）。相似的用户需求和产品 Claim 必须使用同一个 Topic，不要为单个 Issue 创造专属 Topic。", JSON.stringify(batch), TopicBatch);
    for (const item of result.items ?? result.assignments ?? []) {
      if (!batch.some((x) => x.id === item.id)) continue;
      await sql`UPDATE ${sql(table)} SET topic_key = ${item.topicKey}, topic_label = ${item.topicLabel ?? TOPIC_LABELS[item.topicKey] ?? item.topicKey} WHERE id = ${item.id}`;
    }
  }
}

async function translateDemands(items: Array<{ id: number; problem: string; scenario: string; workaround: string }>) {
  const [{ missing }] = await sql<{ missing: number }[]>`SELECT count(*)::int AS missing FROM insight_demands WHERE problem_zh IS NULL`;
  if (!missing) return;
  for (let i = 0; i < items.length; i += 8) {
    const batch = items.slice(i, i + 8);
    const result = await ask("insight_demand_zh", `demand-zh:${batch[0]!.id}`, "把公开用户反馈翻译成自然、简洁、忠实的中文产品文案。只返回 JSON，顶层字段可用 items 或 translations。保留具体问题，不夸大，不补充原文没有的事实。字段：problemZh、scenarioZh、workaroundZh。", JSON.stringify(batch), DemandZhBatch);
    for (const item of result.items ?? result.translations ?? []) if (batch.some((x) => x.id === item.id)) await sql`UPDATE insight_demands SET problem_zh = ${item.problemZh}, scenario_zh = ${item.scenarioZh}, workaround_zh = ${item.workaroundZh ?? ""} WHERE id = ${item.id}`;
  }
}

async function translateClaims(items: Array<{ id: number; claim: string }>) {
  const [{ missing }] = await sql<{ missing: number }[]>`SELECT count(*)::int AS missing FROM insight_claims WHERE claim_zh IS NULL`;
  if (!missing) return;
  for (let i = 0; i < items.length; i += 10) {
    const batch = items.slice(i, i + 10);
    const result = await ask("insight_claim_zh", `claim-zh:${batch[0]!.id}`, "把公开 Claim 翻译成自然、忠实的中文。只返回 JSON，顶层字段可用 items 或 translations。必须保留 up to、at least、approximately、average、peak、may、can、preview、beta、internal benchmark、selected workloads、特定硬件/地区/套餐/测试条件等限定词，不要把主张翻译得更强。", JSON.stringify(batch), ClaimZhBatch);
    for (const item of result.items ?? result.translations ?? []) if (batch.some((x) => x.id === item.id)) await sql`UPDATE insight_claims SET claim_zh = ${item.claimZh ?? item.translation ?? item.id.toString()} WHERE id = ${item.id}`;
  }
}

async function main() {
  const demands = await sql<{ id: number; problem: string; scenario: string; workaround: string }[]>`SELECT id, problem, scenario, workaround FROM insight_demands ORDER BY id`;
  const claims = await sql<{ id: number; claim: string; claimant: string; original_source: string; relation_reviewed: boolean }[]>`SELECT id, claim, claimant, original_source, relation_reviewed FROM insight_claims ORDER BY id`;
  await translateDemands(demands);
  await translateClaims(claims);
  await assignTopics("insight_demands", demands.map((x) => ({ id: x.id, text: `${x.problem}\n${x.scenario}\n${x.workaround}` })));
  await assignTopics("insight_claims", claims.map((x) => ({ id: x.id, text: `${x.claim}\n提出者：${x.claimant}` })));

  const materials: Material[] = [
    ...demands.map((x) => ({ id: x.id, kind: "demand" as const, text: `${x.problem}\n${x.scenario}\n${x.workaround}`, url: "", actor: "demand", domain: "" })),
    ...claims.map((x) => ({ id: x.id, kind: "claim" as const, text: `${x.claim}\n提出者：${x.claimant}`, url: x.original_source, actor: x.claimant, domain: domain(x.original_source) })),
  ];
  const vectors = await ensureEmbeddings("fact", materials.map((x) => ({ id: `signal:${x.kind}:${x.id}`, text: x.text })));
  const processClaim = async (claim: typeof claims[number]): Promise<number> => {
    const mine = vectors.get(`signal:claim:${claim.id}`);
    if (!mine || !compatibleEmbedding(mine)) return 0;
    const candidates = materials.filter((x) => !(x.kind === "claim" && x.id === claim.id)).map((x) => ({ item: x, score: cosine(mine, vectors.get(`signal:${x.kind}:${x.id}`) ?? []) })).filter((x) => x.score >= 0.42).sort((a, b) => b.score - a.score).slice(0, 5);
    if (!candidates.length) {
      await sql`UPDATE insight_claims SET evidence = '[]'::jsonb, status = '未验证', missing_evidence = '需要独立来源、原始数据或可复现实验', relation_reviewed = true WHERE id = ${claim.id}`;
      return 0;
    }
    let result: z.infer<typeof RelationBatch>;
    try {
      result = await ask("insight_claim_relation", `claim:${claim.id}`, "判断 Claim 与候选公开材料的关系。只返回 JSON。relation 只能是 supports、conflicts、related、unrelated。只有明确支持或明确矛盾才使用 supports/conflicts；相似但不能验证用 related。不要把同一原始来源转载当独立证据。", JSON.stringify({ claim: { id: claim.id, text: claim.claim, claimant: claim.claimant, originalSource: claim.original_source }, candidates: candidates.map((x) => ({ id: x.item.id, kind: x.item.kind, text: x.item.text, source: x.item.url, actor: x.item.actor, similarity: Number(x.score.toFixed(3)) })) }), RelationBatch);
    } catch (error) {
      const reason = error instanceof ReceiptUnknownError ? "LLM 关系回执状态未知，暂不重复请求" : "LLM 关系调用失败";
      await sql`UPDATE insight_claims SET evidence = '[]'::jsonb, status = '未验证', missing_evidence = ${reason}, relation_reviewed = true WHERE id = ${claim.id}`;
      return 0;
    }
    const currentDomain = domain(claim.original_source);
    const relations = result.items ?? result.results ?? [];
    const evidence = relations.flatMap((r) => {
      const candidate = candidates.find((x) => x.item.id === (r.candidateId ?? r.id))?.item;
      if (!candidate || candidate.kind !== "claim" || r.relation === "unrelated") return [];
      return [{ kind: r.relation === "supports" ? "support" : r.relation === "conflicts" ? "conflict" : "related", url: candidate.url, quote: candidate.text.slice(0, 240), source: `${candidate.actor} · ${candidate.domain}` }];
    });
    const independent = evidence.filter((x) => x.kind === "support" || x.kind === "conflict").filter((x) => domain(x.url) !== currentDomain || x.source.split(" · ")[0] !== claim.claimant);
    const status = independent.some((x) => x.kind === "conflict") ? "存在冲突证据" : independent.length >= 2 ? "有较强支持" : independent.length === 1 ? "部分支持" : "未验证";
    const missing = status === "未验证" ? "需要独立来源、原始数据或可复现实验" : status === "部分支持" ? "需要第二个独立支持来源或公开方法" : "";
    await sql`UPDATE insight_claims SET evidence = ${sql.json(evidence as never)}, status = ${status}, missing_evidence = ${missing}, relation_reviewed = true WHERE id = ${claim.id}`;
    return relations.length;
  };
  let relationCount = 0;
  // Four concurrent calls stay comfortably below the OCI channel's RPS/TPM limits.
  const pendingClaims = claims.filter((claim) => !claim.relation_reviewed);
  for (let i = 0; i < pendingClaims.length; i += 4) {
    relationCount += (await Promise.all(pendingClaims.slice(i, i + 4).map(processClaim))).reduce((a, b) => a + b, 0);
  }
  console.log(JSON.stringify({ ok: true, demands: demands.length, claims: claims.length, relations: relationCount }));
}

try { await main(); } finally { await closeDb(); }
