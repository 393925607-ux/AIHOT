/** Production Claim Gate decision shared by the pipeline and regression tests. */

export const CLAIM_TYPES = ["性能", "成本", "用户量", "Benchmark", "产品能力"] as const;
export const CLAIMANT_TYPES = ["company", "official_account", "founder_or_executive", "project_author", "benchmark_publisher", "researcher", "media_or_analyst"] as const;
export const INTERESTS = ["interested", "independent"] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number];
export type ClaimantType = (typeof CLAIMANT_TYPES)[number];
export type ClaimantInterest = (typeof INTERESTS)[number];
export type GateDecision = "publish" | "reject" | "needs_review" | "model_error";

export const CLAIM_REASON_CODES = [
  "not_attributable", "not_specific", "not_verifiable", "not_material", "question_only",
  "generic_announcement", "project_description", "dataset_only", "vague_marketing",
  "compound_claim", "insufficient_context", "fetch_incomplete", "model_error", "other",
] as const;
export type ClaimReasonCode = (typeof CLAIM_REASON_CODES)[number];

export type GateModel = {
  eligible?: boolean | null;
  atomic?: boolean | null;
  atomicEnough?: boolean | null;
  attributable?: boolean | null;
  specific?: boolean | null;
  material?: boolean | null;
  verifiable?: boolean | null;
  confidence?: string | null;
  claimantName?: string | null;
  claimantType?: ClaimantType | null;
  claimantInterest?: ClaimantInterest | null;
  claimType?: ClaimType | null;
  originalClaimUrl?: string | null;
  reason?: string | null;
  reasonCode?: ClaimReasonCode | null;
  reasonZh?: string | null;
  claimZh?: string | null;
};

export type ManualOverride = {
  decision: "publish" | "reject";
  reviewedBy: string;
  reason: string;
  reviewedAt: string;
};

export function decideClaimGate(input: { model?: GateModel | null; modelError?: string | null; manualOverride?: ManualOverride | null }): { decision: GateDecision; reason: string; reasonCode: ClaimReasonCode } {
  const manual = input.manualOverride;
  if (manual?.reviewedBy && manual.reason && manual.reviewedAt && (manual.decision === "publish" || manual.decision === "reject")) {
    return { decision: manual.decision, reason: "manual_override", reasonCode: "other" };
  }
  if (input.modelError) return { decision: "model_error", reason: input.modelError, reasonCode: "model_error" };
  const model = input.model;
  if (!model) return { decision: "needs_review", reason: "missing_model_judgement", reasonCode: "model_error" };
  const confidence = String(model.confidence ?? "").toLowerCase();
  if (confidence.includes("low") || confidence.includes("低")) return { decision: "needs_review", reason: "low_confidence", reasonCode: "insufficient_context" };
  if (model.eligible === true && model.atomic === true && model.atomicEnough === true && model.attributable === true && model.specific === true && model.material === true && model.verifiable === true
    && model.claimantName && model.claimantType && model.claimType) {
    return { decision: "publish", reason: model.reason || "model_accepted", reasonCode: model.reasonCode ?? "other" };
  }
  if (model.eligible === false) {
    if (!model.reasonCode || !(model.reason || model.reasonZh)?.trim()) return { decision: "needs_review", reason: "missing_structured_rejection_reason", reasonCode: "insufficient_context" };
    return { decision: "reject", reason: model.reason || model.reasonZh || "model_rejected", reasonCode: model.reasonCode };
  }
  return { decision: "needs_review", reason: "incomplete_model_judgement", reasonCode: "insufficient_context" };
}

export function exactRelation(value: string | null | undefined): "supports" | "conflicts" | "related" | "unrelated" | null {
  const normalized = (value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "supports" || normalized === "support") return "supports";
  if (normalized === "conflicts" || normalized === "conflict") return "conflicts";
  if (normalized === "related") return "related";
  if (normalized === "unrelated") return "unrelated";
  return null;
}
