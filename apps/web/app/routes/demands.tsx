import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/demands";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { buildDateGroups, compareLatestDesc } from "../lib/date-groups";
import { RadarCard } from "../components/RadarCard";
import { demandMeta, demandSummary, demandTitle, evidenceLabel } from "../lib/radar-copy";

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
type DemandResponse = { themes: Theme[]; totalSamples: number; totalThemes: number; offset: number; sort: "latest" | "evidence"; generatedAt: string };

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url); const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0); const sort = url.searchParams.get("sort") === "evidence" ? "evidence" : "latest";
  return loadOr404<DemandResponse>(`/api/site/demands?limit=50&offset=${offset}&sort=${sort}`, { signal: request.signal });
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
  const compareThemes = data.sort === "evidence"
    ? (a: Theme, b: Theme) => b.independentUserCount - a.independentUserCount
      || b.independentThreadCount - a.independentThreadCount
      || b.independentPlatformCount - a.independentPlatformCount
      || compareLatest(a, b)
      || a.themeKey.localeCompare(b.themeKey)
    : (a: Theme, b: Theme) => compareLatest(a, b)
      || b.independentUserCount - a.independentUserCount
      || a.themeKey.localeCompare(b.themeKey);
  const grouped = buildDateGroups(data.themes, (theme) => theme.latestAt, new Date(), compareThemes);
  return (
    <div className="pb-10">
      <header className="pb-5 pt-5 lg:pt-1">
        <p className="text-[12px] font-semibold tracking-[0.08em] text-accent">真实用户需求</p>
        <h1 className="mt-1.5 text-[25px] font-bold tracking-[-0.01em] text-ink">真需求</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-[1.75] text-ink-3">{data.sort === "evidence" ? "按日期分组。同一天内，独立用户更多的排在前面，其次看独立线程和来源平台。" : "按日期分组。同一天内，最新动态排在前面。"}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-4" aria-label="需求排序">
          <span>排序：</span>
          <Link className={`rounded-full px-2.5 py-1 ${data.sort === "latest" ? "bg-accent text-white" : "bg-bg-sunk hover:text-ink"}`} to="/demands?sort=latest">最新动态</Link>
          <Link className={`rounded-full px-2.5 py-1 ${data.sort === "evidence" ? "bg-accent text-white" : "bg-bg-sunk hover:text-ink"}`} to="/demands?sort=evidence">证据更充分</Link>
          {data.sort === "evidence" && <span>每天内部按独立用户数 → 独立线程数 → 来源平台数倒序</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-ink-4"><span className="rounded-full bg-accent-softer px-2.5 py-1"><b className="num text-ink-2">{data.totalSamples}</b> 条原始样本</span><span className="rounded-full bg-bg-sunk px-2.5 py-1"><b className="num text-ink-2">{data.totalThemes}</b> 个具体问题</span></div>
      </header>
      <div className="space-y-7">
        {grouped.map((group) => (
          <section key={group.label} aria-labelledby={`demands-${group.label}`}>
            <h2 id={`demands-${group.label}`} className="mb-3 flex items-center gap-2 text-[15px] font-bold text-ink"><span className="h-1.5 w-1.5 rounded-full bg-accent" />{group.label}</h2>
            <div className="space-y-4">
              {group.items.map((theme) => (
                  <RadarCard key={theme.themeKey} kind="真需求" status={evidenceLabel(theme)} observedAt={theme.latestAt} title={demandTitle(theme)} summary={demandSummary(theme)} meta={demandMeta(theme)} footer={<><Link to={`/demands/${encodeURIComponent(theme.themeKey)}`}>查看详情 →</Link>{theme.samples[0]?.originalUrl && <a href={theme.samples[0].originalUrl} target="_blank" rel="noreferrer">查看原文 ↗</a>}</>} />
              ))}
            </div>
          </section>
        ))}
        {data.themes.length === 0 && <div className="card px-5 py-12 text-center text-[14px] text-ink-3">还没有需求样本，请运行采集任务后刷新。</div>}
        {(data.offset > 0 || data.offset + data.themes.length < data.totalThemes) && <nav className="flex justify-center gap-3 pt-2 text-[13px]" aria-label="需求分页">{data.offset > 0 && <Link className="text-accent" to={`/demands?offset=${Math.max(data.offset - 50, 0)}&sort=${data.sort}`}>上一页</Link>}{data.offset + data.themes.length < data.totalThemes && <Link className="text-accent" to={`/demands?offset=${data.offset + 50}&sort=${data.sort}`}>下一页</Link>}</nav>}
      </div>
    </div>
  );
}
