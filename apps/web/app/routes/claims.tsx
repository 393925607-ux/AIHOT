import { useLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/claims";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { buildDateGroups } from "../lib/date-groups";
import { claimMeta, claimProgress, claimTitle } from "../lib/radar-copy";
import { RadarCard } from "../components/RadarCard";

type Evidence = { kind: "support" | "conflict" | "related"; url: string; quote?: string; quoteZh?: string | null; summaryZh?: string | null; source?: string | null };
type Claim = { id: number; claim: string; claimZh?: string | null; claimant: string; claimantName?: string | null; claimType: "性能" | "成本" | "用户量" | "Benchmark" | "产品能力"; originalSource: string; evidence: Evidence[]; status: "未验证" | "部分支持" | "有较强支持" | "存在冲突证据"; missingEvidence: string; observedAt: string; supportCount?: number; conflictCount?: number; relatedCount?: number };
type ClaimsResponse = { claims: Claim[]; total: number; offset: number; generatedAt: string };
export async function loader({ request }: Route.LoaderArgs) { const url = new URL(request.url); const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0); return loadOr404<ClaimsResponse>(`/api/site/claims?limit=100&offset=${offset}`, { signal: request.signal }); }
export function meta() { return pageMeta({ title: "牛皮账本", description: "记录公开提出的具体主张，并说明目前查到了什么。", path: "/claims" }); }
export function headers() { return { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120" }; }
export default function ClaimsPage() {
  const data = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const filter = params.get("status") as Claim["status"] | null;
  const claims = (filter ? data.claims.filter((c) => c.status === filter) : data.claims).slice().sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || b.id - a.id);
  const groups = buildDateGroups(claims, (item) => item.observedAt);
  const setFilter = (value: string) => { const next = new URLSearchParams(params); if (value) next.set("status", value); else next.delete("status"); setParams(next); };
  return <div className="pb-10"><header className="pb-5 pt-5 lg:pt-1"><h1 className="mt-1.5 text-[25px] font-bold text-ink">牛皮账本</h1><p className="mt-2 max-w-2xl text-[14px] leading-7 text-ink-3">这里只记录具体、可核验的公开主张。没有独立复现时保持未验证，不把转载算成证据。</p><div className="mt-3 flex flex-wrap gap-2">{["", "未验证", "部分支持", "有较强支持", "存在冲突证据"].map((status) => <button key={status || "all"} type="button" onClick={() => setFilter(status)} className={`rounded-full px-3 py-1.5 text-[13px] ${filter === (status || null) ? "bg-accent text-white" : "bg-bg-sunk text-ink-3"}`}>{status || `全部 ${data.total}`}</button>)}</div></header><div className="space-y-6">{groups.map((group) => <section key={group.key}><h2 className="mb-3 text-[15px] font-bold text-ink">{group.label}</h2><div className="space-y-3">{group.items.map((item) => <RadarCard key={item.id} kind="牛皮账本" status={item.status} observedAt={item.observedAt} title={claimTitle(item)} summary={claimProgress(item)} meta={claimMeta(item)} footer={<><a href={`/claims/${item.id}`}>查看核查详情 →</a><a href={item.originalSource} target="_blank" rel="noreferrer">查看原文 ↗</a></>} />)}</div></section>)}{claims.length === 0 && <div className="card px-5 py-12 text-center text-ink-3">当前筛选下暂无条目。</div>}{(data.offset > 0 || data.offset + data.claims.length < data.total) && <nav className="flex justify-center gap-3 pt-2 text-[13px]" aria-label="主张分页">{data.offset > 0 && <a className="text-accent" href={`/claims?offset=${Math.max(data.offset - 100, 0)}`}>上一页</a>}{data.offset + data.claims.length < data.total && <a className="text-accent" href={`/claims?offset=${data.offset + 100}`}>下一页</a>}</nav>}</div></div>;
}
