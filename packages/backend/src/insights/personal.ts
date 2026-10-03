import { createHash } from "node:crypto";

export type PrivateInboxRecord = { privacy: "private"; status: "pending"; ownTest: boolean; sourceUrl: string | null; textFile: string | null; hint: string | null; contentHash: string; receivedAt: string; textLength: number };
export function buildPrivateRecord(input: { sourceUrl: string | null; textFile: string | null; hint: string | null; text: string; ownTest?: boolean }): PrivateInboxRecord {
  return { privacy: "private", status: "pending", ownTest: input.ownTest === true, sourceUrl: input.sourceUrl, textFile: input.textFile, hint: input.hint, contentHash: createHash("sha256").update(input.text).digest("hex"), receivedAt: new Date().toISOString(), textLength: input.text.length };
}
