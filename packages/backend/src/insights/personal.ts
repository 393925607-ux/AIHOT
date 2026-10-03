import { createHash } from "node:crypto";

/** The only labels that can leave the private Inbox classifier. */
export type InboxClassification = "Demand" | "Claim" | "Evidence" | "Noise" | "Needs Review";
export type InboxGatePath = "demand_gate" | "claim_gate" | "evidence_gate" | "noise" | "needs_review";

export type OwnTestMetadata = {
  vendor: string | null;
  model: string | null;
  version: string | null;
  accessChannel: string | null;
  region: string | null;
  hardware: string | null;
  concurrency: string | null;
  task: string | null;
  metric: string | null;
  value: string | null;
  timestamp: string | null;
  limitations: string | null;
  artifactHash: string;
  /** Own tests are user supplied and never independent evidence by default. */
  evidenceType: "own_test";
  provenance: "user_supplied";
  independent: false;
  matchStatus: "needs_review";
};

/**
 * Private envelope kept backwards compatible with the original hash-only record.
 * The raw private text is deliberately never retained in this object or stdout.
 */
export type PrivateInboxRecord = {
  privacy: "private";
  status: "pending";
  ownTest: boolean;
  sourceUrl: string | null;
  textFile: string | null;
  hint: string | null;
  contentHash: string;
  receivedAt: string;
  textLength: number;
  classify: InboxClassification;
  /** Alias for consumers that use a descriptive field name. */
  classification: InboxClassification;
  reviewStatus: "pending" | "needs_review";
  /** Explicit machine-readable provenance aliases used by the closeout audit. */
  own_test: boolean;
  user_supplied: boolean;
  independent: false | null;
  ownTestMetadata: OwnTestMetadata | null;
  gatePath: InboxGatePath;
  gateDecision: "needs_review" | "noise";
  dedupeStatus: "pending" | "not_applicable";
};

const HASH = (text: string) => createHash("sha256").update(text).digest("hex");

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function firstValue(source: Record<string, unknown>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = source[alias];
    const result = clean(value);
    if (result) return result;
  }
  const entries = Object.entries(source);
  const normalizeKey = (value: string) => value.toLowerCase().replace(/[\s_-]/g, "");
  for (const alias of aliases) {
    const key = entries.find(([candidate]) => normalizeKey(candidate) === normalizeKey(alias))?.[0];
    if (key) {
      const result = clean(source[key]);
      if (result) return result;
    }
  }
  return null;
}

const OWN_TEST_ALIASES: Record<keyof Omit<OwnTestMetadata, "artifactHash" | "evidenceType" | "provenance" | "independent" | "matchStatus">, string[]> = {
  vendor: ["vendor", "provider", "厂商", "供应商"],
  model: ["model", "model_name", "模型"],
  version: ["version", "model_version", "版本"],
  accessChannel: ["accessChannel", "access_channel", "channel", "访问渠道", "接入渠道"],
  region: ["region", "地区", "区域"],
  hardware: ["hardware", "device", "硬件", "设备"],
  concurrency: ["concurrency", "并发", "并发数"],
  task: ["task", "任务", "测试任务"],
  metric: ["metric", "指标", "测量指标"],
  value: ["value", "observedValue", "observed_value", "结果", "观测值", "实测值"],
  timestamp: ["timestamp", "time", "observedAt", "observed_at", "时间", "时间戳"],
  limitations: ["limitations", "limitation", "conditions", "限制", "限制条件", "测试条件"],
};

function parseObject(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const object = parsed as Record<string, unknown>;
      const nested = object.own_test ?? object.ownTest ?? object.result;
      if (nested && typeof nested === "object" && !Array.isArray(nested)) return { ...object, ...(nested as Record<string, unknown>) };
      return object;
    }
  } catch {
    // Markdown and plain text are parsed below. Invalid JSON is a valid Inbox input.
  }
  const fields: Record<string, unknown> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:[-*]\s*)?([^:#：]{1,80})\s*[:：]\s*(.*?)\s*$/);
    if (match) fields[match[1]!.trim()] = match[2]!.trim();
  }
  return fields;
}

