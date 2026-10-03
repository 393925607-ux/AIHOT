import { guardedFetch } from "../lib/http-fetch.ts";
import { sha256 } from "../lib/ids.ts";

export type EvidenceAdapterStatus = "success" | "no_result" | "blocked" | "rate_limited" | "error";
export type EvidenceAdapterAudit = {
  adapterId: string; query: string; executedAt: string; status: EvidenceAdapterStatus;
  resultCount: number; urls: string[]; errorClass?: string;
};
export type EvidenceCandidate = { url: string; title: string; adapterId: string; discoveredAt: string; sourceDate?: string; version?: string };
export type DeepRead = EvidenceCandidate & { canonicalUrl: string; retrievedAt: string; contentHash: string; excerpt: string; text: string; status: "ok" | "invalid"; fetchStatus: string };

function canonicalize(raw: string): string {
  const u = new URL(raw); u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k) || /^(ref|source)$/i.test(k)) u.searchParams.delete(k);
  return u.toString().replace(/\/$/, "");
}
function textOnly(input: string): string {
  return input.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}
function errorClass(error: unknown): string { return error instanceof Error ? error.name : "UnknownError"; }
function fetchTarget(url: string): string {
  const gh = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/i.exec(url);
  if (gh) return `https://api.github.com/repos/${gh[1]}/${gh[2]}/${gh[3] === "pull" ? "pulls" : "issues"}/${gh[4]}`;
  const hn = /^https?:\/\/news\.ycombinator\.com\/item\?id=(\d+)/i.exec(url);
  if (hn) return `https://hacker-news.firebaseio.com/v0/item/${hn[1]}.json`;
  return url;
}

async function githubSearch(query: string): Promise<{ audit: EvidenceAdapterAudit; candidates: EvidenceCandidate[] }> {
  const executedAt = new Date().toISOString();
  try {
    const res = await guardedFetch(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=5`, { timeoutMs: 15_000, maxBytes: 2 * 1024 * 1024, headers: { accept: "application/vnd.github+json" } });
    if (res.status === 403 || res.status === 429) return { audit: { adapterId: "github_public_search", query, executedAt, status: "rate_limited", resultCount: 0, urls: [], errorClass: `http_${res.status}` }, candidates: [] };
    if (res.status !== 200) return { audit: { adapterId: "github_public_search", query, executedAt, status: "error", resultCount: 0, urls: [], errorClass: `http_${res.status}` }, candidates: [] };
    const body = JSON.parse(res.text()) as { items?: Array<{ html_url?: string; title?: string; created_at?: string }> };
    const candidates = (body.items ?? []).flatMap((item) => item.html_url ? [{ url: item.html_url, title: item.title ?? "GitHub 结果", adapterId: "github_public_search", discoveredAt: executedAt, sourceDate: item.created_at }] : []);
    return { audit: { adapterId: "github_public_search", query, executedAt, status: candidates.length ? "success" : "no_result", resultCount: candidates.length, urls: candidates.map((x) => x.url) }, candidates };
  } catch (error) { return { audit: { adapterId: "github_public_search", query, executedAt, status: "error", resultCount: 0, urls: [], errorClass: errorClass(error) }, candidates: [] }; }
}

async function hnSearch(query: string): Promise<{ audit: EvidenceAdapterAudit; candidates: EvidenceCandidate[] }> {
  const executedAt = new Date().toISOString();
  try {
    const res = await guardedFetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=5`, { timeoutMs: 15_000, maxBytes: 2 * 1024 * 1024, headers: { accept: "application/json" } });
    if (res.status === 429) return { audit: { adapterId: "hn_algolia", query, executedAt, status: "rate_limited", resultCount: 0, urls: [], errorClass: "http_429" }, candidates: [] };
    if (res.status !== 200) return { audit: { adapterId: "hn_algolia", query, executedAt, status: "error", resultCount: 0, urls: [], errorClass: `http_${res.status}` }, candidates: [] };
    const body = JSON.parse(res.text()) as { hits?: Array<{ url?: string; title?: string; story_url?: string; created_at?: string; objectID?: string }> };
    const candidates = (body.hits ?? []).flatMap((hit) => {
      const url = hit.url ?? (hit.objectID ? `https://news.ycombinator.com/item?id=${hit.objectID}` : hit.story_url);
      return url ? [{ url, title: hit.title ?? "Hacker News 结果", adapterId: "hn_algolia", discoveredAt: executedAt, sourceDate: hit.created_at }] : [];
    });
    return { audit: { adapterId: "hn_algolia", query, executedAt, status: candidates.length ? "success" : "no_result", resultCount: candidates.length, urls: candidates.map((x) => x.url) }, candidates };
  } catch (error) { return { audit: { adapterId: "hn_algolia", query, executedAt, status: "error", resultCount: 0, urls: [], errorClass: errorClass(error) }, candidates: [] }; }
}

export async function retrieveEvidence(queryIntents: string[]): Promise<{ audits: EvidenceAdapterAudit[]; candidates: EvidenceCandidate[]; deepReads: DeepRead[] }> {
  const audits: EvidenceAdapterAudit[] = [];
  const all: EvidenceCandidate[] = [];
  for (const query of queryIntents.slice(0, 5)) {
    const [github, hn] = await Promise.all([githubSearch(query), hnSearch(query)]);
    audits.push(github.audit, hn.audit); all.push(...github.candidates, ...hn.candidates);
  }
  const unique = [...new Map(all.map((c) => [canonicalize(c.url), c])).values()].slice(0, 8);
  const deepReads: DeepRead[] = [];
  for (const candidate of unique) {
    const retrievedAt = new Date().toISOString();
    try {
      const target = fetchTarget(candidate.url);
      const res = await guardedFetch(target, { timeoutMs: 18_000, maxBytes: 4 * 1024 * 1024, headers: { accept: "application/json,text/html" } });
      const text = textOnly(res.text()).slice(0, 16_000);
      const ok = res.status === 200 && text.length >= 160 && !/sign in|log in|enable javascript/i.test(text.slice(0, 500));
      deepReads.push({ ...candidate, canonicalUrl: canonicalize(candidate.url), retrievedAt, contentHash: sha256(text), excerpt: text.slice(0, 600), text, status: ok ? "ok" : "invalid", fetchStatus: `http_${res.status}` });
    } catch (error) { deepReads.push({ ...candidate, canonicalUrl: canonicalize(candidate.url), retrievedAt, contentHash: sha256(""), excerpt: "", text: "", status: "invalid", fetchStatus: errorClass(error) }); }
  }
  return { audits, candidates: unique, deepReads };
}

export { canonicalize, textOnly };
