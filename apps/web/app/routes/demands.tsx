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
};
type Theme = { themeKey: string; themeTitle: string; sampleCount: number; sourceCount: number; latestAt: string; samples: Sample[] };
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
        <p className="text-[12px] font-semibold tracking-[0.08em] text-accent">REAL USER SIGNALS</p>
        <h1 className="mt-1.5 text-[25px] font-bold tracking-[-0.01em] text-ink">真需求采样器</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-[1.75] text-ink-3">从公开 Hacker News 评论和 GitHub Issues 抽取具体问题。主题按相似关键词轻量归并，保留每个独立用户与原始证据。</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-ink-4"><span className="rounded-full bg-accent-softer px-2.5 py-1"><b className="num text-ink-2">{data.totalSamples}</b> 个样本</span><span className="rounded-full bg-bg-sunk px-2.5 py-1"><b className="num text-ink-2">{data.themes.length}</b> 个需求主题</span></div>
      </header>
      <div className="space-y-4">
        {data.themes.map((theme) => (
          <section key={theme.themeKey} className="card overflow-hidden">
            <div className="border-b border-line-soft px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-[17px] font-bold text-ink">{theme.themeTitle}</h2><span className="text-[12px] text-ink-4"><b className="num text-ink-2">{theme.sampleCount}</b> 个样本 · <b className="num text-ink-2">{theme.sourceCount}</b> 个独立来源</span></div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{theme.samples[0]?.problem}</p>
            </div>
            <div className="divide-y divide-line-soft">
              {theme.samples.map((sample) => (
                <article key={sample.id} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-4"><span className="rounded bg-bg-sunk px-2 py-0.5">{sample.sourceName}</span><span>{sample.sourceUser ? `@${sample.sourceUser}` : "匿名用户"}</span><span>·</span><time dateTime={sample.observedAt}>{stamp(sample.observedAt)}</time></div>
                  <p className="mt-2 text-[14px] font-semibold leading-relaxed text-ink">{sample.problem}</p>
                  <dl className="mt-2 grid gap-1.5 text-[13px] leading-relaxed text-ink-3 sm:grid-cols-2"><div><dt className="inline font-medium text-ink-4">场景：</dt><dd className="inline">{sample.scenario}</dd></div><div><dt className="inline font-medium text-ink-4">绕行：</dt><dd className="inline">{sample.workaround || "未提到"}</dd></div></dl>
                  <blockquote className="mt-3 border-l-2 border-accent/40 pl-3 text-[12.5px] leading-relaxed text-ink-3">“{sample.evidence}”</blockquote>
                  <Link to={sample.originalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[12px] font-medium text-accent hover:text-accent-ink">打开原始证据 ↗</Link>
                </article>
              ))}
            </div>
          </section>
        ))}
        {data.themes.length === 0 && <div className="card px-5 py-12 text-center text-[14px] text-ink-3">还没有需求样本。运行 `npm run insights:collect` 后刷新。</div>}
      </div>
    </div>
  );
}
