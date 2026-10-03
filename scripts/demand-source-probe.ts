/** Read-only probe for public Demand sources. No database writes. */
import { mkdirSync, writeFileSync } from "node:fs";

type Probe = { sourceName: string; sourceFamily: string; url: string; method: string; status: string; last30dCandidates: number; sampleQuality: string; note?: string };
const UA = "AI-Reality-Radar/1.0 (public-source-probe)";
const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
const get = async (url: string) => fetch(url, { headers: { "user-agent": UA, accept: "application/json, application/rss+xml, application/atom+xml, text/html" }, signal: AbortSignal.timeout(20_000) });
const parseDate = (v: unknown) => { const n = typeof v === "number" ? v * 1000 : Date.parse(String(v ?? "")); return Number.isFinite(n) ? n : 0; };
const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&(?:amp|lt|gt|quot|#39);/g, " ").replace(/\s+/g, " ").trim();

async function probeGitHub(repo: string): Promise<Probe> {
  const url = `https://api.github.com/repos/${repo}/discussions?per_page=100&sort=updated&direction=desc`;
  try { const res = await get(url); if (!res.ok) return { sourceName: `GitHub Discussions · ${repo}`, sourceFamily: "github_discussions", url, method: "GitHub REST", status: `blocked_http_${res.status}`, last30dCandidates: 0, sampleQuality: "blocked", note: "公开 API 当前不可读取" }; const rows = await res.json() as Array<{ updated_at?: string; category?: { slug?: string } }>; const eligible = rows.filter((r) => parseDate(r.updated_at) >= cutoff && !/announcement|showcase|general/i.test(r.category?.slug ?? "")).length; return { sourceName: `GitHub Discussions · ${repo}`, sourceFamily: "github_discussions", url, method: "GitHub REST", status: "public_ok", last30dCandidates: eligible, sampleQuality: eligible ? "needs_gate" : "low_volume" }; } catch (e) { return { sourceName: `GitHub Discussions · ${repo}`, sourceFamily: "github_discussions", url, method: "GitHub REST", status: "fetch_error", last30dCandidates: 0, sampleQuality: "blocked", note: e instanceof Error ? e.name : "error" }; }
}

async function main() {
  const probes: Probe[] = [];
  for (const repo of ["openai/codex", "Aider-AI/aider", "cline/cline", "continuedev/continue", "ollama/ollama", "anthropics/claude-code"]) probes.push(await probeGitHub(repo));
  const communityUrl = "https://community.openai.com/c/codex/37.rss";
  try { const res = await get(communityUrl); const body = await res.text(); const dates = [...body.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)].map((m) => parseDate(m[1])).filter((d) => d >= cutoff).length; probes.push({ sourceName: "OpenAI Community Codex", sourceFamily: "vendor_forum", url: communityUrl, method: "RSS", status: res.ok ? "public_ok" : `blocked_http_${res.status}`, last30dCandidates: res.ok ? dates : 0, sampleQuality: res.ok ? "needs_gate" : "blocked" }); } catch (e) { probes.push({ sourceName: "OpenAI Community Codex", sourceFamily: "vendor_forum", url: communityUrl, method: "RSS", status: "fetch_error", last30dCandidates: 0, sampleQuality: "blocked", note: e instanceof Error ? e.name : "error" }); }
  const stackIds = new Set<string>(), stackTags = ["claude", "github-copilot", "openai-api", "llama-index", "ollama"];
  let stackStatus = "public_ok";
  for (const tag of stackTags) {
    const stackUrl = `https://api.stackexchange.com/2.3/questions?order=desc&sort=activity&tagged=${encodeURIComponent(tag)}&site=stackoverflow&pagesize=100&filter=withbody`;
    try { const res = await get(stackUrl); if (!res.ok) { stackStatus = `partial_http_${res.status}`; continue; } const data = await res.json() as { items?: Array<{ question_id?: number; last_activity_date?: number }> }; for (const x of (data.items ?? []).filter((x) => parseDate(x.last_activity_date) >= cutoff)) if (x.question_id != null) stackIds.add(String(x.question_id)); } catch { stackStatus = "partial_fetch_error"; }
  }
  probes.push({ sourceName: "Stack Overflow", sourceFamily: "stack_exchange", url: "https://api.stackexchange.com/2.3/questions", method: "Stack Exchange API（按标签分别读取）", status: stackStatus, last30dCandidates: stackIds.size, sampleQuality: stackIds.size ? "needs_gate" : "low_volume", note: `tags=${stackTags.join(",")}` });
  const hfUrl = "https://discuss.huggingface.co/latest.json";
  try { const res = await get(hfUrl); const data = await res.json() as { topic_list?: { topics?: Array<{ last_posted_at?: string; excerpt?: string }> } }; const n = (data.topic_list?.topics ?? []).filter((x) => parseDate(x.last_posted_at) >= cutoff && strip(x.excerpt ?? "").length >= 80).length; probes.push({ sourceName: "Hugging Face 社区", sourceFamily: "community_forum", url: hfUrl, method: "Discourse JSON", status: res.ok ? "public_ok" : `blocked_http_${res.status}`, last30dCandidates: res.ok ? n : 0, sampleQuality: res.ok ? "noisy_needs_strict_gate" : "blocked" }); } catch (e) { probes.push({ sourceName: "Hugging Face 社区", sourceFamily: "community_forum", url: hfUrl, method: "Discourse JSON", status: "fetch_error", last30dCandidates: 0, sampleQuality: "blocked", note: e instanceof Error ? e.name : "error" }); }
  const redditUrl = "https://www.reddit.com/r/ClaudeAI/.rss";
  try { const res = await get(redditUrl); probes.push({ sourceName: "Reddit r/ClaudeAI", sourceFamily: "reddit", url: redditUrl, method: "RSS", status: res.ok ? "public_ok" : `blocked_http_${res.status}`, last30dCandidates: 0, sampleQuality: res.ok ? "optional_needs_gate" : "blocked" }); } catch (e) { probes.push({ sourceName: "Reddit r/ClaudeAI", sourceFamily: "reddit", url: redditUrl, method: "RSS", status: "fetch_error", last30dCandidates: 0, sampleQuality: "blocked", note: e instanceof Error ? e.name : "error" }); }
  mkdirSync(".data/dual-recovery", { recursive: true, mode: 0o700 }); writeFileSync(".data/dual-recovery/demand-source-probe.json", JSON.stringify({ generatedAt: new Date().toISOString(), cutoff: new Date(cutoff).toISOString(), probes }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ok: true, probes }));
}
await main();
