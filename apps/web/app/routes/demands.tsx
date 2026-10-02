import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/demands";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { buildDateGroups, compareLatestDesc, formatShanghaiTime } from "../lib/date-groups";
import { publicText } from "../lib/public-text";

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
type Theme = { themeKey: string; themeTitle: string; sampleCount: number; sourceCount: number; independentUserCount: number; independentThreadCount: number; independentRepoCount: number; independentPlatformCount: number; demandState: "multi_user" | "single_signal"; latestAt: string; samples: Sample[] };
type DemandResponse = { themes: Theme[]; totalSamples: number; generatedAt: string };

function demandTitle(theme: Theme) {
  const direct = publicText(theme.themeTitle, "");
  if (direct) return direct;
  for (const sample of theme.samples) {
    const summary = publicText(sample.problemZh, "");
    if (summary) return summary;
  }
  return "";
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadOr404<DemandResponse>("/api/site/demands?limit=50", { signal: request.signal });
}

export function meta() {
  return pageMeta({ title: "真需求", description: "从公开人工智能工具讨论中抽取真实用户反复遇到的问题、场景、临时办法和原始证据。", path: "/demands" });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120" };
}

export default function DemandsPage() {
  const data = useLoaderData<typeof loader>();
  const compareLatest = compareLatestDesc<Theme>((theme) => theme.latestAt);
  const visibleThemes = data.themes.filter((theme) => demandTitle(theme));
  const grouped = buildDateGroups(visibleThemes, (theme) => theme.latestAt, new Date(), (a, b) => compareLatest(a, b) || b.independentUserCount - a.independentUserCount || a.themeKey.localeCompare(b.themeKey));
  return (
    <div className="pb-10">
      <header className="pb-5 pt-5 lg:pt-1">
        <p className="text-[12px] font-semibold tracking-[0.08em] text-accent">真实用户需求</p>
        <h1 className="mt-1.5 text-[25px] font-bold tracking-[-0.01em] text-ink">真需求</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-[1.75] text-ink-3">真实用户现在到底在为什么具体问题折腾？按日期分组，每天内部按最新动态倒序展示。</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-ink-4"><span className="rounded-full bg-accent-softer px-2.5 py-1"><b className="num text-ink-2">{data.totalSamples}</b> 条原始样本</span><span className="rounded-full bg-bg-sunk px-2.5 py-1"><b className="num text-ink-2">{data.themes.length}</b> 个具体问题</span></div>
      </header>
      <div className="space-y-7">
        {grouped.map((group) => (
          <section key={group.label} aria-labelledby={`demands-${group.label}`}>
            <h2 id={`demands-${group.label}`} className="mb-3 flex items-center gap-2 text-[15px] font-bold text-ink"><span className="h-1.5 w-1.5 rounded-full bg-accent" />{group.label}</h2>
            <div className="space-y-4">
              {group.items.map((theme) => (
                <Link to={`/demands/${theme.themeKey}`} key={theme.themeKey} className="card block overflow-hidden transition-colors hover:border-accent/40">
                  <div className="border-b border-line-soft px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-[17px] font-bold text-ink">{demandTitle(theme)}</h3><span className="text-[12px] text-ink-4"><b className="num text-ink-2">{theme.independentUserCount}</b> 个独立用户 · <b className="num text-ink-2">{theme.independentThreadCount}</b> 个独立线程</span></div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[12px] text-ink-4 sm:px-6"><span>{theme.demandState === "multi_user" ? "多人佐证" : "单点信号"} · {theme.independentRepoCount} 个仓库 · {theme.independentPlatformCount} 个来源平台 · 最近活跃：{formatShanghaiTime(theme.latestAt)}</span><span className="text-accent">查看详情 →</span></div>
                </Link>
              ))}
            </div>
          </section>
        ))}
        {data.themes.length === 0 && <div className="card px-5 py-12 text-center text-[14px] text-ink-3">还没有需求样本，请运行采集任务后刷新。</div>}
      </div>
    </div>
  );
}
