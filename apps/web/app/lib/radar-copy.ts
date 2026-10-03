import { displayClaimant, publicText } from "./public-text";

export type DemandCopySample = {
  problemZh?: string | null;
  scenarioZh?: string | null;
  originalUrl?: string | null;
};

export type DemandCopyTheme = {
  themeKey: string;
  themeTitle: string;
  sampleCount: number;
  independentUserCount: number;
  independentThreadCount: number;
  independentPlatformCount: number;
  demandState: "multi_user" | "single_signal";
  latestAt: string;
  samples: DemandCopySample[];
};

export type ClaimCopy = {
  id: number;
  claimZh?: string | null;
  claimant: string;
  claimantName?: string | null;
  claimType: string;
  originalSource: string;
  status: string;
  missingEvidence: string;
  observedAt: string;
  supportCount?: number;
  conflictCount?: number;
  relatedCount?: number;
};

const GENERIC_SCENARIO = /^(原文未明确|未提供具体|用户在使用 AI 工具完成日常编码或自动化任务)/;

export function demandTitle(theme: Pick<DemandCopyTheme, "themeTitle" | "samples">): string {
  const direct = publicText(theme.themeTitle, "");
  if (direct) return direct;
  for (const sample of theme.samples) {
    const summary = publicText(sample.problemZh, "");
    if (summary) return summary;
  }
  return "暂未生成中文问题摘要";
}

export function demandSummary(theme: Pick<DemandCopyTheme, "samples">): string {
  for (const sample of theme.samples) {
    const scenario = publicText(sample.scenarioZh, "");
    if (scenario && !GENERIC_SCENARIO.test(scenario)) return scenario;
  }
  return "暂未生成中文场景摘要，请查看详情中的原始反馈。";
}

export function evidenceLabel(theme: Pick<DemandCopyTheme, "demandState" | "independentThreadCount" | "independentPlatformCount">): string {
  if (theme.demandState === "single_signal") return "单点信号";
  if (theme.independentThreadCount === 1 && theme.independentPlatformCount === 1) return "同一线程多人";
  return "多人多源";
}

export function demandMeta(theme: Pick<DemandCopyTheme, "independentUserCount" | "independentThreadCount" | "independentPlatformCount">): string {
  return `${theme.independentUserCount} 个独立用户 · ${theme.independentThreadCount} 个独立线程 · ${theme.independentPlatformCount} 个来源平台`;
}

export function claimTitle(item: Pick<ClaimCopy, "claimZh">): string {
  return publicText(item.claimZh, "暂未生成中文主张");
}

export function claimTypeLabel(value: string): string {
  return value === "Benchmark" ? "基准测试" : value;
}

export function claimProgress(item: Pick<ClaimCopy, "supportCount" | "conflictCount" | "relatedCount" | "missingEvidence">): string {
  const support = item.supportCount ?? 0;
  const conflict = item.conflictCount ?? 0;
  const related = item.relatedCount ?? 0;
  const counts = `直接支持 ${support} 条，冲突 ${conflict} 条，相关材料 ${related} 条。`;
  if (!support && !conflict && !related) return `核查进度：已收录主张，尚未找到可直接核验的公开材料。${counts}`;
  return `核查进度：${counts}还缺可独立复现的公开测试条件、原始数据和结果。`;
}

export function claimMeta(item: Pick<ClaimCopy, "claimantName" | "claimant" | "claimType">): string {
  return `${displayClaimant(item.claimantName || item.claimant)} · ${claimTypeLabel(item.claimType)}`;
}
