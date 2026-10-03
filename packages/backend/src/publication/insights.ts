import { sql } from "../db.ts";
import { demandBreadth } from "../insights/breadth.ts";
import { readAttribution, readLifecycle, type RadarAttribution, type RadarLifecycle } from "../insights/metadata.ts";

export type DemandSample = {
  id: number; problem: string; scenario: string; workaround: string; evidence: string;
  sourceRef?: string | null; originalUrl: string; sourceName: string; sourceUser: string | null; sourceKind: string;
  observedAt: string; topicKey: string | null; topicLabel: string | null;
  problemZh?: string | null; scenarioZh?: string | null; workaroundZh?: string | null;
  coverage?: Record<string, unknown> | null;
  lifecycleStatus?: RadarLifecycle; attribution?: RadarAttribution;
};
export type DemandTheme = ReturnType<typeof demandBreadth> & { themeKey: string; themeTitle: string; sampleCount: number; sourceCount: number; independentUserCount: number; latestAt: string; samples: DemandSample[]; lifecycleStatus: RadarLifecycle; attribution: RadarAttribution };
export type ClaimEvidence = { kind: "support" | "conflict" | "related"; url: string; quote: string; source: string };
export type Claim = {
  id: number; claim: string; claimant: string; claimType: "性能" | "成本" | "用户量" | "Benchmark" | "产品能力";
  originalSource: string; evidence: ClaimEvidence[]; status: "未验证" | "部分支持" | "有较强支持" | "存在冲突证据";
  missingEvidence: string; observedAt: string; topicKey: string | null; topicLabel: string | null;
  claimantName?: string | null; claimantType?: string | null; claimantInterest?: string | null; originalClaimUrl?: string | null;
  claimZh?: string | null; supportCount?: number; conflictCount?: number; relatedCount?: number;
  lifecycleStatus?: RadarLifecycle; sourcePublishedAt?: string | null; firstSeenAt?: string | null; lastCheckedAt?: string | null; lastMaterialUpdateAt?: string | null; attribution?: RadarAttribution;
};
export type Signal = {
  kind: "demand" | "claim"; id: number; topicKey: string | null; topicLabel: string | null;
  title: string; detail: string; sourceUrl: string; actor: string; status: string | null; observedAt: string;
};

type DemandRow = { theme_key: string; theme_title: string; latest_at: Date; samples: DemandSample[] };
type ClaimRow = { id: number; claim: string; claim_zh: string | null; claimant: string; claimant_name: string | null; claimant_type: string | null; claimant_interest: string | null; claim_type: Claim["claimType"]; original_source: string; original_claim_url: string | null; evidence: ClaimEvidence[]; status: Claim["status"]; missing_evidence: string; observed_at: Date; created_at: Date; evidence_audit: Record<string, unknown> | null; claim_gate_judgement: Record<string, unknown> | null; topic_key: string | null; topic_label: string | null };

