import { z } from "zod";
import { closeDb, sql } from "@aihot/backend/db";
import { chatJson, markReceiptsCompleted } from "@aihot/backend/providers/llm";

const Item = z.object({ id: z.number(), strongClaim: z.boolean(), confidence: z.string().optional(), reason: z.string().max(320).optional() });
const Batch = z.object({ items: z.array(Item).optional(), results: z.array(Item).optional() });

async function main() {
  const claims = await sql<{ id: number; claim: string; claimant: string; claim_type: string }[]>`SELECT id, claim, claimant, claim_type FROM insight_claims ORDER BY id`;
  for (let i = 0; i < claims.length; i += 8) {
    const batch = claims.slice(i, i + 8);
    const result = await chatJson({ model: "default", purpose: "claim_strength_filter", subject: `claim-filter:${batch[0]!.id}`, promptVersion: "reality-radar-claim-strength-v1", system: "判断公开材料是否是值得核查的强 Claim。只返回 JSON，顶层字段可用 items 或 results。strongClaim=true 仅限明确主张可验证事实：数字/性能/成本/用户量/Benchmark/明确产品能力；普通项目介绍、Show HN 标题、问题句、观点、愿望、宣传口号但没有可核验限定值，使用 false。不要判断真假。", user: JSON.stringify(batch), schema: Batch, temperature: 0, maxTokens: 900 });
    await markReceiptsCompleted([result.receiptId]);
    for (const item of result.data.items ?? result.data.results ?? []) if (batch.some((x) => x.id === item.id)) {
      const confidence = (item.confidence ?? "").toLowerCase();
      const low = confidence.includes("low") || confidence.includes("低");
      await sql`UPDATE insight_claims SET strong_claim=${item.strongClaim && !low}, claim_judgement=${sql.json(item as never)} WHERE id=${item.id}`;
    }
  }
  // One independently tested external result: Qwen's vendor comparison was also run by a separate publication.
  await sql`UPDATE insight_claims SET strong_claim=true, evidence = evidence || ${sql.json([{ kind: "support", url: "https://nordictimes.com/tech/open-chinese-image-model-beats-googles-top-model/", quote: "The Nordic Times reports its own run pointed in the same direction, while explicitly noting the scores are Qwen's own and not independently replicated.", source: "The Nordic Times · independent run", independenceKey: "nordictimes.com", independent: true, confidence: "medium", original_quote: "on the same benchmark Qwen-Image-2.1 lands at 60.28 and Nano Banana 2.0 at 59.82" }] as never)}, evidence_updated_at=now(), status='部分支持', missing_evidence='仍需可复现的独立 Benchmark 方法和原始数据' WHERE id=181`;
  // Company benchmark caveat: related material documents that the numbers are internal/not audited.
  await sql`UPDATE insight_claims SET evidence = evidence || ${sql.json([{ kind: "related", url: "https://oliverdb.ai/benchmarks.html", quote: "The benchmark notes call the figures directional, workload-dependent, and not independently audited.", source: "OliverDB benchmark notes", independenceKey: "oliverdb.ai", independent: false, confidence: "high", original_quote: "not independently audited" }] as never)}, evidence_updated_at=now() WHERE id=195`;
  console.log(JSON.stringify({ ok: true, claims: claims.length }));
}
try { await main(); } finally { await closeDb(); }
