import type { ReactNode } from "react";

export function RadarCard({ kind, status, observedAt, title, summary, meta, footer }: {
  kind: string;
  status?: string | null;
  observedAt: string;
  title: string;
  summary?: ReactNode;
  meta?: ReactNode;
  footer?: ReactNode;
}) {
  return <article className="card px-5 py-4 sm:px-6">
    <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-4">
      <span className="rounded bg-accent-softer px-2 py-0.5 text-accent">{kind}</span>
      {status && <span className="rounded bg-bg-sunk px-2 py-0.5">{status}</span>}
      <time className="ml-auto" dateTime={observedAt}>{new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(observedAt))}</time>
    </div>
    <h2 className="mt-2 text-[17px] font-semibold leading-relaxed text-ink">{title}</h2>
    {summary && <div className="mt-2 text-[13px] leading-relaxed text-ink-3">{summary}</div>}
    {meta && <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-4">{meta}</div>}
    {footer && <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-accent">{footer}</div>}
  </article>;
}
