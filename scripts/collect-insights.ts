/**
 * Collects the two MVP modes from public endpoints.
 *
 * Sources are intentionally small and easy to replace: Hacker News Algolia API
 * for user comments/claims and GitHub Issues API for concrete bug reports. If a
 * configured OpenAI-compatible model is present, it extracts the fields through
 * AIHOT's existing chatJson/receipt path; otherwise deterministic extraction is
 * used so the MVP still produces inspectable data without a secret.
 *
 * Run: node --env-file-if-exists=.env scripts/collect-insights.ts
 */
import { z } from "zod";
import { closeDb, sql } from "@aihot/backend/db";
import { chatJson } from "@aihot/backend/providers/llm";

type HnHit = {
  objectID?: string;
  title?: string;
  story_title?: string;
  comment_text?: string;
  story_text?: string;
  url?: string;
  author?: string;
  created_at?: string;
  _highlightResult?: unknown;
};

type GhIssue = {
  id: number;
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  user?: { login?: string } | null;
  updated_at: string;
  pull_request?: unknown;
};

const demandSchema = z.object({ problem: z.string().trim().min(1).max(500), scenario: z.string().trim().min(1).max(500), workaround: z.string().trim().max(500).default("") });
const claimSchema = z.object({ claim: z.string().trim().min(1).max(500), claimant: z.string().trim().min(1).max(200), claimType: z.enum(["性能", "成本", "用户量", "Benchmark", "产品能力"]) });

const githubRepos = ["anthropics/claude-code", "openai/codex", "Aider-AI/aider", "cline/cline", "continuedev/continue", "ollama/ollama"];
const hnCommentQueries = ["AI coding agent", "LLM context", "Claude Code", "Cursor agent", "local LLM tool calling"];
const hnClaimQueries = ["AI benchmark", "LLM cost", "AI users", "coding agent performance", "model context window"];

const headers = {
  "user-agent": "AIHOT-MVP-insights/0.1 (+https://github.com/KKKKhazix/AIHOT)",
  accept: "application/vnd.github+json",
};

function cleanText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(value: string, max = 420): string {
  const text = cleanText(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  return `${(end > 80 ? cut.slice(0, end + 1) : cut).trim()}…`;
}

async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...headers, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).hostname}`);
  return (await res.json()) as T;
}

async function searchHn(query: string, tags: "comment" | "story"): Promise<HnHit[]> {
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=${tags}&hitsPerPage=100`;
  const data = await getJson<{ hits?: HnHit[] }>(url, { headers: { accept: "application/json" } });
  return data.hits ?? [];
}

async function githubIssues(): Promise<Array<GhIssue & { repo: string }>> {
  const all: Array<GhIssue & { repo: string }> = [];
  for (const repo of githubRepos) {
    try {
      const token = process.env.GITHUB_TOKEN?.trim();
      const data = await getJson<GhIssue[]>(`https://api.github.com/repos/${repo}/issues?state=all&per_page=25&sort=updated&direction=desc`, token ? { headers: { authorization: `Bearer ${token}` } } : {});
      for (const issue of data) if (!issue.pull_request && issue.title && issue.html_url) all.push({ ...issue, repo });
    } catch (error) {
      console.warn(`[insights] GitHub ${repo} skipped: ${String(error).slice(0, 160)}`);
    }
  }
  return all;
}