async function readDemandThemes(q: string | null, limit: number, offset = 0, themeKey: string | null = null): Promise<DemandTheme[]> {
  const rows = await sql<DemandRow[]>`
    SELECT d.theme_key, max(d.theme_title) AS theme_title, max(d.observed_at) AS latest_at,
      json_agg(json_build_object('id', d.id, 'problem', d.problem, 'scenario', d.scenario, 'workaround', d.workaround,
        'problemZh', d.problem_zh, 'scenarioZh', d.scenario_zh, 'workaroundZh', d.workaround_zh, 'coverage', d.coverage,
        'evidence', d.evidence, 'originalUrl', d.original_url, 'sourceRef', d.source_ref,
        'sourceName', d.source_name, 'sourceUser', d.source_user, 'sourceKind', d.source_kind,
        'observedAt', d.observed_at, 'topicKey', d.topic_key, 'topicLabel', d.topic_label)
        ORDER BY d.observed_at DESC, d.id DESC) AS samples
    FROM insight_demands d
    WHERE d.is_testimony AND d.source_kind <> 'hn_comment'
      AND (${q}::text IS NULL OR d.problem_zh ILIKE ${q} OR d.problem ILIKE ${q} OR d.scenario ILIKE ${q} OR d.theme_title ILIKE ${q})
    GROUP BY d.theme_key
    HAVING (${themeKey}::text IS NULL OR d.theme_key = ${themeKey})`;
  return rows.map(r => {
    const breadth = demandBreadth(r.samples);
    const samples = r.samples.map((sample) => ({ ...sample, sourceUser: null, lifecycleStatus: readLifecycle(sample.coverage), attribution: readAttribution(sample.coverage && (sample.coverage as Record<string, unknown>).attribution) }));
    return { themeKey: r.theme_key, themeTitle: r.theme_title, sampleCount: samples.length,
      sourceCount: breadth.independentThreadCount, ...breadth, latestAt: r.latest_at.toISOString(), samples,
      lifecycleStatus: samples[0]?.lifecycleStatus ?? "reported", attribution: samples[0]?.attribution ?? readAttribution(null) };
  }).sort((a,b) => Date.parse(b.latestAt) - Date.parse(a.latestAt) || b.independentUserCount - a.independentUserCount || a.themeKey.localeCompare(b.themeKey)).slice(offset, offset + limit);
}

export async function loadDemandThemes(opts: { q?: string | null; limit?: number; offset?: number } = {}): Promise<{ themes: DemandTheme[]; totalSamples: number; totalThemes: number; offset: number; generatedAt: string }> {
  const q = opts.q?.trim() ? `%${opts.q.trim().slice(0, 100)}%` : null;
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const themes = await readDemandThemes(q, limit, offset);
  const [{ total }] = await sql<{ total: number }[]>`SELECT count(*)::int AS total FROM insight_demands d WHERE d.is_testimony AND d.source_kind <> 'hn_comment'
    AND (${q}::text IS NULL OR d.problem_zh ILIKE ${q} OR d.problem ILIKE ${q} OR d.scenario ILIKE ${q} OR d.theme_title ILIKE ${q})`;
  const [{ totalThemes }] = await sql<{ totalThemes: number }[]>`SELECT count(*)::int AS "totalThemes" FROM (SELECT d.theme_key FROM insight_demands d WHERE d.is_testimony AND d.source_kind <> 'hn_comment'
    AND (${q}::text IS NULL OR d.problem_zh ILIKE ${q} OR d.problem ILIKE ${q} OR d.scenario ILIKE ${q} OR d.theme_title ILIKE ${q}) GROUP BY d.theme_key) x`;
  return { themes, totalSamples: total, totalThemes, offset, generatedAt: new Date().toISOString() };
}

export async function loadClaims(opts: { q?: string | null; status?: string | null; limit?: number; offset?: number } = {}): Promise<{ claims: Claim[]; total: number; offset: number; generatedAt: string }> {
  const q = opts.q?.trim() ? `%${opts.q.trim().slice(0, 100)}%` : null;
  const status = opts.status && ["未验证", "部分支持", "有较强支持", "存在冲突证据"].includes(opts.status) ? opts.status : null;
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const rows = await sql<ClaimRow[]>`
    SELECT c.id, c.claim, c.claim_zh, c.claimant, c.claimant_name, c.claimant_type, c.claimant_interest, c.claim_type, c.original_source, c.original_claim_url, c.evidence, c.status, c.missing_evidence, c.observed_at, c.created_at, c.evidence_audit, c.claim_gate_judgement, c.topic_key, c.topic_label
    FROM insight_claims c WHERE c.strong_claim AND (${q}::text IS NULL OR c.claim ILIKE ${q} OR c.claimant ILIKE ${q} OR c.claimant_name ILIKE ${q}) AND (${status}::text IS NULL OR c.status = ${status})
    ORDER BY c.observed_at DESC, c.id DESC LIMIT ${limit} OFFSET ${offset}`;
  const [{ total }] = await sql<{ total: number }[]>`SELECT count(*)::int AS total FROM insight_claims c WHERE c.strong_claim AND (${q}::text IS NULL OR c.claim ILIKE ${q} OR c.claimant ILIKE ${q} OR c.claimant_name ILIKE ${q}) AND (${status}::text IS NULL OR c.status = ${status})`;
  return { claims: rows.map((r) => toPublicClaim(r)), total, offset, generatedAt: new Date().toISOString() };
}

