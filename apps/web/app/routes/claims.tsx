import { useLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/claims";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { buildDateGroups, formatShanghaiTime } from "../lib/date-groups";
import { publicText } from "../lib/public-text";

type Evidence = { kind: "support" | "conflict" | "related"; url: string; quote?: string; quoteZh?: string | null; summaryZh?: string | null; source?: string | null };
type Claim = { id: number; claim: string; claimZh?: string | null; claimant: string; claimantName?: string | null; claimType: "性能" | "成本" | "用户量" | "Benchmark" | "产品能力"; originalSource: string; evidence: Evidence[]; status: "未验证" | "部分支持" | "有较强支持" | "存在冲突证据"; missingEvidence: string; observedAt: string; supportCount?: number; conflictCount?: number; relatedCount?: number };
type ClaimsResponse = { claims: Claim[]; total: number; generatedAt: string };
export async function loader({ request }: Route.LoaderArgs) { return loadOr404<ClaimsResponse>("/api/site/claims?limit=100", { signal: request.signal }); }
export function meta() { return pageMeta({ title: "牛皮账本", description: "记录公开提出的具体主张，并说明目前查到了什么。", path: "/claims" }); }
export function headers() { return { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120" }; }
const STATUS: Record<Claim["status"], string> = { 未验证: "bg-bg-sunk text-ink-3", 部分支持: "bg-amber-soft text-ink-2", 有较强支持: "bg-ok-soft text-ok-ink", 存在冲突证据: "bg-hot-soft text-hot" };
function hostLabel(url: string) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "原始来源"; } }
function progress(item: Claim) {
  const support = item.supportCount ?? 0;
  const conflict = item.conflictCount ?? 0;
  const related = item.relatedCount ?? 0;
  if (!support && !conflict && !related) return "核查进度：已收录主张，尚未找到可直接核验的公开材料。";
  return `核查进度：直接支持 ${support} 条，冲突 ${conflict} 条，相关材料 ${related} 条。${item.missingEvidence || ""}`;
}
export default function ClaimsPage() {
  const data = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const filter = params.get("status") as Claim["status"] | null;
  const claims = (filter ? data.claims.filter((c) => c.status === filter) : data.claims).slice().sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || b.id - a.id);
  const groups = buildDateGroups(claims, (item) => item.observedAt);
  const setFilter = (value: string) => { const next = new URLSearchParams(params); if (value) next.set("status", value); else next.delete("status"); setParams(next); };
  return <div className="pb-10"><header className="pb-5 pt-5 lg:pt-1"><h1 className="mt-1.5 text-[25px] font-bold text-ink">牛皮账本</h1><p className="mt-2 max-w-2xl text-[14px] leading-7 text-ink-3">这里只记录具体、可核验的公开主张。没有独立复现时保持未验证，不把转载算成证据。</p><div className="mt-3 flex flex-wrap gap-2">{["", "未验证", "部分支持", "有较强支持", "存在冲突证据"].map((status) => <button key={status || "all"} type="button" onClick={() => setFilter(status)} className={`rounded-full px-3 py-1.5 text-[13px] ${filter === (status || null) ? "bg-accent text-white" : "bg-bg-sunk text-ink-3"}`}>{status || `全部 ${data.total}`}</button>)}</div></header><div className="space-y-6">{groups.map((group) => <section key={group.key}><h2 className="mb-3 text-[15px] font-bold text-ink">{group.label}</h2><div className="space-y-3">{group.items.map((item) => <article key={item.id} className="card px-5 py-4"><div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-4"><span className={`rounded-full px-2 py-0.5 ${STATUS[item.status]}`}>{item.status}</span><span>{item.claimantName || item.claimant}</span><time className="ml-auto" dateTime={item.observedAt}>{formatShanghaiTime(item.observedAt)}</time></div><h3 className="mt-3 text-[18px] font-semibold leading-8 text-ink"><a href={`/claims/${item.id}`}>{publicText(item.claimZh, "暂未生成中文主张")}</a></h3><p className="mt-2 text-[14px] leading-7 text-ink-3">{progress(item)}</p><div className="mt-3 flex flex-wrap gap-4 text-[13px]"><a href={`/claims/${item.id}`} className="text-accent">查看核查详情</a><a href={item.originalSource} target="_blank" rel="noreferrer" className="text-accent">{hostLabel(item.originalSource)} ↗</a></div></article>)}</div></section>)}{claims.length === 0 && <div className="card px-5 py-12 text-center text-ink-3">当前筛选下暂无条目。</div>}</div></div>;
}
