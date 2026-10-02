import { sql } from "../db.ts";

export type DemandSample = {
  id: number; problem: string; scenario: string; workaround: string; evidence: string;
  originalUrl: string; sourceName: string; sourceUser: string | null; sourceKind: string;
  observedAt: string; topicKey: string | null; topicLabel: string | null;
  problemZh?: string | null; scenarioZh?: string | null; workaroundZh?: string | null;
};
export type DemandTheme = { themeKey: string; themeTitle: string; sampleCount: number; sourceCount: number; independentUserCount: number; latestAt: string; samples: DemandSample[] };
export type ClaimEvidence = { kind: "support" | "conflict" | "related"; url: string; quote: string; source: string };
export type Claim = {
  id: number; claim: string; claimant: string; claimType: "性能" | "成本" | "用户量" | "Benchmark" | "产品能力";
  originalSource: string; evidence: ClaimEvidence[]; status: "未验证" | "部分支持" | "有较强支持" | "存在冲突证据";
  missingEvidence: string; observedAt: string; topicKey: string | null; topicLabel: string | null;
  claimZh?: string | null; supportCount?: number; conflictCount?: number; relatedCount?: number;
};
export type Signal = {
  kind: "demand" | "claim"; id: number; topicKey: string | null; topicLabel: string | null;
  title: string; detail: string; sourceUrl: string; actor: string; status: string | null; observedAt: string;
};

type DemandRow = { theme_key: string; theme_title: string; sample_count: number; source_count: number; independent_user_count: number; latest_at: Date; samples: DemandSample[] };
type ClaimRow = { id: number; claim: string; claim_zh: string | null; claimant: string; claim_type: Claim["claimType"]; original_source: string; evidence: ClaimEvidence[]; status: Claim["status"]; missing_evidence: string; observed_at: Date; topic_key: string | null; topic_label: string | null };

export async function loadDemandThemes(opts: { q?: string | null; limit?: number } = {}): Promise<{ themes: DemandTheme[]; totalSamples: number; generatedAt: string }> {
  const q = opts.q?.trim() ? `%${opts.q.trim().slice(0, 100)}%` : null;
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const rows = await sql<DemandRow[]>`
    SELECT lower(regexp_replace(d.problem, '[^[:alnum:][:alnum:]一-龥]+', '-', 'g')) AS theme_key,
           max(coalesce(d.problem_zh, d.problem)) AS theme_title, count(*)::int AS sample_count,
           count(DISTINCT d.source_kind || ':' || coalesce(nullif(d.source_user, ''), d.source_item_id))::int AS source_count,
           count(DISTINCT d.source_kind || ':' || coalesce(nullif(d.source_user, ''), '')) FILTER (WHERE nullif(d.source_user, '') IS NOT NULL)::int AS independent_user_count,
           max(d.observed_at) AS latest_at,
           json_agg(json_build_object('id', d.id, 'problem', d.problem, 'scenario', d.scenario, 'workaround', d.workaround,
             'problemZh', d.problem_zh, 'scenarioZh', d.scenario_zh, 'workaroundZh', d.workaround_zh,
             'evidence', d.evidence, 'originalUrl', d.original_url, 'sourceName', d.source_name, 'sourceUser', d.source_user,
             'sourceKind', d.source_kind, 'observedAt', d.observed_at, 'topicKey', d.topic_key, 'topicLabel', d.topic_label)
             ORDER BY d.observed_at DESC) AS samples
    FROM insight_demands d
    WHERE d.is_testimony AND d.source_kind <> 'hn_comment' AND (${q}::text IS NULL OR d.problem ILIKE ${q} OR d.scenario ILIKE ${q} OR d.theme_title ILIKE ${q})
    GROUP BY lower(regexp_replace(d.problem, '[^[:alnum:][:alnum:]一-龥]+', '-', 'g'))
    ORDER BY count(DISTINCT d.source_kind || ':' || coalesce(nullif(d.source_user, ''), '')) FILTER (WHERE nullif(d.source_user, '') IS NOT NULL) DESC, max(d.observed_at) DESC LIMIT ${limit}`;
  const [{ total }] = await sql<{ total: number }[]>`SELECT count(*)::int AS total FROM insight_demands d WHERE d.is_testimony AND d.source_kind <> 'hn_comment' AND (${q}::text IS NULL OR d.problem ILIKE ${q} OR d.scenario ILIKE ${q} OR d.theme_title ILIKE ${q})`;
  return { themes: rows.map((r) => ({ themeKey: r.theme_key, themeTitle: r.theme_title, sampleCount: r.sample_count, sourceCount: r.source_count, independentUserCount: r.independent_user_count, latestAt: r.latest_at.toISOString(), samples: r.samples })), totalSamples: total, generatedAt: new Date().toISOString() };
}