function toPublicClaim(r: ClaimRow): Claim {
  const audit = r.evidence_audit ?? {};
  const gate = r.claim_gate_judgement ?? {};
  return { id: r.id, claim: r.claim, claimZh: r.claim_zh, claimant: r.claimant, claimantName: r.claimant_name, claimantType: r.claimant_type, claimantInterest: r.claimant_interest, claimType: r.claim_type, originalSource: r.original_claim_url ?? r.original_source, originalClaimUrl: r.original_claim_url, evidence: r.evidence ?? [], status: r.status, missingEvidence: r.missing_evidence, observedAt: r.observed_at.toISOString(), topicKey: r.topic_key, topicLabel: r.topic_label, supportCount: (r.evidence ?? []).filter((x) => x.kind === "support").length, conflictCount: (r.evidence ?? []).filter((x) => x.kind === "conflict").length, relatedCount: (r.evidence ?? []).filter((x) => x.kind === "related").length, lifecycleStatus: readLifecycle(gate, "active"), sourcePublishedAt: typeof audit.sourcePublishedAt === "string" ? audit.sourcePublishedAt : r.observed_at.toISOString(), firstSeenAt: typeof audit.firstSeenAt === "string" ? audit.firstSeenAt : r.created_at.toISOString(), lastCheckedAt: typeof audit.lastCheckedAt === "string" ? audit.lastCheckedAt : null, lastMaterialUpdateAt: typeof audit.lastMaterialUpdateAt === "string" ? audit.lastMaterialUpdateAt : null, attribution: readAttribution(gate.attribution) };
}

export async function loadClaim(id: number): Promise<Claim | null> {
  const [r] = await sql<ClaimRow[]>`SELECT id, claim, claim_zh, claimant, claimant_name, claimant_type, claimant_interest, claim_type, original_source, original_claim_url, evidence, status, missing_evidence, observed_at, created_at, evidence_audit, claim_gate_judgement, topic_key, topic_label FROM insight_claims WHERE id = ${id} AND strong_claim`;
  return r ? toPublicClaim(r) : null;
}

