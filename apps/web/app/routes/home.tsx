import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";

type Signal = { kind: "demand" | "claim"; id: number; topicKey: string | null; topicLabel: string | null; title: string; detail: string; sourceUrl: string; actor: string; status: string | null; observedAt: string };
type Data = { signals: Signal[]; total: number; topics: Array<{ key: string; label: string; count: number }>; generatedAt: string };

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const query = type === "demand" || type === "claim" ? `?type=${type}&limit=24` : "?limit=24";
  return loadOr404<Data>(`/api/site/signals${query}`, { signal: request.signal });
}

export function meta() { return pageMeta({ title: "AI Reality Radar", description: "看真实需求，也查 AI 牛皮。", path: "/" }); }
export function headers() { return { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120" }; }

function SignalCard({ signal }: { signal: Signal }) {
  return <article className="card px-5 py-4 sm:px-6">
    <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-4">
      <span className={`rounded px-2 py-0.5 ${signal.kind === "demand" ? "bg-accent-softer text-accent" : "bg-hot-soft text-hot"}`}>{signal.kind === "demand" ? "真需求" : "牛皮账本"}</span>
      {signal.status && <span className="rounded bg-bg-sunk px-2 py-0.5">{signal.status}</span>}
      {signal.topicKey && <Link to={`/signals/topic/${signal.topicKey}`} className="text-accent hover:text-accent-ink">#{signal.topicLabel ?? signal.topicKey}</Link>}
      <time className="ml-auto" dateTime={signal.observedAt}>{new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(signal.observedAt))}</time>
    </div>
    <h2 className="mt-2 text-[17px] font-semibold leading-relaxed text-ink">{signal.title}</h2>
    <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-3">{signal.detail}</p>
    <div className="mt-3 flex items-center gap-2 text-[12px] text-ink-4"><span>{signal.actor}</span><span>·</span><a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-ink">原始来源 ↗</a></div>
  </article>;
}

export default function Home() {
  const data = useLoaderData<typeof loader>();
  const type = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("type");
  const tabs = [{ key: "", label: "全部" }, { key: "demand", label: "真需求" }, { key: "claim", label: "牛皮账本" }];
  return <div className="pb-10">
    <header className="pb-5 pt-5 lg:pt-1">
      <p className="text-[12px] font-semibold tracking-[0.08em] text-accent">AI REALITY RADAR</p>
      <h1 className="mt-1.5 text-[26px] font-bold tracking-[-0.02em] text-ink">AI 现实雷达</h1>
      <p className="mt-2 max-w-xl text-[14px] leading-[1.75] text-ink-3">看真实需求，也查 AI 牛皮。</p>
      <nav className="mt-4 flex gap-2" aria-label="内容筛选">{tabs.map((tab) => <Link key={tab.key} to={tab.key ? `/?type=${tab.key}` : "/"} className={`rounded-full px-3 py-1.5 text-[12.5px] ${type === (tab.key || null) ? "bg-accent text-white" : "bg-bg-sunk text-ink-3 hover:text-ink"}`}>{tab.label}</Link>)}</nav>
    </header>
    <div className="space-y-3">{data.signals.map((signal) => <SignalCard key={`${signal.kind}-${signal.id}`} signal={signal} />)}</div>
    {data.signals.length === 0 && <div className="card px-5 py-12 text-center text-[14px] text-ink-3">当前没有信号。</div>}
  </div>;
}