export async function loadClaims(opts: { q?: string | null; status?: string | null; limit?: number } = {}): Promise<{ claims: Claim[]; total: number; generatedAt: string }> {
  const q = opts.q?.trim() ? `%${opts.q.trim().slice(0, 100)}%` : null;
  const status = opts.status && ["未验证", "部分支持", "有较强支持", "存在冲突证据"].includes(opts.status) ? opts.status : null;
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const rows = await sql<ClaimRow[]>`
    SELECT c.id, c.claim, c.claim_zh, c.claimant, c.claim_type, c.original_source, c.evidence, c.status, c.missing_evidence, c.observed_at, c.topic_key, c.topic_label
    FROM insight_claims c WHERE c.strong_claim AND (${q}::text IS NULL OR c.claim ILIKE ${q} OR c.claimant ILIKE ${q}) AND (${status}::text IS NULL OR c.status = ${status})
    ORDER BY c.observed_at DESC, c.id DESC LIMIT ${limit}`;
  const [{ total }] = await sql<{ total: number }[]>`SELECT count(*)::int AS total FROM insight_claims c WHERE c.strong_claim AND (${q}::text IS NULL OR c.claim ILIKE ${q} OR c.claimant ILIKE ${q}) AND (${status}::text IS NULL OR c.status = ${status})`;
  return { claims: rows.map((r) => ({ id: r.id, claim: r.claim, claimZh: r.claim_zh, claimant: r.claimant, claimType: r.claim_type, originalSource: r.original_source, evidence: r.evidence ?? [], status: r.status, missingEvidence: r.missing_evidence, observedAt: r.observed_at.toISOString(), topicKey: r.topic_key, topicLabel: r.topic_label, supportCount: (r.evidence ?? []).filter((x) => x.kind === "support").length, conflictCount: (r.evidence ?? []).filter((x) => x.kind === "conflict").length, relatedCount: (r.evidence ?? []).filter((x) => x.kind === "related").length })), total, generatedAt: new Date().toISOString() };
}

export async function loadClaim(id: number): Promise<Claim | null> {
  const [r] = await sql<ClaimRow[]>`SELECT id, claim, claim_zh, claimant, claim_type, original_source, evidence, status, missing_evidence, observed_at, topic_key, topic_label FROM insight_claims WHERE id = ${id} AND strong_claim`;
  return r ? { id: r.id, claim: r.claim, claimZh: r.claim_zh, claimant: r.claimant, claimType: r.claim_type, originalSource: r.original_source, evidence: r.evidence ?? [], status: r.status, missingEvidence: r.missing_evidence, observedAt: r.observed_at.toISOString(), topicKey: r.topic_key, topicLabel: r.topic_label, supportCount: (r.evidence ?? []).filter((x) => x.kind === "support").length, conflictCount: (r.evidence ?? []).filter((x) => x.kind === "conflict").length, relatedCount: (r.evidence ?? []).filter((x) => x.kind === "related").length } : null;
}

export async function loadSignals(opts: { type?: "all" | "demand" | "claim"; q?: string | null; topicKey?: string | null; limit?: number } = {}): Promise<{ signals: Signal[]; total: number; topics: Array<{ key: string; label: string; count: number }>; generatedAt: string }> {
  const type = opts.type ?? "all";
  const q = opts.q?.trim() ? `%${opts.q.trim().slice(0, 100)}%` : null;
  const topic = opts.topicKey?.trim() || null;
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const demands = type === "claim" ? [] : await sql<Signal[]>`
    SELECT 'demand' AS kind, d.id, d.topic_key AS "topicKey", d.topic_label AS "topicLabel", coalesce(d.problem_zh, d.problem) AS title,
           CASE WHEN coalesce(d.scenario_zh, d.scenario) ~ '问题是什么|日常编码或自动化任务|未说明具体复现' THEN '原文未明确说明具体使用场景' ELSE coalesce(d.scenario_zh, d.scenario) END || CASE WHEN coalesce(d.workaround_zh, d.workaround) <> '' THEN '；临时办法：' || coalesce(d.workaround_zh, d.workaround) ELSE '' END AS detail,
           d.original_url AS "sourceUrl", coalesce(d.source_user, d.source_name) AS actor, NULL::text AS status, d.observed_at AS "observedAt"
    FROM insight_demands d WHERE d.is_testimony AND d.source_kind <> 'hn_comment' AND (${q}::text IS NULL OR d.problem ILIKE ${q} OR d.scenario ILIKE ${q}) AND (${topic}::text IS NULL OR d.topic_key = ${topic})
    ORDER BY d.observed_at DESC LIMIT ${limit}`;
  const claims = type === "demand" ? [] : await sql<Signal[]>`
    SELECT 'claim' AS kind, c.id, c.topic_key AS "topicKey", c.topic_label AS "topicLabel", coalesce(c.claim_zh, c.claim) AS title,
           c.claimant || ' · ' || c.claim_type AS detail, c.original_source AS "sourceUrl", c.claimant AS actor, c.status, c.observed_at AS "observedAt"
    FROM insight_claims c WHERE c.strong_claim AND (${q}::text IS NULL OR c.claim ILIKE ${q} OR c.claimant ILIKE ${q}) AND (${topic}::text IS NULL OR c.topic_key = ${topic})
    ORDER BY c.observed_at DESC LIMIT ${limit}`;
  const signals = [...demands, ...claims].sort((a, b) => b.id - a.id).slice(0, limit);
  const topics = await sql<{ key: string; label: string; count: number }[]>`
    SELECT topic_key AS key, max(topic_label) AS label, count(*)::int AS count FROM (
      SELECT topic_key, topic_label FROM insight_demands WHERE topic_key IS NOT NULL
      UNION ALL SELECT topic_key, topic_label FROM insight_claims WHERE strong_claim AND topic_key IS NOT NULL
    ) x GROUP BY topic_key ORDER BY count(*) DESC, key LIMIT 100`;
  return { signals, total: signals.length, topics, generatedAt: new Date().toISOString() };
}

