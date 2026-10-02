import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/signals";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { DATE_GROUPS, dateGroup } from "../lib/date-groups";
import { publicText } from "../lib/public-text";

type Signal = { kind: "demand" | "claim"; id: number; topicKey: string | null; topicLabel: string | null; title: string; detail: string; sourceUrl: string; actor: string; status: string | null; observedAt: string };
type Data = { signals: Signal[]; total: number; topics: Array<{ key: string; label: string; count: number }>; generatedAt: string };

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  return loadOr404<Data>(`/api/site/signals?limit=100${type === "demand" || type === "claim" ? `&type=${type}` : ""}`, { signal: request.signal });
}
export function meta() { return pageMeta({ title: "人工智能现实雷达", description: "把真实需求与公开主张放在同一张现实雷达上。", path: "/signals" }); }
export function headers() { return { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120" }; }

export default function SignalsPage() {
  const data = useLoaderData<typeof loader>();
  const type = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("type");
  const tabs = [{ key: "", label: "全部" }, { key: "demand", label: "真需求" }, { key: "claim", label: "牛皮账本" }];
  const groups = DATE_GROUPS.map(({ key, label }) => ({ key, label, signals: data.signals.filter((signal) => dateGroup(signal.observedAt) === key) }));
  return <div className="pb-10">
    <header className="pb-5 pt-5 lg:pt-1">
      <p className="text-[12px] font-semibold tracking-[0.08em] text-accent">人工智能现实雷达</p>
      <h1 className="mt-1.5 text-[25px] font-bold tracking-[-0.01em] text-ink">人工智能现实雷达</h1>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-[1.75] text-ink-3">把真实用户需求和公开传播的主张放到同一张信号图上，只保留材料、主题和证据，不替你做商业判断。</p>
      <nav className="mt-4 flex gap-2" aria-label="内容类型">{tabs.map((tab) => <Link key={tab.key} to={tab.key ? `/signals?type=${tab.key}` : "/signals"} className={`rounded-full px-3 py-1.5 text-[12.5px] ${type === (tab.key || null) ? "bg-accent text-white" : "bg-bg-sunk text-ink-3 hover:text-ink"}`}>{tab.label}</Link>)}</nav>
    </header>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="space-y-7">{groups.map((group) => <section key={group.key}><h2 className="mb-3 text-[15px] font-bold text-ink">{group.label}</h2><div className="space-y-3">{group.signals.length ? group.signals.map((signal) => <article key={`${signal.kind}-${signal.id}`} className="card px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-4"><span className={`rounded px-2 py-0.5 ${signal.kind === "demand" ? "bg-accent-softer text-accent" : "bg-hot-soft text-hot"}`}>{signal.kind === "demand" ? "真需求" : "牛皮账本"}</span>{signal.status && <span className="rounded bg-bg-sunk px-2 py-0.5">{signal.status}</span>}{signal.topicKey && <Link to={`/signals/topic/${signal.topicKey}`} className="text-accent hover:text-accent-ink">#{signal.topicLabel ?? "相关主题"}</Link>}</div>
        <h2 className="mt-2 text-[16px] font-semibold leading-relaxed text-ink">{publicText(signal.title, "已收录一条公开材料")}</h2><p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{signal.kind === "demand" ? "用户在实际使用中遇到了这个问题。" : publicText(signal.detail, "提出方公开发布了这项主张。")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-4"><span>{signal.kind === "demand" ? "真实用户反馈" : "公开主张"}</span><span>·</span><a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-ink">查看原文 ↗</a></div>
      </article>) : <p className="text-[13px] text-ink-4">这一天暂无内容。</p>}</div></section>)}</div>
      <aside className="card h-fit p-4"><h2 className="text-[13px] font-semibold text-ink">共享 Topic</h2><div className="mt-2 space-y-1.5">{data.topics.map((topic) => <Link key={topic.key} to={`/signals/topic/${topic.key}`} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-[12.5px] text-ink-3 hover:bg-bg-sunk hover:text-ink"><span className="truncate">{topic.label}</span><span className="num text-ink-4">{topic.count}</span></Link>)}</div></aside>
    </div>
  </div>;
}