export async function loadSignals(opts: { type?: "all" | "demand" | "claim"; q?: string | null; topicKey?: string | null; limit?: number } = {}): Promise<{ signals: Signal[]; total: number; topics: Array<{ key: string; label: string; count: number }>; generatedAt: string }> {
  const type = opts.type ?? "all";
  const q = opts.q?.trim() ? `%${opts.q.trim().slice(0, 100)}%` : null;
  const topic = opts.topicKey?.trim() || null;
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const demands = type === "claim" ? [] : await sql<Signal[]>`
    SELECT 'demand' AS kind, d.id, d.topic_key AS "topicKey", d.topic_label AS "topicLabel", coalesce(d.problem_zh, d.problem) AS title,
           nullif(CASE WHEN coalesce(d.scenario_zh, d.scenario) ~ '问题是什么|日常编码或自动化任务|未说明具体复现' THEN '' ELSE coalesce(d.scenario_zh, d.scenario) END || CASE WHEN coalesce(d.workaround_zh, d.workaround) <> '' AND coalesce(d.workaround_zh, d.workaround) !~ '暂未发现明确临时解决办法|原文未明确' THEN '；临时办法：' || coalesce(d.workaround_zh, d.workaround) ELSE '' END, '') AS detail,
           d.original_url AS "sourceUrl", d.source_name AS actor, NULL::text AS status, d.observed_at AS "observedAt"
    FROM insight_demands d WHERE d.is_testimony AND d.source_kind <> 'hn_comment' AND (${q}::text IS NULL OR d.problem ILIKE ${q} OR d.scenario ILIKE ${q}) AND (${topic}::text IS NULL OR d.topic_key = ${topic})
    ORDER BY d.observed_at DESC, d.id DESC LIMIT ${limit}`;
  const claims = type === "demand" ? [] : await sql<Signal[]>`
    SELECT 'claim' AS kind, c.id, c.topic_key AS "topicKey", c.topic_label AS "topicLabel", coalesce(c.claim_zh, c.claim) AS title,
           coalesce(c.claimant_name, c.claimant) || ' · ' || c.claim_type AS detail, coalesce(c.original_claim_url, c.original_source) AS "sourceUrl", coalesce(c.claimant_name, c.claimant) AS actor, c.status, c.observed_at AS "observedAt"
    FROM insight_claims c WHERE c.strong_claim AND (${q}::text IS NULL OR c.claim ILIKE ${q} OR c.claimant ILIKE ${q} OR c.claimant_name ILIKE ${q}) AND (${topic}::text IS NULL OR c.topic_key = ${topic})
    ORDER BY c.observed_at DESC, c.id DESC LIMIT ${limit}`;
  // The two source queries are independently time ordered. Re-sort after
  // merging by the actual observation timestamp so a high id from an older
  // row cannot jump ahead of newer content from the other stream.
  const signals = [...demands, ...claims].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || b.id - a.id).slice(0, limit);
  const topics = await sql<{ key: string; label: string; count: number }[]>`
    SELECT topic_key AS key, max(topic_label) AS label, count(*)::int AS count FROM (
      SELECT topic_key, topic_label FROM insight_demands WHERE topic_key IS NOT NULL
      UNION ALL SELECT topic_key, topic_label FROM insight_claims WHERE strong_claim AND topic_key IS NOT NULL
    ) x GROUP BY topic_key ORDER BY count(*) DESC, key LIMIT 100`;
  return { signals, total: signals.length, topics, generatedAt: new Date().toISOString() };
}

export async function loadTopicDetail(topicKey: string): Promise<{ topic: { key: string; label: string }; demands: DemandSample[]; claims: Claim[] } | null> {
  const [demands, claims] = await Promise.all([
    sql<DemandSample[]>`SELECT id, problem, scenario, workaround, evidence, original_url AS "originalUrl", source_name AS "sourceName", NULL::text AS "sourceUser", source_kind AS "sourceKind", observed_at AS "observedAt", topic_key AS "topicKey", topic_label AS "topicLabel", problem_zh AS "problemZh", scenario_zh AS "scenarioZh", workaround_zh AS "workaroundZh" FROM insight_demands WHERE is_testimony AND topic_key = ${topicKey} ORDER BY observed_at DESC, id DESC`,
    sql<ClaimRow[]>`SELECT id, claim, claim_zh, claimant, claimant_name, claimant_type, claimant_interest, claim_type, original_source, original_claim_url, evidence, status, missing_evidence, observed_at, created_at, evidence_audit, claim_gate_judgement, topic_key, topic_label FROM insight_claims WHERE strong_claim AND topic_key = ${topicKey} ORDER BY observed_at DESC, id DESC`,
  ]);
  if (!demands.length && !claims.length) return null;
  const label = demands[0]?.topicLabel ?? claims[0]?.topic_label ?? topicKey;
  return { topic: { key: topicKey, label }, demands, claims: claims.map(toPublicClaim) };
}

export async function loadDemandTheme(themeKey: string): Promise<DemandTheme | null> {
  return (await readDemandThemes(null, 1, 0, themeKey))[0] ?? null;
}
