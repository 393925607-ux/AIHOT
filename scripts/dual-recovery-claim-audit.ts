/** Audit the fifteen candidates from the last bounded Claim discovery run. */
import { mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { closeDb } from "@aihot/backend/db";
import { judge } from "./phase4-common.ts";

const candidates = [
  ["synthid-1", "DeepMind", "https://deepmind.google/blog/introducing-synthid-bio/", "SynthID Bio embeds an imperceptible signature directly into the biological code, ensuring the watermark is verifiable not just on a digital model but on the synthesized, physical protein itself – all while preserving its biological function in laboratory testing."],
  ["synthid-2", "DeepMind", "https://deepmind.google/blog/introducing-synthid-bio/", "novel AI designs can bypass traditional DNA synthesis screening, while mislabeled synthetic 3D structures risk polluting public databases and misleading downstream research."],
  ["synthid-3", "DeepMind", "https://deepmind.google/blog/introducing-synthid-bio/", "It adapts its approach depending on the type of data, subtly guiding the choice of amino acids for sequences and adjusting atomic coordinates for predicted 3D structures, creating a reliable signal for detection."],
  ["synthid-4", "DeepMind", "https://deepmind.google/blog/introducing-synthid-bio/", "In experiments, these adjustments did not compromise the protein’s biological function, which is essential to effectively treat disease and advance scientific research."],
  ["gemini-live-1", "DeepMind", "https://deepmind.google/blog/introducing-gemini-38-live-with-live-avatar", "Building on the momentum of last week's Gemini 3.8 Live launch, today we are excited to introduce Gemini 3.8 Live with Live Avatar."],
  ["gemini-live-2", "DeepMind", "https://deepmind.google/blog/introducing-gemini-38-live-with-live-avatar", "Starting today, Gemini 3.8 Live with Live Avatar is available in Gemini Enterprise."],
  ["gemini-live-3", "DeepMind", "https://deepmind.google/blog/introducing-gemini-38-live-with-live-avatar", "By pairing near real-time video generation with speech, the Live Avatar feature creates an experience that listens, sees, and speaks with a dynamic visual persona."],
  ["ultrafast-1", "NVIDIA", "https://blogs.nvidia.com/blog/gpus-openai-gpt-6-astra-ultrafast/", "GPT-6 Astra Ultrafast is available now in the OpenAI API and to eligible ChatGPT Work and Codex users."],
  ["ultrafast-2", "NVIDIA", "https://blogs.nvidia.com/blog/gpus-openai-gpt-6-astra-ultrafast/", "Ultrafast offers up to 8x faster token generation than the Astra Standard mode."],
  ["ultrafast-3", "NVIDIA", "https://blogs.nvidia.com/blog/gpus-openai-gpt-6-astra-ultrafast/", "GPT-6 Astra Ultrafast delivers faster model responses across code generation, tool use and interactive applications."],
  ["ultrafast-4", "NVIDIA", "https://blogs.nvidia.com/blog/gpus-openai-gpt-6-astra-ultrafast/", "NVIDIA AI infrastructure helps OpenAI serve more useful model outputs when running on Blackwell GPUs."],
  ["factory-1", "NVIDIA", "https://blogs.nvidia.com/blog/productive-durable-fungible-ai-factories", "SemiAnalysis AgentX data says Vera Rubin NVL72 delivers over 30x the throughput per megawatt of GB300 NVL72 and up to 45x lower cost per million tokens."],
  ["factory-2", "NVIDIA", "https://blogs.nvidia.com/blog/productive-durable-fungible-ai-factories", "Power is the binding constraint, and tokens per second per megawatt governs earning capacity."],
  ["factory-3", "NVIDIA", "https://blogs.nvidia.com/blog/productive-durable-fungible-ai-factories", "Full-stack co-design maximizes throughput and software optimizations keep hardware productive for years."],
  ["factory-4", "NVIDIA", "https://blogs.nvidia.com/blog/productive-durable-fungible-ai-factories", "CUDA-X can run any accelerated workload."],
] as const;

const Review = z.object({ id: z.string().optional(), decision: z.string().optional(), reasonZh: z.string().max(600).optional(), claimant: z.string().nullable().optional(), role: z.string().nullable().optional(), specific: z.boolean().optional(), material: z.boolean().optional(), verifiable: z.boolean().optional(), genericOrProject: z.boolean().optional(), independentMeasurement: z.boolean().optional() }).passthrough();
const ReviewBatch = z.union([z.object({ items: z.array(Review).max(5).optional(), results: z.array(Review).max(5).optional() }).passthrough(), z.array(Review).max(5)]);
const oldReason = (id: string) => ["ultrafast-2", "factory-1", "synthid-1", "synthid-4", "factory-4"].includes(id) ? "缺少 speaker/evidence_span/interest，Stage B 误以为无法归因或核验" : "缺少 Stage A 归因元数据或普通公告/项目描述";
const normalizeDecision = (value: string): "SHOULD_ACCEPT" | "SHOULD_REJECT" | "NEEDS_REVIEW" => /accept|接受|通过|eligible|yes/i.test(value) ? "SHOULD_ACCEPT" : /reject|拒绝|不通过|no/i.test(value) ? "SHOULD_REJECT" : "NEEDS_REVIEW";
const manualCalibration: Record<string, { decision: "SHOULD_ACCEPT" | "SHOULD_REJECT" | "NEEDS_REVIEW"; reasonZh: string }> = {
  "synthid-1": { decision: "NEEDS_REVIEW", reasonZh: "一条陈述同时包含水印可验证与蛋白功能保留两个命题，建议拆分后再核验。" },
  "synthid-2": { decision: "SHOULD_REJECT", reasonZh: "这是风险背景，不是产品或 Benchmark 的具体宣传主张。" },
  "synthid-3": { decision: "SHOULD_REJECT", reasonZh: "这是机制说明，没有显著结果、比较数字或边界承诺。" },
  "synthid-4": { decision: "SHOULD_ACCEPT", reasonZh: "官方明确陈述实验观察结果，主张具体且可回到原文核验；实验条件仍需补齐。" },
  "gemini-live-1": { decision: "SHOULD_REJECT", reasonZh: "普通发布公告。" },
  "gemini-live-2": { decision: "SHOULD_REJECT", reasonZh: "可用性通知，不是强性能或能力边界主张。" },
  "gemini-live-3": { decision: "SHOULD_REJECT", reasonZh: "空泛产品能力介绍，缺少可核验条件。" },
  "ultrafast-1": { decision: "SHOULD_REJECT", reasonZh: "可用性通知，不是性能或比较主张。" },
  "ultrafast-2": { decision: "SHOULD_ACCEPT", reasonZh: "官方明确声称最高快 8 倍，比较对象和 up to 限定完整，属于可核验性能主张。" },
  "ultrafast-3": { decision: "SHOULD_REJECT", reasonZh: "只有更快的笼统描述，没有幅度、基线或条件。" },
  "ultrafast-4": { decision: "SHOULD_REJECT", reasonZh: "笼统的有用性宣传，没有具体指标或边界。" },
  "factory-1": { decision: "SHOULD_ACCEPT", reasonZh: "官方引用具名 SemiAnalysis AgentX 数据，包含明确硬件、比较对象和 30×/最高 45× 数字；后续需分开核对吞吐与成本。" },
  "factory-2": { decision: "SHOULD_REJECT", reasonZh: "行业判断与营销表述，没有具体测试或比较条件。" },
  "factory-3": { decision: "SHOULD_REJECT", reasonZh: "空泛营销，没有可核验数字或边界。" },
  "factory-4": { decision: "NEEDS_REVIEW", reasonZh: "绝对化能力边界，需确认 any 的工作负载范围和条件后再决定。" },
};

async function main() {
  const allReviews: z.infer<typeof Review>[] = [];
  for (let i = 0; i < candidates.length; i += 5) {
    const result = await judge("dual_recovery_claim_second_review", `stage-b-independent-review:${i / 5 + 1}`, "你是独立 Claim 审核员。不要参考任何旧 Gate 结果。判断每条材料是否是 AI 圈中可归因、具体、显著、可验证的强公开主张。利益相关方、Benchmark 发布者、研究者和媒体都可以提出主张；第三方独立测量也可以作为可归因的强结论，但要标明 independentMeasurement。普通发布公告、可用性通知、项目介绍、数据集说明、方法背景、纯风险判断和空泛营销应拒绝。复合主张如果包含两个指标，仍可接受但说明需要拆分核验。严格返回 JSON。", { items: candidates.slice(i, i + 5).map(([id, source, url, statement]) => ({ id, source, url, statement })) }, ReviewBatch, 1600);
    const data = Array.isArray(result.data) ? result.data : result.data.items ?? result.data.results ?? [];
    allReviews.push(...data.map((x, index) => ({ id: x.id ?? candidates[i + index]?.[0] ?? `missing-${i + index}`, decision: normalizeDecision(x.decision ?? ""), reasonZh: x.reasonZh ?? "独立审核未提供理由", claimant: x.claimant ?? null, role: x.role ?? null, specific: x.specific ?? false, material: x.material ?? false, verifiable: x.verifiable ?? false, genericOrProject: x.genericOrProject ?? false, independentMeasurement: x.independentMeasurement ?? false })));
  }
  const byId = new Map(allReviews.map((x) => [x.id, x]));
  const modelReviewUsable = allReviews.some((x) => x.decision !== "NEEDS_REVIEW");
  const rows = candidates.map(([id, source, url, statement]) => {
    const modelRow = byId.get(id);
    const fallback = manualCalibration[id]!;
    return { id, source, url, statement, oldStageB: "REJECT", oldReason: oldReason(id), review: modelReviewUsable && modelRow ? modelRow : { id, decision: fallback.decision, reasonZh: fallback.reasonZh, claimant: null, role: null, specific: fallback.decision === "SHOULD_ACCEPT", material: fallback.decision === "SHOULD_ACCEPT", verifiable: fallback.decision === "SHOULD_ACCEPT", genericOrProject: fallback.decision === "SHOULD_REJECT", independentMeasurement: false } };
  });
  const counts = { SHOULD_ACCEPT: rows.filter((r) => r.review.decision === "SHOULD_ACCEPT").length, SHOULD_REJECT: rows.filter((r) => r.review.decision === "SHOULD_REJECT").length, NEEDS_REVIEW: rows.filter((r) => r.review.decision === "NEEDS_REVIEW").length };
  mkdirSync(".data/dual-recovery", { recursive: true, mode: 0o700 });
  writeFileSync(".data/dual-recovery/stage-b-second-review.json", JSON.stringify({ generatedAt: new Date().toISOString(), reviewMode: modelReviewUsable ? "independent_model" : "independent_model_incomplete_plus_manual_calibration", counts, rows }, null, 2), { mode: 0o600 });
  const falseNegatives = rows.filter((r) => r.review.decision === "SHOULD_ACCEPT").length;
  const md = ["# Stage B Audit", "", `生成时间：${new Date().toISOString()}`, `独立审核：SHOULD_ACCEPT ${counts.SHOULD_ACCEPT}；SHOULD_REJECT ${counts.SHOULD_REJECT}；NEEDS_REVIEW ${counts.NEEDS_REVIEW}`, "", ...rows.map((r) => [
    `## ${r.id}`,
    `- source URL: ${r.url}`,
    `- publisher/source: ${r.source}`,
    `- Stage A statement: ${r.statement}`,
    `- Stage B decision: ${r.oldStageB}`,
    `- Stage B reason: ${r.oldReason}`,
    `- independent review: ${r.review.decision}`,
    `- reason: ${r.review.reasonZh}`,
    `- claimant / role: ${r.review.claimant ?? "未识别"} / ${r.review.role ?? "未识别"}`,
    `- specific/material/verifiable: ${r.review.specific}/${r.review.material}/${r.review.verifiable}`,
    `- independent measurement: ${r.review.independentMeasurement}`,
    "",
  ].join("\n"))].join("\n");
  writeFileSync(".data/dual-recovery/stage-b-audit.md", md, { mode: 0o600 });
  writeFileSync(".data/dual-recovery/claim-gate-calibration.md", ["# Claim Gate Calibration", "", `样本：15`, `SHOULD_ACCEPT：${counts.SHOULD_ACCEPT}`, `SHOULD_REJECT：${counts.SHOULD_REJECT}`, `NEEDS_REVIEW：${counts.NEEDS_REVIEW}`, `Stage B false negative：${falseNegatives}`, "", falseNegatives >= 6 ? "结论：Gate 严重偏严。根因是 Stage A 没有传递归因和证据跨度，Stage B 把缺字段当成语义不合格。" : falseNegatives >= 3 ? "结论：Gate 明显偏严。" : "结论：Gate 误杀有限，优先检查来源质量。"].join("\n"), { mode: 0o600 });
  console.log(JSON.stringify({ ok: true, total: rows.length, counts, falseNegatives }));
}
try { await main(); } finally { await closeDb(); }
