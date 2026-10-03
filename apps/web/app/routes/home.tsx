import { Link, useLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/home";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { buildDateGroups } from "../lib/date-groups";
import { RadarCard } from "../components/RadarCard";
import { claimMeta, claimProgress, claimTitle, demandMeta, demandSummary, demandTitle, evidenceLabel, type ClaimCopy, type DemandCopyTheme } from "../lib/radar-copy";

type DemandResponse = { themes: DemandCopyTheme[]; totalThemes: number; sort: "latest" | "evidence"; generatedAt: string };
type ClaimResponse = { claims: ClaimCopy[]; total: number; generatedAt: string };
type FeedItem = { key: string; kind: "demand" | "claim"; observedAt: string; status: string; title: string; summary: string; meta: string; detailPath: string; sourceUrl: string };

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const demandQuery = type === "claim" ? null : "/api/site/demands?limit=12&sort=latest";
  const claimQuery = type === "demand" ? null : "/api/site/claims?limit=12";
  const [demands, claims] = await Promise.all([
    demandQuery ? loadOr404<DemandResponse>(demandQuery, { signal: request.signal }) : Promise.resolve(null),
    claimQuery ? loadOr404<ClaimResponse>(claimQuery, { signal: request.signal }) : Promise.resolve(null),
  ]);
  return { type: type === "demand" || type === "claim" ? type : "all", demands, claims };
}

export function meta() { return pageMeta({ title: "今日总览", description: "今天的真实需求和公开主张。", path: "/" }); }
export function headers() { return { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120" }; }

function feed(demands: DemandResponse | null, claims: ClaimResponse | null): FeedItem[] {
  const demandItems = (demands?.themes ?? []).map((theme): FeedItem => ({
    key: `demand-${theme.themeKey}`,
    kind: "demand",
    observedAt: theme.latestAt,
    status: evidenceLabel(theme),
    title: demandTitle(theme),
    summary: demandSummary(theme),
    meta: demandMeta(theme),
    detailPath: `/demands/${encodeURIComponent(theme.themeKey)}`,
    sourceUrl: theme.samples[0]?.originalUrl ?? "",
  }));
  const claimItems = (claims?.claims ?? []).map((item): FeedItem => ({
    key: `claim-${item.id}`,
    kind: "claim",
    observedAt: item.observedAt,
    status: item.status,
    title: claimTitle(item),
    summary: claimProgress(item),
    meta: claimMeta(item),
    detailPath: `/claims/${item.id}`,
    sourceUrl: item.originalSource,
  }));
  return [...demandItems, ...claimItems].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || a.key.localeCompare(b.key));
}

export default function Home() {
  const data = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const type = params.get("type");
  const active = type === "demand" || type === "claim" ? type : "all";
  const tabs = [{ key: "all", label: "全部", to: "/" }, { key: "demand", label: "真需求", to: "/?type=demand" }, { key: "claim", label: "牛皮账本", to: "/?type=claim" }];
  const items = feed(data.demands, data.claims);
  const groups = buildDateGroups(items, (item) => item.observedAt);
  return <div className="pb-10">
    <header className="pb-5 pt-5 lg:pt-1">
      <p className="text-[12px] font-semibold tracking-[0.08em] text-accent">今日总览</p>
      <h1 className="mt-1.5 text-[26px] font-bold tracking-[-0.02em] text-ink">人工智能现实雷达</h1>
      <p className="mt-2 max-w-xl text-[14px] leading-[1.75] text-ink-3">今天的真实需求和公开主张，按最新时间混排。点进详情再看完整证据。</p>
      <nav className="mt-4 flex gap-2" aria-label="内容筛选">{tabs.map((tab) => <Link key={tab.key} to={tab.to} className={`rounded-full px-3 py-1.5 text-[12.5px] ${active === tab.key ? "bg-accent text-white" : "bg-bg-sunk text-ink-3 hover:text-ink"}`}>{tab.label}</Link>)}</nav>
    </header>
    <div className="space-y-7">
      {groups.map((group) => <section key={group.key} aria-labelledby={`home-${group.key}`}>
        <div className="mb-3 flex items-center gap-3">
          <h2 id={`home-${group.key}`} className="text-[14px] font-semibold text-ink">{group.label}</h2>
          <div className="h-px flex-1 bg-line" />
        </div>
        <div className="space-y-3">{group.items.map((item) => <RadarCard key={item.key} kind={item.kind === "demand" ? "真需求" : "牛皮账本"} status={item.status} observedAt={item.observedAt} title={item.title} summary={<span className="line-clamp-2">{item.summary}</span>} meta={item.meta} footer={<><Link to={item.detailPath}>查看详情 →</Link>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">查看原文 ↗</a>}</>} />)}</div>
      </section>)}
    </div>
    {items.length === 0 && <div className="card px-5 py-12 text-center text-[14px] text-ink-3">当前没有内容。</div>}
  </div>;
}
