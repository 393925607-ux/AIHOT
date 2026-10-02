import { useLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/claims";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";

type Evidence = { kind: "support" | "conflict" | "related"; url: string; quote: string; source: string };
type Claim = { id: number; claim: string; claimZh?: string | null; claimant: string; claimantName?: string | null; claimantType?: string | null; claimantInterest?: string | null; claimType: "性能" | "成本" | "用户量" | "Benchmark" | "产品能力"; originalSource: string; evidence: Evidence[]; status: "未验证" | "部分支持" | "有较强支持" | "存在冲突证据"; missingEvidence: string; observedAt: string; topicKey: string | null; topicLabel: string | null; supportCount?: number; conflictCount?: number; relatedCount?: number };
type ClaimsResponse = { claims: Claim[]; total: number; generatedAt: string };

export async function loader({ request }: Route.LoaderArgs) {
  return loadOr404<ClaimsResponse>("/api/site/claims?limit=100", { signal: request.signal });
}

export function meta() {
  return pageMeta({ title: "AI 牛皮账本", description: "记录 AI 圈公开传播的强 Claim，并保留支持、冲突和缺失证据。", path: "/claims" });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120" };
}

const STATUS: Record<Claim["status"], string> = { 未验证: "bg-bg-sunk text-ink-3", 部分支持: "bg-amber-soft text-ink-2", 有较强支持: "bg-ok-soft text-ok-ink", 存在冲突证据: "bg-hot-soft text-hot" };

export default function ClaimsPage() {
  const data = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const filter = params.get("status") as Claim["status"] | null;
  const claims = filter ? data.claims.filter((c) => c.status === filter) : data.claims;
  const setFilter = (value: string) => { const next = new URLSearchParams(params); if (value) next.set("status", value); else next.delete("status"); setParams(next); };
  return (
    <div className="pb-10">
      <header className="pb-5 pt-5 lg:pt-1">
        <p className="text-[12px] font-semibold tracking-[0.08em] text-hot">CLAIM LEDGER</p>
        <h1 className="mt-1.5 text-[25px] font-bold tracking-[-0.01em] text-ink">牛皮账本</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-[1.75] text-ink-3">AI 圈那些很猛的说法，到底有多少证据？转载不算独立证据，无法确认就保持“未验证”。</p>
        <div className="mt-3 flex flex-wrap gap-2">{["", "未验证", "部分支持", "有较强支持", "存在冲突证据"].map((status) => <button key={status || "all"} type="button" onClick={() => setFilter(status)} className={`rounded-full px-2.5 py-1 text-[12px] transition-colors ${filter === (status || null) ? "bg-accent text-white" : "bg-bg-sunk text-ink-3 hover:text-ink"}`}>{status || `全部 ${data.total}`}</button>)}</div>
      </header>
      <div className="space-y-3">
        {claims.map((item) => (
          <article key={item.id} className="card px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-4"><span className="rounded bg-accent-softer px-2 py-0.5 text-accent">{item.claimType}</span><span className={`rounded-full px-2 py-0.5 font-medium ${STATUS[item.status]}`}>{item.status}</span>{item.topicKey && <a href={`/signals/topic/${item.topicKey}`} className="text-accent hover:text-accent-ink">#{item.topicLabel ?? item.topicKey}</a>}<span className="ml-auto">{item.claimantName ?? item.claimant}</span></div>
            <h2 className="mt-3 text-[16px] font-semibold leading-relaxed text-ink"><a href={`/claims/${item.id}`} className="hover:text-accent">{item.claimZh ?? item.claim}</a></h2>
            <p className="mt-1 text-[12px] text-ink-4">{item.supportCount ?? 0} 条支持 · {item.conflictCount ?? 0} 条冲突 · {item.relatedCount ?? 0} 条相关材料</p>
            <div className="mt-3 grid gap-3 text-[13px] leading-relaxed text-ink-3 sm:grid-cols-2"><div><p className="mb-1 text-[11.5px] font-medium text-ink-4">原始来源</p><a href={item.originalSource} target="_blank" rel="noreferrer" className="break-all text-accent hover:text-accent-ink">{item.originalSource}</a></div><div><p className="mb-1 text-[11.5px] font-medium text-ink-4">还缺什么</p><p>{item.missingEvidence || "暂无"}</p></div></div>
            {item.evidence.length > 0 && <div className="mt-3 border-t border-line-soft pt-3"><p className="mb-2 text-[11.5px] font-medium text-ink-4">支持 / 冲突 / 相关证据</p><ul className="space-y-2">{item.evidence.map((e, i) => <li key={`${e.url}-${i}`} className="text-[12.5px] leading-relaxed"><span className={`mr-1.5 rounded px-1.5 py-0.5 text-[11px] ${e.kind === "support" ? "bg-ok-soft text-ok-ink" : e.kind === "conflict" ? "bg-hot-soft text-hot" : "bg-bg-sunk text-ink-3"}`}>{e.kind === "support" ? "支持" : e.kind === "conflict" ? "冲突" : "相关"}</span><a href={e.url} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-ink">{e.source}</a>{e.quote && <span className="ml-1 text-ink-3">— {e.quote}</span>}</li>)}</ul></div>}
          </article>
        ))}
        {claims.length === 0 && <div className="card px-5 py-12 text-center text-[14px] text-ink-3">当前筛选下没有 Claim。</div>}
      </div>
    </div>
  );
}