export async function loadTopicDetail(topicKey: string): Promise<{ topic: { key: string; label: string }; demands: DemandSample[]; claims: Claim[] } | null> {
  const [demands, claims] = await Promise.all([
    sql<DemandSample[]>`SELECT id, problem, scenario, workaround, evidence, original_url AS "originalUrl", source_name AS "sourceName", source_user AS "sourceUser", source_kind AS "sourceKind", observed_at AS "observedAt", topic_key AS "topicKey", topic_label AS "topicLabel", problem_zh AS "problemZh", scenario_zh AS "scenarioZh", workaround_zh AS "workaroundZh" FROM insight_demands WHERE is_testimony AND topic_key = ${topicKey} ORDER BY observed_at DESC`,
    sql<ClaimRow[]>`SELECT id, claim, claim_zh, claimant, claim_type, original_source, evidence, status, missing_evidence, observed_at, topic_key, topic_label FROM insight_claims WHERE topic_key = ${topicKey} ORDER BY observed_at DESC`,
  ]);
  if (!demands.length && !claims.length) return null;
  const label = demands[0]?.topicLabel ?? claims[0]?.topic_label ?? topicKey;
  return { topic: { key: topicKey, label }, demands, claims: claims.map((r) => ({ id: r.id, claim: r.claim, claimZh: r.claim_zh, claimant: r.claimant, claimType: r.claim_type, originalSource: r.original_source, evidence: r.evidence ?? [], status: r.status, missingEvidence: r.missing_evidence, observedAt: r.observed_at.toISOString(), topicKey: r.topic_key, topicLabel: r.topic_label, supportCount: (r.evidence ?? []).filter((x) => x.kind === "support").length, conflictCount: (r.evidence ?? []).filter((x) => x.kind === "conflict").length, relatedCount: (r.evidence ?? []).filter((x) => x.kind === "related").length })) };
}

export async function loadDemandTheme(themeKey: string): Promise<DemandTheme | null> {
  const [row] = await sql<DemandRow[]>`
    SELECT lower(regexp_replace(d.problem, '[^[:alnum:][:alnum:]一-龥]+', '-', 'g')) AS theme_key,
           max(coalesce(d.problem_zh, d.problem)) AS theme_title, count(*)::int AS sample_count,
           count(DISTINCT d.source_kind || ':' || coalesce(nullif(d.source_user, ''), d.source_item_id))::int AS source_count,
           count(DISTINCT d.source_kind || ':' || coalesce(nullif(d.source_user, ''), '')) FILTER (WHERE nullif(d.source_user, '') IS NOT NULL)::int AS independent_user_count,
           max(d.observed_at) AS latest_at,
           json_agg(json_build_object('id', d.id, 'problem', d.problem, 'scenario', d.scenario, 'workaround', d.workaround,
             'problemZh', d.problem_zh, 'scenarioZh', d.scenario_zh, 'workaroundZh', d.workaround_zh,
             'evidence', d.evidence, 'originalUrl', d.original_url, 'sourceName', d.source_name, 'sourceUser', d.source_user,
             'sourceKind', d.source_kind, 'observedAt', d.observed_at, 'topicKey', d.topic_key, 'topicLabel', d.topic_label)
             ORDER BY d.observed_at DESC) AS samples
    FROM insight_demands d
    WHERE d.is_testimony
    GROUP BY lower(regexp_replace(d.problem, '[^[:alnum:][:alnum:]一-龥]+', '-', 'g'))
    HAVING lower(regexp_replace(d.problem, '[^[:alnum:][:alnum:]一-龥]+', '-', 'g')) = ${themeKey}`;
  return row ? { themeKey: row.theme_key, themeTitle: row.theme_title, sampleCount: row.sample_count, sourceCount: row.source_count, independentUserCount: row.independent_user_count, latestAt: row.latest_at.toISOString(), samples: row.samples } : null;
}
