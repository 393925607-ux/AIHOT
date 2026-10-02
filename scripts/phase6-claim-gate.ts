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

const CLAIM_TYPES = ["性能", "成本", "用户量", "Benchmark", "产品能力"] as const;
const CLAIMANT_TYPES = ["company", "official_account", "founder_or_executive", "project_author", "benchmark_publisher", "researcher", "media_or_analyst"] as const;
const INTERESTS = ["interested", "independent"] as const;

const Decision = z.object({
  id: z.number(),
  eligible: z.boolean(),
  confidence: z.string().nullish(),
  atomic: z.boolean().nullish(),
  claimantName: z.string().trim().max(200).nullish(),
  claimantType: z.enum(CLAIMANT_TYPES).nullish(),
  claimantInterest: z.enum(INTERESTS).nullish(),
  claimType: z.enum(CLAIM_TYPES).nullish(),
  originalClaimUrl: z.string().url().nullish(),
  reason: z.string().max(600).nullish(),
});
const Batch = z.union([
  z.object({ items: z.array(Decision).optional(), results: z.array(Decision).optional() }),
  z.array(Decision),
]);

type ClaimRow = {
  id: number;
  claim: string;
  claimant: string;
  claim_type: (typeof CLAIM_TYPES)[number];
  original_source: string;
  source_item_id: string;
  strong_claim: boolean;
};
type Policy = {
  eligible: boolean;
  claimantName: string;
  claimantType: (typeof CLAIMANT_TYPES)[number];
  claimantInterest: (typeof INTERESTS)[number];
  claimType?: (typeof CLAIM_TYPES)[number];
  originalClaimUrl?: string;
  reason: string;
};

// These are the seven rows accepted by Phase 4/5. Keep only the three that
// describe an interested party's concrete, testable assertion. The four
// benchmark/project announcements remain discoverable evidence, never Claims.
const POLICY: Record<number, Policy> = {
  165: { eligible: true, claimantName: "Bito", claimantType: "company", claimantInterest: "interested", claimType: "Benchmark", reason: "Bito publishes the measured 46% assumption-rate assertion." },
  181: { eligible: true, claimantName: "Alibaba / Qwen", claimantType: "company", claimantInterest: "interested", claimType: "Benchmark", originalClaimUrl: "https://github.com/QwenLM/Qwen-Image-2.1", reason: "The source reports Alibaba/Qwen's concrete model comparison; the HN author is only the discovery actor." },
  195: { eligible: true, claimantName: "OliverDB / OliverAI", claimantType: "company", claimantInterest: "interested", reason: "OliverDB publishes a concrete performance/cost comparison with explicit numbers." },
  177: { eligible: false, claimantName: "Raycaster", claimantType: "benchmark_publisher", claimantInterest: "independent", reason: "Independent benchmark result is evidence, not an interested-party Claim." },
  183: { eligible: false, claimantName: "Krisp", claimantType: "company", claimantInterest: "interested", reason: "Krisp's open STT benchmark announcement describes a dataset and method, not a product Claim." },
  186: { eligible: false, claimantName: "Artificial Analysis", claimantType: "benchmark_publisher", claimantInterest: "independent", reason: "Artificial Analysis measured its own index; the result belongs in evidence." },
  199: { eligible: false, claimantName: "AskCooper", claimantType: "company", claimantInterest: "interested", reason: "A 166-case benchmark announcement is a dataset description without a product comparison Claim." },
};

const SYSTEM = `你是 AI Reality Radar 的 Claim Gate。判断公开材料是否应进入“牛皮账本”。只把利益相关方主动提出的、具体、显著、可验证且带数字/比较/性能/成本/用户量/Benchmark/明确产品能力或边界承诺的陈述判 eligible=true。普通项目介绍、Show HN 标题、问题句、愿望、新闻标题、第三方独立测量结果、只描述数据集/Benchmark 而没有宣传性主张的材料必须 false。独立 Benchmark 发布者自己的测量通常是 evidence，不是 Claim；除非其主动宣传自己的比较结论。HN author 只是发现者，不要把他当 claimant。每条只保留一个核心命题；速度、成本、准确率等多个互不相同指标不能塞进一条。claimantType 只能是 company、official_account、founder_or_executive、project_author、benchmark_publisher、researcher、media_or_analyst；claimantInterest 只能是 interested 或 independent。不要判断真假，不要臆造 URL。严格返回 JSON。`;

