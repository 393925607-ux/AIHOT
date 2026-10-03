import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/demand-detail";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { buildDateGroups, formatShanghaiTime } from "../lib/date-groups";
import { publicText } from "../lib/public-text";

type Sample = { id: number; problem: string; problemZh?: string | null; scenario: string; scenarioZh?: string | null; workaround: string; workaroundZh?: string | null; evidence: string; originalUrl: string; sourceName: string; sourceUser: string | null; observedAt: string };
type Data = { themeKey: string; themeTitle: string; sampleCount: number; sourceCount: number; independentUserCount: number; independentThreadCount: number; independentRepoCount: number; independentPlatformCount: number; demandState: "multi_user" | "single_signal"; latestAt: string; samples: Sample[] };
function demandTitle(data: Data) {
  const direct = publicText(data.themeTitle, "");
  if (direct) return direct;
  for (const sample of data.samples) {
    const summary = publicText(sample.problemZh, "");
    if (summary) return summary;
  }
  return "";
}
export async function loader({ request, params }: Route.LoaderArgs) { return loadOr404<Data>(`/api/site/demands/${encodeURIComponent(params.themeKey ?? "")}`, { signal: request.signal }); }
export function meta({ loaderData }: Route.MetaArgs) { return pageMeta({ title: loaderData ? demandTitle(loaderData) : "真需求", description: "真实用户需求详情。", path: `/demands/${loaderData?.themeKey ?? ""}` }); }
function sourceLabel(name: string) {
  const value = name.toLowerCase();
  if (value.includes("github")) return "GitHub";
  if (value.includes("hacker") || value === "hn") return "Hacker News";
  if (value.includes("reddit")) return "讨论社区";
  if (value.includes("openai")) return "OpenAI 社区";
  return /[\u3400-\u9fff]/.test(name) ? name : "公开来源";
}

function sourceUserLabel(value: string | null) {
  return value && /[\u3400-\u9fff]/.test(value) ? `来源用户：${value}` : "来源用户：匿名";
}

export default function DemandDetailPage() {
  const d = useLoaderData<typeof loader>();
  const first = d.samples[0];
  const scenario = d.samples.map((sample) => publicText(sample.scenarioZh, "")).find((value) => value && !/^(原文未明确|未提供具体|用户在使用 AI 工具完成日常编码或自动化任务)/.test(value)) ?? "";
  const workaround = publicText(first?.workaroundZh, "");
  const grouped = buildDateGroups([...d.samples].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || b.id - a.id), (sample) => sample.observedAt);
      return <div className="pb-10"><header className="pb-5 pt-5 lg:pt-1"><Link to="/demands" className="text-[12px] text-accent">← 真需求</Link><h1 className="mt-2 text-[25px] font-bold text-ink">{demandTitle(d)}</h1><p className="mt-2 text-[13px] text-ink-3">{d.independentUserCount} 个独立用户 · {d.independentThreadCount} 个独立线程 · {d.independentRepoCount} 个仓库 · {d.independentPlatformCount} 个来源平台 · {d.sampleCount} 条原始样本 · 最近活跃 {formatShanghaiTime(d.latestAt)}</p></header><section className="space-y-3"><article className="card p-5"><h2 className="text-[15px] font-bold text-ink">问题</h2><p className="mt-2 text-[13px] leading-relaxed text-ink-3">该问题来自 {d.independentUserCount} 个独立用户的真实反馈。</p>{scenario && <p className="mt-4 text-[13px] leading-relaxed text-ink-3"><b className="text-ink-4">使用场景：</b>{scenario}</p>}{workaround && workaround !== "暂未发现明确临时解决办法" && <p className="mt-2 text-[13px] leading-relaxed text-ink-3"><b className="text-ink-4">临时解决办法：</b>{workaround}</p>}</article><h2 className="pt-3 text-[17px] font-bold text-ink">真实反馈</h2>{grouped.map((group) => <section key={group.key} aria-labelledby={`demand-detail-${group.key}`}><h3 id={`demand-detail-${group.key}`} className="mb-2 mt-4 flex items-center gap-2 text-[14px] font-bold text-ink"><span className="h-1.5 w-1.5 rounded-full bg-accent" />{group.label}</h3><div className="space-y-3">{group.items.map((s) => <article key={s.id} className="card px-5 py-4"><div className="flex flex-wrap gap-2 text-[11.5px] text-ink-4"><span>{sourceLabel(s.sourceName)}</span><span>{sourceUserLabel(s.sourceUser)}</span><time dateTime={s.observedAt}>{formatShanghaiTime(s.observedAt)}</time></div><p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{publicText(s.problemZh, "")}</p><p className="mt-2 border-l-2 border-accent/40 pl-3 text-[12.5px] leading-relaxed text-ink-3">原文摘录暂不在页面展开，点击下方链接查看。</p><a href={s.originalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[12px] text-accent">查看原文 ↗</a></article>)}</div></section>)}</section></div>;
}
