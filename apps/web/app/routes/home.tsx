import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { publicText } from "../lib/public-text";

type Signal = { kind: "demand" | "claim"; id: number; topicKey: string | null; topicLabel: string | null; title: string; detail: string; sourceUrl: string; actor: string; status: string | null; observedAt: string };
type Data = { signals: Signal[]; total: number; topics: Array<{ key: string; label: string; count: number }>; generatedAt: string };

type DateGroupKey = "today" | "yesterday" | "earlier";

const DATE_GROUPS: Array<{ key: DateGroupKey; label: string }> = [
  { key: "today", label: "今天" },
  { key: "yesterday", label: "昨天" },
  { key: "earlier", label: "更早" },
];

const SHANGHAI_DAY_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dayNumber(value: Date): number | null {
  if (Number.isNaN(value.getTime())) return null;
  const parts = SHANGHAI_DAY_FORMATTER.formatToParts(value);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  if (!year || !month || !day) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function groupForSignal(signal: Signal, today: number): DateGroupKey {
  const observedDay = dayNumber(new Date(signal.observedAt));
  if (observedDay === null) return "earlier";
  const age = today - observedDay;
  if (age <= 0) return "today";
  if (age === 1) return "yesterday";
  return "earlier";
}

function groupedSignals(signals: Signal[]) {
  const today = dayNumber(new Date()) ?? 0;
  const grouped = new Map<DateGroupKey, Signal[]>(DATE_GROUPS.map(({ key }) => [key, []]));
  for (const signal of [...signals].sort((a, b) => {
    const timeDelta = new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime();
    return timeDelta || b.id - a.id;
  })) {
    grouped.get(groupForSignal(signal, today))?.push(signal);
  }
  return grouped;
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const query = type === "demand" || type === "claim" ? `?type=${type}&limit=24` : "?limit=24";
  return loadOr404<Data>(`/api/site/signals${query}`, { signal: request.signal });
}

export function meta() { return pageMeta({ title: "人工智能现实雷达", description: "看真实需求，也查人工智能牛皮。", path: "/" }); }
export function headers() { return { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120" }; }

function SignalCard({ signal }: { signal: Signal }) {
  return <article className="card px-5 py-4 sm:px-6">
    <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-4">
      <span className={`rounded px-2 py-0.5 ${signal.kind === "demand" ? "bg-accent-softer text-accent" : "bg-hot-soft text-hot"}`}>{signal.kind === "demand" ? "真需求" : "牛皮账本"}</span>
      {signal.status && <span className="rounded bg-bg-sunk px-2 py-0.5">{signal.status}</span>}
      {signal.topicKey && <Link to={`/signals/topic/${signal.topicKey}`} className="text-accent hover:text-accent-ink">#{publicText(signal.topicLabel, "相关主题")}</Link>}
      <time className="ml-auto" dateTime={signal.observedAt}>{new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(signal.observedAt))}</time>
    </div>
    <h2 className="mt-2 text-[17px] font-semibold leading-relaxed text-ink">{publicText(signal.title, "已收录一条公开材料")}</h2>
    <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-3">{signal.kind === "demand" ? "用户在实际使用中遇到了这个问题。" : publicText(signal.detail, "提出方公开发布了这项主张。")}</p>
    <div className="mt-3 flex items-center gap-2 text-[12px] text-ink-4"><span>{signal.kind === "demand" ? "真实用户反馈" : "公开主张"}</span><span>·</span><a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-ink">查看原文 ↗</a></div>
  </article>;
}

export default function Home() {
  const data = useLoaderData<typeof loader>();
  const type = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("type");
  const tabs = [{ key: "", label: "全部" }, { key: "demand", label: "真需求" }, { key: "claim", label: "牛皮账本" }];
  const groups = groupedSignals(data.signals);
  return <div className="pb-10">
    <header className="pb-5 pt-5 lg:pt-1">
      <p className="text-[12px] font-semibold tracking-[0.08em] text-accent">人工智能现实雷达</p>
      <h1 className="mt-1.5 text-[26px] font-bold tracking-[-0.02em] text-ink">人工智能现实雷达</h1>
      <p className="mt-2 max-w-xl text-[14px] leading-[1.75] text-ink-3">看真实需求，也核查人工智能圈的夸张说法。</p>
      <nav className="mt-4 flex gap-2" aria-label="内容筛选">{tabs.map((tab) => <Link key={tab.key} to={tab.key ? `/?type=${tab.key}` : "/"} className={`rounded-full px-3 py-1.5 text-[12.5px] ${type === (tab.key || null) ? "bg-accent text-white" : "bg-bg-sunk text-ink-3 hover:text-ink"}`}>{tab.label}</Link>)}</nav>
    </header>
    <div className="space-y-7">
      {DATE_GROUPS.map((group) => {
        const signals = groups.get(group.key) ?? [];
        return <section key={group.key} aria-labelledby={`home-${group.key}`}>
          <div className="mb-3 flex items-center gap-3">
            <h2 id={`home-${group.key}`} className="text-[14px] font-semibold text-ink">{group.label}</h2>
            <div className="h-px flex-1 bg-line" />
          </div>
          {signals.length > 0 ? <div className="space-y-3">{signals.map((signal) => <SignalCard key={`${signal.kind}-${signal.id}`} signal={signal} />)}</div> : <p className="text-[13px] text-ink-4">暂无内容。</p>}
        </section>;
      })}
    </div>
    {data.signals.length === 0 && <div className="card px-5 py-12 text-center text-[14px] text-ink-3">当前没有信号。</div>}
  </div>;
}
