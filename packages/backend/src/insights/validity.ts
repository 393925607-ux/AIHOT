/** Small, conservative evidence rules shared by the Phase 4 pipeline and reads. */
export type Confidence = "high" | "medium" | "low";
export function platform(kind: string): string {
  return kind.startsWith("github") ? "github" : kind.startsWith("hn") ? "hn" : kind;
}
export function userIdentity(kind: string, author: string | null): string | null {
  const name = author?.trim();
  return !name || /\[bot\]$/i.test(name) ? null : `${platform(kind)}:${platform(kind) === "github" ? name.toLowerCase() : name}`;
}
export function acceptedTestimony(judgement: { same_problem_testimony: boolean; confidence: Confidence }, author: string | null, userType = "User", association = "NONE"): boolean {
  return !!userIdentity("github", author) && userType !== "Bot" && !["OWNER", "MEMBER", "COLLABORATOR"].includes(association) && judgement.same_problem_testimony && judgement.confidence !== "low";
}
export function sameQuote(quote: string, text: string): boolean {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return clean(quote).length >= 8 && clean(text).includes(clean(quote));
}
export function publicCanonical(url: string): string {
  const u = new URL(url); u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (/^utm_|^ref$|^source$/.test(k)) u.searchParams.delete(k);
  return u.toString().replace(/\/$/, "");
}
export type VerifiedEvidence = {
  kind: "support" | "conflict" | "related"; url: string; quote: string; source: string;
  original_quote?: string; independenceKey?: string; independent?: boolean; confidence?: Confidence;
};
export function claimStatus(evidence: VerifiedEvidence[]): "未验证" | "部分支持" | "有较强支持" | "存在冲突证据" {
  const independent = evidence.filter((e) => e.independent === true && !!e.original_quote && e.confidence !== "low");
  if (independent.some((e) => e.kind === "conflict")) return "存在冲突证据";
  const groups = new Set(independent.filter((e) => e.kind === "support").map((e) => e.independenceKey ?? new URL(e.url).hostname));
  return groups.size >= 2 ? "有较强支持" : groups.size === 1 ? "部分支持" : "未验证";
}
