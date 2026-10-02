import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/demand-detail";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { DATE_GROUPS, dateGroup } from "../lib/date-groups";
import { publicText } from "../lib/public-text";

type Sample = { id: number; problem: string; problemZh?: string | null; scenario: string; scenarioZh?: string | null; workaround: string; workaroundZh?: string | null; evidence: string; originalUrl: string; sourceName: string; sourceUser: string | null; observedAt: string };
type Data = { themeKey: string; themeTitle: string; sampleCount: number; sourceCount: number; independentUserCount: number; independentThreadCount: number; independentRepoCount: number; independentPlatformCount: number; demandState: "multi_user" | "single_signal"; latestAt: string; samples: Sample[] };
export async function loader({ request, params }: Route.LoaderArgs) { return loadOr404<Data>(`/api/site/demands/${encodeURIComponent(params.themeKey ?? "")}`, { signal: request.signal }); }
export function meta({ loaderData }: Route.MetaArgs) { return pageMeta({ title: loaderData?.themeTitle ?? "真需求", description: "真实用户需求详情。", path: `/demands/${loaderData?.themeKey ?? ""}` }); }
function stamp(v: string) { return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(v)); }
function sourceLabel(name: string) {
  const value = name.toLowerCase();
  if (value.includes("github")) return "代码托管平台";
  if (value.includes("hacker") || value === "hn") return "技术社区";
  if (value.includes("reddit")) return "讨论社区";
  if (value.includes("openai")) return "开发者社区";
  return /[\u3400-\u9fff]/.test(name) ? name : "公开来源";
}

function sourceUserLabel(value: string | null) {
  return value && /[\u3400-\u9fff]/.test(value) ? `来源用户：${value}` : "来源用户：匿名";
}

export default function DemandDetailPage() {
  const d = useLoaderData<typeof loader>();
  const first = d.samples[0];
  const scenario = publicText(first?.scenarioZh, "原文未明确说明具体使用场景。");
  const workaround = publicText(first?.workaroundZh, "暂未发现明确临时解决办法。");
  const grouped = DATE_GROUPS.map(({ key, label }) => ({
    label,
    samples: [...d.samples]
      .filter((sample) => dateGroup(sample.observedAt) === key)
      .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt)),
  }));
  return <div className="pb-10"><header className="pb-5 pt-5 lg:pt-1"><Link to="/demands" className="text-[12px] text-accent">← 真需求</Link><h1 className="mt-2 text-[25px] font-bold text-ink">{publicText(d.themeTitle, "未命名的具体问题")}</h1><p className="mt-2 text-[13px] text-ink-3">{d.independentUserCount} 个独立用户 · {d.independentThreadCount} 个独立线程 · {d.independentRepoCount} 个仓库 · {d.independentPlatformCount} 个来源平台 · {d.sampleCount} 条原始样本 · 最近活跃 {stamp(d.latestAt)}</p></header><section className="space-y-3"><article className="card p-5"><h2 className="text-[15px] font-bold text-ink">问题</h2><p className="mt-2 text-[15px] leading-relaxed text-ink">{publicText(d.themeTitle, "未命名的具体问题")}</p><p className="mt-4 text-[13px] leading-relaxed text-ink-3"><b className="text-ink-4">使用场景：</b>{scenario}</p><p className="mt-2 text-[13px] leading-relaxed text-ink-3"><b className="text-ink-4">临时解决办法：</b>{workaround}</p></article><h2 className="pt-3 text-[17px] font-bold text-ink">真实反馈</h2>{grouped.map((group) => <section key={group.label} aria-labelledby={`demand-detail-${group.label}`}><h3 id={`demand-detail-${group.label}`} className="mb-2 mt-4 flex items-center gap-2 text-[14px] font-bold text-ink"><span className="h-1.5 w-1.5 rounded-full bg-accent" />{group.label}</h3><div className="space-y-3">{group.samples.map((s) => <article key={s.id} className="card px-5 py-4"><div className="flex flex-wrap gap-2 text-[11.5px] text-ink-4"><span>{sourceLabel(s.sourceName)}</span><span>{sourceUserLabel(s.sourceUser)}</span><time dateTime={s.observedAt}>{stamp(s.observedAt)}</time></div><p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{publicText(s.problemZh, "暂未生成中文问题概括，请查看原文。")}</p><p className="mt-2 border-l-2 border-accent/40 pl-3 text-[12.5px] leading-relaxed text-ink-3">原文摘录暂不在页面展开，点击下方链接查看。</p><a href={s.originalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[12px] text-accent">查看原文 ↗</a></article>)}</div></section>)}</section></div>;
}
