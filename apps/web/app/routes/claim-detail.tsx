import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/claim-detail";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { dateGroup } from "../lib/date-groups";
import { publicText } from "../lib/public-text";

type Evidence = { kind: "support" | "conflict" | "related"; url: string; quote?: string; quoteZh?: string | null; summaryZh?: string | null; source?: string | null };
type Claim = { id: number; claim: string; claimZh?: string | null; claimant: string; claimantName?: string | null; claimType: string; originalSource: string; evidence: Evidence[]; status: string; missingEvidence: string; observedAt: string; topicKey: string | null; topicLabel: string | null; supportCount?: number; conflictCount?: number; relatedCount?: number };

export async function loader({ request, params }: Route.LoaderArgs) {
  return loadOr404<Claim>(`/api/site/claims/${encodeURIComponent(params.id ?? "")}`, { signal: request.signal });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return pageMeta({ title: loaderData?.claimZh ?? "牛皮账本", description: "公开主张的证据详情。", path: `/claims/${loaderData?.id ?? ""}` });
}

const CLAIM_TYPE: Record<string, string> = { 性能: "性能", 成本: "成本", 用户量: "用户量", Benchmark: "基准测试", 产品能力: "产品能力" };

function claimantLabel(value: string | null | undefined) {
  if (value === "Alibaba / Qwen") return "阿里巴巴 / 通义千问";
  if (value === "OliverDB / OliverAI") return "奥利弗数据库";
  if (value === "Bito") return "比托";
  return publicText(value, "未标注提出方");
}

function kindLabel(kind: Evidence["kind"]) {
  return kind === "support" ? "支持" : kind === "conflict" ? "冲突" : "相关材料";
}

function evidenceText(evidence: Evidence) {
  return evidence.summaryZh?.trim() || evidence.quoteZh?.trim() || "原文摘录已隐藏，请点击来源查看。";
}

function sourceLabel(source: string | null | undefined) {
  const value = source?.toLowerCase() ?? "";
  if (value.includes("bito")) return "比托官网";
  if (value.includes("qwen") || value.includes("alibaba")) return "阿里巴巴 / 通义千问官网";
  if (value.includes("oliver")) return "奥利弗数据库官网";
  return "查看来源";
}

export default function ClaimDetailPage() {
  const claim = useLoaderData<typeof loader>();
  const displayClaim = publicText(claim.claimZh, "暂无中文主张");
  const group = dateGroup(claim.observedAt);
  const groupLabel = group === "today" ? "今天" : group === "yesterday" ? "昨天" : "更早";
  return <div className="pb-10">
    <header className="pb-5 pt-5 lg:pt-1">
      <Link to="/claims" className="text-[12px] text-accent">← 牛皮账本</Link>
      <h1 className="mt-2 text-[25px] font-bold text-ink">{displayClaim}</h1>
      <div className="mt-2 flex flex-wrap gap-2 text-[12px] text-ink-4"><span>{claimantLabel(claim.claimantName ?? claim.claimant)}</span><span>·</span><span>{CLAIM_TYPE[claim.claimType] ?? "主张"}</span><span className="rounded bg-bg-sunk px-2 py-0.5">{claim.status}</span><span>· {groupLabel}</span></div>
    </header>
    <div className="space-y-3">
      <section className="card p-5"><h2 className="text-[14px] font-bold text-ink">主张</h2><p className="mt-2 text-[13px] leading-relaxed text-ink-2">{displayClaim}</p><a href={claim.originalSource} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[12px] text-accent">打开原始出处 ↗</a></section>
      <section className="card p-5"><h2 className="text-[14px] font-bold text-ink">证据</h2>{claim.evidence.length ? <ul className="mt-3 space-y-3">{claim.evidence.map((e, i) => <li key={`${e.url}-${i}`} className="text-[13px] leading-relaxed"><span className={`mr-2 rounded px-1.5 py-0.5 text-[11px] ${e.kind === "support" ? "bg-ok-soft text-ok-ink" : e.kind === "conflict" ? "bg-hot-soft text-hot" : "bg-bg-sunk text-ink-3"}`}>{kindLabel(e.kind)}</span><a href={e.url} target="_blank" rel="noreferrer" className="text-accent">{sourceLabel(e.source)}</a><p className="mt-1 text-ink-3">{evidenceText(e)}</p></li>)}</ul> : <p className="mt-2 text-[13px] text-ink-3">暂未找到可直接支持或冲突的独立证据。</p>}</section>
      <section className="card p-5"><h2 className="text-[14px] font-bold text-ink">还缺什么证据</h2><p className="mt-2 text-[13px] leading-relaxed text-ink-3">{claim.missingEvidence || "暂无"}</p></section>
    </div>
  </div>;
}