export function parseOwnTest(text: string): OwnTestMetadata {
  const artifactHash = HASH(text);
  const source = parseObject(text);
  const metadata = {} as Omit<OwnTestMetadata, "artifactHash" | "evidenceType" | "provenance" | "independent" | "matchStatus">;
  for (const key of Object.keys(OWN_TEST_ALIASES) as Array<keyof typeof OWN_TEST_ALIASES>) {
    metadata[key] = firstValue(source, OWN_TEST_ALIASES[key]);
  }
  return {
    ...metadata,
    artifactHash,
    evidenceType: "own_test",
    provenance: "user_supplied",
    independent: false,
    // There is no automatic Claim matcher in the private Inbox. Keep it auditable.
    matchStatus: "needs_review",
  };
}

function explicitClassification(hint: string | null, text: string): InboxClassification | null {
  const value = `${hint ?? ""} ${text.split(/\r?\n/, 1)[0] ?? ""}`.trim().toLowerCase();
  if (/^(?:noise|噪声|垃圾)/.test(value) || /(?:^|\s)(?:noise|噪声)(?:$|\s)/.test(value)) return "Noise";
  if (/(?:needs?[_ -]?review|待审|待人工|不确定)/.test(value)) return "Needs Review";
  if (/(?:^|\s)(?:demand|需求|真需求)(?:$|\s|[：:])/.test(value)) return "Demand";
  if (/(?:^|\s)(?:claim|主张|牛皮账本)(?:$|\s|[：:])/.test(value)) return "Claim";
  if (/(?:^|\s)(?:evidence|证据)(?:$|\s|[：:])/.test(value)) return "Evidence";
  return null;
}

export function classifyPrivateInput(input: { hint: string | null; text: string; ownTest: boolean; ownTestMetadata?: OwnTestMetadata | null }): InboxClassification {
  const explicit = explicitClassification(input.hint, input.text);
  if (explicit) return explicit;
  if (input.ownTest) {
    const metadata = input.ownTestMetadata;
    // A parseable own-test is evidence, but it remains needs_review until matched to a Claim.
    if (metadata && (metadata.vendor || metadata.model) && (metadata.metric || metadata.task) && metadata.value) return "Evidence";
  }
  return "Needs Review";
}

export function buildPrivateRecord(input: { sourceUrl: string | null; textFile: string | null; hint: string | null; text: string; ownTest?: boolean }): PrivateInboxRecord {
  const ownTest = input.ownTest === true;
  const ownTestMetadata = ownTest ? parseOwnTest(input.text) : null;
  const classify = classifyPrivateInput({ hint: input.hint, text: input.text, ownTest, ownTestMetadata });
  const gatePath: InboxGatePath = classify === "Demand" ? "demand_gate" : classify === "Claim" ? "claim_gate" : classify === "Evidence" ? "evidence_gate" : classify === "Noise" ? "noise" : "needs_review";
  const gateDecision = classify === "Noise" ? "noise" : "needs_review";
  return {
    privacy: "private",
    status: "pending",
    ownTest,
    sourceUrl: input.sourceUrl,
    textFile: input.textFile,
    hint: input.hint,
    contentHash: HASH(input.text),
    receivedAt: new Date().toISOString(),
    textLength: input.text.length,
    classify,
    classification: classify,
    reviewStatus: classify === "Needs Review" || ownTest ? "needs_review" : "pending",
    own_test: ownTest,
    user_supplied: ownTest,
    independent: ownTest ? false : null,
    ownTestMetadata,
    gatePath,
    gateDecision,
    dedupeStatus: classify === "Noise" ? "not_applicable" : "pending",
  };
}