function themeFor(text: string): { key: string; title: string } {
  const t = text.toLowerCase();
  const rules: Array<[RegExp, string, string]> = [
    [/delete|retention|transcript|history|wip|data loss|数据/, "data-retention", "数据、记录与保留"],
    [/desktop|windows|macos|linux|dark appearance|contrast|editor|界面/, "client-ui", "桌面端与界面"],
    [/remote|ssh|android|phone|pair|authorize|callback/, "remote-access", "远程连接与设备配对"],
    [/background|subagent|notification|resume|restart|long-running/, "long-running", "后台任务与长流程"],
    [/shell|bash|command|slash command|terminal|powershell/, "cli-workflow", "命令行与交互"],
    [/sandbox|approval|policy|permission denied|blocked|权限/, "sandbox-controls", "沙箱、审批与权限控制"],
    [/model|provider|quota|subscription|token budget|rate limit/, "model-config", "模型配置与额度"],
    [/feature request|setting|custom|preference|配置项/, "customization", "配置与可定制性"],
    [/context|token|memory|compaction|prompt length/, "context-memory", "上下文、记忆与长任务"],
    [/install|setup|login|auth|permission|oauth|配置|安装/, "setup-access", "安装、登录与权限"],
    [/tool|mcp|function|plugin|integration|api|hook/, "tool-integration", "工具调用与集成"],
    [/timeout|hang|stuck|crash|error|fail|broken|freeze|卡住|失败/, "reliability", "稳定性与失败恢复"],
    [/slow|latency|performance|speed|stream|cpu|memory usage/, "performance", "速度与资源消耗"],
  ];
  for (const [re, key, title] of rules) if (re.test(t)) return { key, title };
  return { key: "workflow", title: "日常工作流与可控性" };
}

