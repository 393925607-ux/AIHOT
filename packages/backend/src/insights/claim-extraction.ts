import { z } from "zod";

const LooseItem = z.object({
  statement: z.string().min(8).optional(),
  claim: z.string().min(8).optional(),
  speaker: z.string().nullable().optional(),
  claim_type_hint: z.string().optional(),
  verifiable: z.boolean().optional(),
  interest_hint: z.string().optional(),
  evidence_span: z.string().nullable().optional(),
  attributable: z.boolean().optional(),
  specific: z.boolean().optional(),
  material: z.boolean().optional(),
  atomic_enough: z.boolean().optional(),
}).passthrough();
const LooseObject = z.object({ items: z.array(LooseItem).max(8).optional(), claims: z.array(LooseItem).max(8).optional() }).passthrough();
export const StageASchema = z.union([LooseObject, z.array(LooseItem).max(8)]);
export type StageAItem = { statement: string; speaker?: string | null; claim_type_hint?: string; verifiable: boolean; interest_hint?: string; evidence_span?: string | null; attributable?: boolean; specific?: boolean; material?: boolean; atomic_enough?: boolean };

export function normalizeStageA(value: unknown): StageAItem[] {
  const rows: unknown[] = Array.isArray(value) ? value : value && typeof value === "object" ? (("items" in value ? value.items : undefined) ?? ("claims" in value ? value.claims : undefined) ?? []) as unknown[] : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const statement = typeof record.statement === "string" ? record.statement : typeof record.claim === "string" ? record.claim : "";
    if (statement.trim().length < 8 || record.verifiable === false) return [];
    return [{ statement, speaker: typeof record.speaker === "string" ? record.speaker : null, claim_type_hint: typeof record.claim_type_hint === "string" ? record.claim_type_hint : "other", verifiable: true, interest_hint: typeof record.interest_hint === "string" ? record.interest_hint : "unknown", evidence_span: typeof record.evidence_span === "string" ? record.evidence_span : null,
      attributable: typeof record.attributable === "boolean" ? record.attributable : undefined,
      specific: typeof record.specific === "boolean" ? record.specific : undefined,
      material: typeof record.material === "boolean" ? record.material : undefined,
      atomic_enough: typeof record.atomic_enough === "boolean" ? record.atomic_enough : undefined }];
  });
}

export function extractionErrorClass(error: unknown): "json_parse" | "schema_missing_field" | "schema_invalid_enum" | "timeout" | "provider_error" | "other" {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  if (message.includes("timeout")) return "timeout";
  if (message.includes("invalid_type") && (message.includes("undefined") || message.includes("required") || message.includes("missing"))) return "schema_missing_field";
  if (message.includes("invalid_union") || message.includes("enum") || message.includes("invalid_value")) return "schema_invalid_enum";
  if (message.includes("json") || message.includes("parse")) return "json_parse";
  if (message.includes("required") || message.includes("missing")) return "schema_missing_field";
  if (message.includes("provider") || message.includes("http")) return "provider_error";
  return "other";
}
