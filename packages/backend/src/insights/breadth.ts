import { platform, userIdentity } from "./validity.ts";

type Sample = { sourceKind: string; sourceUser: string | null; originalUrl: string; sourceRef?: string | null };
export function sourceFamily(kind: string): string {
  if (kind === "github_discussion") return "github_discussions";
  if (kind === "github_issue" || kind === "github_comment") return "github_issues_comments";
  if (kind === "openai_community") return "vendor_forum";
  if (kind === "hn_testimony") return "hacker_news";
  if (kind === "stackexchange") return "stack_exchange";
  if (kind === "hf_discourse") return "community_forum";
  if (kind === "reddit") return "reddit";
  if (kind === "app_review") return "app_reviews";
  return kind;
}
/** Counts describe the observed corpus, not market demand. A thread author also commenting is one user. */
export function demandBreadth(samples: Sample[]) {
  const threads = new Set<string>(), repos = new Set<string>(), platforms = new Set<string>(), families = new Set<string>();
  const users = new Map<string, string>();
  for (const s of [...samples].sort((a, b) => Number(b.sourceKind === "github_issue") - Number(a.sourceKind === "github_issue"))) {
    platforms.add(platform(s.sourceKind));
    families.add(sourceFamily(s.sourceKind));
    const user = userIdentity(s.sourceKind, s.sourceUser);
    if (user && !users.has(user)) users.set(user, s.sourceKind);
    try {
      const url = new URL(s.sourceRef || s.originalUrl);
      url.hash = "";
      if (platform(s.sourceKind) === "github") {
        const match = /^\/([^/]+\/[^/]+)\/(issues|discussions)\/(\d+)/.exec(url.pathname);
        if (match) { repos.add(match[1]!.toLowerCase()); threads.add(`github:${match[1]!.toLowerCase()}:${match[2]}:${match[3]}`); }
      } else if (platform(s.sourceKind) === "hn") {
        if (url.searchParams.get("id")) threads.add(`hn:${url.searchParams.get("id")}`);
      } else threads.add(url.toString());
    } catch { /* Unreliable URLs never manufacture a thread or repo. */ }
  }
  const sourceComposition: Record<string, number> = {};
  for (const kind of users.values()) sourceComposition[kind] = (sourceComposition[kind] ?? 0) + 1;
  const sourceFamilyComposition: Record<string, number> = {};
  for (const sample of samples) { const family = sourceFamily(sample.sourceKind); sourceFamilyComposition[family] = (sourceFamilyComposition[family] ?? 0) + 1; }
  return { independentUserCount: users.size, independentThreadCount: threads.size, independentRepoCount: repos.size,
    independentPlatformCount: platforms.size, sourceFamilyCount: families.size, sourceComposition, sourceFamilyComposition, demandState: users.size >= 2 ? "multi_user" as const : "single_signal" as const };
}
