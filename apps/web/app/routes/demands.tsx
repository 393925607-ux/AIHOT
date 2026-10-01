import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/demands";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";

type Sample = {
  id: number;
  problem: string;
  scenario: string;
  workaround: string;
  evidence: string;
  originalUrl: string;
  sourceName: string;
  sourceUser: string | null;
  sourceKind: string;
  observedAt: string;
  topicKey: string | null;
  topicLabel: string | null;
  problemZh?: string | null;
  scenarioZh?: string | null;
  workaroundZh?: string | null;
};
type Theme = { themeKey: string; themeTitle: string; sampleCount: number; sourceCount: number; independentUserCount: number; latestAt: string; samples: Sample[] };
type DemandResponse = { themes: Theme[]; totalSamples: number; generatedAt: string };

export async function loader({ request }: Route.LoaderArgs) {
  return loadOr404<DemandResponse>("/api/site/demands?limit=50", { signal: request.signal });
}

export function meta() {
  return pageMeta({ title: "真需求采样器", description: "从公开 AI 工具讨论中抽取真实用户反复遇到的问题、场景、绕行和原始证据。", path: "/demands" });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120" };
}

function stamp(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function DemandsPage() {
  const data = useLoaderData<typeof loader>();
  return (
    <div className="pb-10">
      <header className="pb-5 pt-5 lg:pt-1">
        <p className="text-[12px] font-semibold tracking-[0.08em] text-accent">REAL USER DEMANDS</p>
        <h1 className="mt-1.5 text-[25px] font-bold tracking-[-0.01em] text-ink">真需求</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-[1.75] text-ink-3">真实用户现在到底在为什么具体问题折腾？默认按独立用户数，再按最近活跃时间排序。</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-ink-4"><span className="rounded-full bg-accent-softer px-2.5 py-1"><b className="num text-ink-2">{data.totalSamples}</b> 条原始样本</span><span className="rounded-full bg-bg-sunk px-2.5 py-1"><b className="num text-ink-2">{data.themes.length}</b> 个具体问题</span></div>
      </header>
      <div className="space-y-4">
        {data.themes.map((theme) => (
          <Link to={`/demands/${theme.themeKey}`} key={theme.themeKey} className="card block overflow-hidden transition-colors hover:border-accent/40">
            <div className="border-b border-line-soft px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-[17px] font-bold text-ink">{theme.themeTitle}</h2><span className="text-[12px] text-ink-4"><b className="num text-ink-2">{theme.independentUserCount}</b> 个独立用户 · <b className="num text-ink-2">{theme.sourceCount}</b> 个独立来源</span></div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{theme.samples[0]?.problemZh ?? theme.samples[0]?.problem}</p>
            </div>
            <div className="flex items-center justify-between px-5 py-3 text-[12px] text-ink-4 sm:px-6"><span>最近活跃：{stamp(theme.latestAt)}</span><span className="text-accent">查看详情 →</span></div>
          </Link>
        ))}
        {data.themes.length === 0 && <div className="card px-5 py-12 text-center text-[14px] text-ink-3">还没有需求样本。运行 `npm run insights:collect` 后刷新。</div>}
      </div>
    </div>
  );
}