function ruleDemand(title: string, body: string, storyTitle = ""): { problem: string; scenario: string; workaround: string } {
  const cleanTitle = excerpt(title, 280).replace(/[.!?。！？]+$/, "");
  const text = cleanText(body);
  const action = text.match(/(?:I am|I'm|I was|I need to|I want to|trying to|when I|after I)\s+([^.!?。！？]{20,180}[.!?。！？]?)/i);
  const scenario = storyTitle
    ? `用户在讨论“${excerpt(storyTitle, 160)}”时尝试完成相关任务`
    : action ? `用户${excerpt(action[0]!, 220)}` : "用户在使用 AI 工具完成日常编码或自动化任务";
  const workaroundMatch = text.match(/(?:workaround|temporary workaround|as a workaround|fixed by|resolved by|I ended up|解决办法|临时办法)[:：]?\s*([^.!?。！？]{20,220}[.!?。！？]?)/i);
  return { problem: cleanTitle || excerpt(text, 280) || "用户反馈 AI 工具无法稳定完成任务", scenario, workaround: workaroundMatch ? excerpt(workaroundMatch[1]!, 260) : "" };
}

async function llmDemand(input: { title: string; body: string; storyTitle?: string }): Promise<z.infer<typeof demandSchema> | null> {
  if (!process.env.LLM_BASE_URL || !process.env.LLM_API_KEY || !process.env.LLM_MODEL) return null;
  try {
    const out = await chatJson({
      model: "default", purpose: "insight_demand_extract", subject: "insight-demand", promptVersion: "insights-v1",
      system: "从公开用户反馈中抽取一个具体问题。只返回 JSON：problem（一句话问题）、scenario（用户当时要完成什么）、workaround（现有绕行，没有则空字符串）。不要臆测。",
      user: JSON.stringify(input), schema: demandSchema, temperature: 0, maxTokens: 600,
    });
    return out.data;
  } catch {
    return null;
  }
}

function claimType(title: string): "性能" | "成本" | "用户量" | "Benchmark" | "产品能力" {
  const t = title.toLowerCase();
  if (/benchmark|score|eval|swe-bench|pass rate|accuracy|排名/.test(t)) return "Benchmark";
  if (/cost|price|cheaper|expensive|token|pricing|费用|价格/.test(t)) return "成本";
  if (/users|million|adoption|downloads|customers|用户|下载/.test(t)) return "用户量";
  if (/fast|faster|speed|latency|performance|throughput|context|性能/.test(t)) return "性能";
  return "产品能力";
}

async function llmClaim(input: { title: string; author: string }): Promise<z.infer<typeof claimSchema> | null> {
  if (!process.env.LLM_BASE_URL || !process.env.LLM_API_KEY || !process.env.LLM_MODEL) return null;
  try {
    const out = await chatJson({
      model: "default", purpose: "insight_claim_extract", subject: "insight-claim", promptVersion: "insights-v1",
      system: "从公开标题中抽取原始 Claim。只返回 JSON：claim（忠实保留原主张）、claimant（作者或来源）、claimType（性能/成本/用户量/Benchmark/产品能力）。无法判断类型时用产品能力。不要判断真假。",
      user: JSON.stringify(input), schema: claimSchema, temperature: 0, maxTokens: 500,
    });
    return out.data;
  } catch {
    return null;
  }
}

function overlap(a: string, b: string): number {
  const words = (s: string) => new Set((s.toLowerCase().match(/[a-z][a-z0-9-]{4,}/g) ?? []).slice(0, 16));
  const left = words(a); const right = words(b); let n = 0;
  for (const w of left) if (right.has(w)) n++;
  return n;
}

async function collectDemands(): Promise<number> {
  const [github, ...commentSets] = await Promise.all([githubIssues(), ...hnCommentQueries.map((q) => searchHn(q, "comment").catch(() => []))]);
  const comments = [...new Map(commentSets.flat().filter((h) => h.objectID && h.comment_text).map((h) => [h.objectID, h])).values()];
  const problemSignal = /\b(can't|cannot|doesn't|didn't|unable|error|bug|issue|problem|failed|fails|stuck|broken|need|how do|not work|workaround|wish|missing|slow|crash|delete|loop|timeout|pain|困惑|失败|问题|卡住)\b/i;
  const selectedComments = comments.filter((h) => {
    const text = cleanText(h.comment_text);
    return text.length >= 60 && problemSignal.test(text);
  }).slice(0, 16);
  const sources: Array<{ id: string; title: string; body: string; url: string; sourceName: string; user: string | null; kind: string; observedAt: string; storyTitle?: string }> = [];
  for (const issue of github.slice(0, 36)) sources.push({ id: `${issue.repo}#${issue.number}`, title: issue.title, body: issue.body ?? "", url: issue.html_url, sourceName: `GitHub · ${issue.repo}`, user: issue.user?.login ?? null, kind: "github_issue", observedAt: issue.updated_at });
  for (const hit of selectedComments) sources.push({ id: `hn:${hit.objectID}`, title: excerpt(hit.comment_text!, 280), body: hit.comment_text ?? "", url: `https://news.ycombinator.com/item?id=${hit.objectID}`, sourceName: "Hacker News 评论", user: hit.author ?? null, kind: "hn_comment", observedAt: hit.created_at ?? new Date().toISOString(), storyTitle: hit.story_title });
  await sql`DELETE FROM insight_demands WHERE source_kind IN ('github_issue', 'hn_comment')`;
  let written = 0;
  for (const item of sources) {
    const parsed = (await llmDemand({ title: item.title, body: item.body, storyTitle: item.storyTitle })) ?? ruleDemand(item.title, item.body, item.storyTitle);
    const theme = themeFor(`${parsed.problem} ${parsed.scenario}`);
    await sql`
      INSERT INTO insight_demands (theme_key, theme_title, problem, scenario, workaround, evidence, original_url, source_name, source_user, source_item_id, source_kind, observed_at)
      VALUES (${theme.key}, ${theme.title}, ${parsed.problem}, ${parsed.scenario}, ${parsed.workaround ?? ""}, ${excerpt(item.body || item.title)}, ${item.url}, ${item.sourceName}, ${item.user}, ${item.id}, ${item.kind}, ${new Date(item.observedAt)})
      ON CONFLICT (source_kind, source_item_id) DO UPDATE SET theme_key = EXCLUDED.theme_key, theme_title = EXCLUDED.theme_title, problem = EXCLUDED.problem, scenario = EXCLUDED.scenario, workaround = EXCLUDED.workaround, evidence = EXCLUDED.evidence, observed_at = EXCLUDED.observed_at`;
    written++;
  }
  return written;
}

async function collectClaims(): Promise<number> {
  const sets = await Promise.all(hnClaimQueries.map((q) => searchHn(q, "story").catch(() => [])));
  const hits = [...new Map(sets.flat().filter((h) => h.objectID && (h.title || h.story_text)).map((h) => [h.objectID, h])).values()]
    .filter((h) => (h.title ?? "").length >= 20).slice(0, 40);
  const claims: Array<{ hit: HnHit; claim: string; claimant: string; type: z.infer<typeof claimSchema>["claimType"] }> = [];
  for (const hit of hits) {
    const parsed = await llmClaim({ title: hit.title ?? "", author: hit.author ?? "公开来源" });
    claims.push({ hit, claim: parsed?.claim ?? excerpt(hit.title ?? "", 360), claimant: parsed?.claimant ?? hit.author ?? "公开来源", type: parsed?.claimType ?? claimType(hit.title ?? "") });
  }
  await sql`DELETE FROM insight_claims WHERE source_item_id LIKE 'hn:%'`;
  let written = 0;
  for (const current of claims) {
    const title = current.hit.title ?? current.claim;
    const evidence: Array<{ kind: "support" | "conflict"; url: string; quote: string; source: string }> = [];
    for (const other of claims) {
      if (other === current || other.hit.objectID === current.hit.objectID) continue;
      if (other.type !== current.type && overlap(title, other.hit.title ?? "") < 2) continue;
      if (overlap(title, other.hit.title ?? "") < 1) continue;
      const otherUrl = other.hit.url || `https://news.ycombinator.com/item?id=${other.hit.objectID}`;
      const conflict = /not|failed|wrong|debunk|versus|vs\.?|but|however|问题|失败/i.test(other.hit.title ?? "");
      evidence.push({ kind: conflict ? "conflict" : "support", url: otherUrl, quote: excerpt(other.hit.title ?? other.claim, 220), source: `Hacker News · ${other.claimant}` });
      if (evidence.length >= 2) break;
    }
    const status = evidence.some((e) => e.kind === "conflict") ? "存在冲突证据" : evidence.length >= 2 ? "有较强支持" : evidence.length === 1 ? "部分支持" : "未验证";
    const missing = status === "未验证" ? "需要原始数据、可复现实验或厂商公开方法说明" : status === "部分支持" ? "需要独立来源或可重复测试确认规模" : "";
    const sourceId = `hn:${current.hit.objectID}`;
    const original = current.hit.url || `https://news.ycombinator.com/item?id=${current.hit.objectID}`;
    await sql`
      INSERT INTO insight_claims (claim, claimant, claim_type, original_source, evidence, status, missing_evidence, source_item_id, observed_at)
      VALUES (${current.claim}, ${current.claimant}, ${current.type}, ${original}, ${sql.json(evidence as never)}, ${status}, ${missing}, ${sourceId}, ${new Date(current.hit.created_at ?? Date.now())})
      ON CONFLICT (source_item_id) DO UPDATE SET claim = EXCLUDED.claim, claimant = EXCLUDED.claimant, claim_type = EXCLUDED.claim_type, original_source = EXCLUDED.original_source, evidence = EXCLUDED.evidence, status = EXCLUDED.status, missing_evidence = EXCLUDED.missing_evidence, observed_at = EXCLUDED.observed_at`;
    written++;
  }
  return written;
}

try {
  const demands = await collectDemands();
  const claims = await collectClaims();
  const [{ demandCount }] = await sql<{ demandCount: number }[]>`SELECT count(*)::int AS "demandCount" FROM insight_demands`;
  const [{ claimCount }] = await sql<{ claimCount: number }[]>`SELECT count(*)::int AS "claimCount" FROM insight_claims`;
  console.log(JSON.stringify({ ok: true, upserted: { demands, claims }, totals: { demands: demandCount, claims: claimCount } }));
} finally {
  await closeDb();
}