function dataItems(data: z.infer<typeof Batch>): z.infer<typeof Decision>[] {
  if (Array.isArray(data)) return data;
  return data.items ?? data.results ?? [];
}

function usableUrl(value: string | undefined, fallback: string): string | null {
  // A model-suggested URL is only audit metadata until a fetcher verifies it.
  // Keep the observed source as the public URL so a hallucinated URL cannot
  // become an original source.
  void value;
  return /^https?:\/\//i.test(fallback) ? fallback : null;
}

async function main() {
  const claims = await sql<ClaimRow[]>`SELECT id, claim, claimant, claim_type, original_source, source_item_id, strong_claim FROM insight_claims ORDER BY id`;
  const decisions = new Map<number, z.infer<typeof Decision>>();
  const modelErrors: Array<{ id: number; error: string }> = [];

  for (let i = 0; i < claims.length; i += 6) {
    const batch = claims.slice(i, i + 6);
    try {
      const result = await judge(
        "claim_gate_v6",
        `claim-gate:${batch[0]?.id ?? i}`,
        SYSTEM,
        batch.map((c) => ({ id: c.id, claim: c.claim, claimant: c.claimant, claimType: c.claim_type, originalSource: c.original_source, discoverySource: c.source_item_id })),
        Batch,
        1400,
      );
      for (const item of dataItems(result.data)) if (batch.some((c) => c.id === item.id)) decisions.set(item.id, item);
    } catch (error) {
      for (const claim of batch) modelErrors.push({ id: claim.id, error: safeError(error) });
    }
  }

  const now = new Date().toISOString();
  let eligible = 0;
  let evidenceOnly = 0;
  for (const claim of claims) {
    const model = decisions.get(claim.id);
    const policy = POLICY[claim.id];
    // Current Phase 4 rows have a conservative policy boundary, but the model
    // still has to approve an allowed row when a real judgement is available.
    // If the provider is unavailable, only the three reviewed baseline rows are
    // kept; unknown/new rows remain hidden until a model judgement exists.
    const confidence = (model?.confidence ?? "").toLowerCase();
    const modelAccepted = model?.eligible === true && model.atomic !== false && !confidence.includes("low") && !confidence.includes("低");
    const modelFailure = modelErrors.some((error) => error.id === claim.id);
    const accepted = policy?.eligible === true ? (modelFailure || !model ? true : modelAccepted) : false;
    const claimantName = policy?.claimantName ?? model?.claimantName ?? null;
    const claimantType = policy?.claimantType ?? model?.claimantType ?? null;
    const claimantInterest = policy?.claimantInterest ?? model?.claimantInterest ?? null;
    const claimType = policy?.claimType ?? model?.claimType ?? claim.claim_type;
    const originalClaimUrl = usableUrl(model?.originalClaimUrl, policy?.originalClaimUrl ?? claim.original_source);
    const judgement = {
      phase: 6,
      reviewedAt: now,
      model: model ?? null,
      policy: policy ?? null,
      finalEligible: accepted,
      modelError: modelErrors.find((x) => x.id === claim.id)?.error ?? null,
    };
    await sql`UPDATE insight_claims SET
      strong_claim=${accepted},
      claim_type=${claimType},
      claimant_name=${claimantName},
      claimant_type=${claimantType},
      claimant_interest=${claimantInterest},
      original_claim_url=${originalClaimUrl},
      claim_gate_judgement=${sql.json(judgement as never)}
      WHERE id=${claim.id}`;
    if (accepted) eligible++; else if (policy) evidenceOnly++;
  }
  console.log(JSON.stringify({ ok: true, claims: claims.length, eligible, evidenceOnly, modelJudged: decisions.size, modelErrors: modelErrors.length }));
}

try { await main(); } finally { await closeDb(); }
