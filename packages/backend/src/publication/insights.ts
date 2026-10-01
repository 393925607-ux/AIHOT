import { sql } from "../db.ts";

export type DemandSample = {
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

export type DemandTheme = {
  themeKey: string;
  themeTitle: string;
  sampleCount: number;
  sourceCount: number;
  latestAt: string;
  samples: DemandSample[];
};

export type ClaimEvidence = {
  kind: "support" | "conflict";
  url: string;
  quote: string;
  source: string;
};

export type Claim = {
  id: number;
  claim: string;
  claimant: string;
  claimType: "性能" | "成本" | "用户量" | "Benchmark" | "产品能力";
  originalSource: string;
  evidence: ClaimEvidence[];
  status: "未验证" | "部分支持" | "有较强支持" | "存在冲突证据";
  missingEvidence: string;
  observedAt: string;
};

type DemandRow = {
  theme_key: string;
  theme_title: string;
  sample_count: number;
  source_count: number;
  latest_at: Date;
  samples: DemandSample[];
};

type ClaimRow = {
  id: number;
  claim: string;
  claimant: string;
  claim_type: Claim["claimType"];
  original_source: string;
  evidence: ClaimEvidence[];
  status: Claim["status"];
  missing_evidence: string;
  observed_at: Date;
};

/** Public read layer for the demand sampler. One row is a merged theme. */
export async function loadDemandThemes(opts: { q?: string | null; limit?: number } = {}): Promise<{ themes: DemandTheme[]; totalSamples: number; generatedAt: string }> {
  const q = opts.q?.trim() ? `%${opts.q.trim().slice(0, 100)}%` : null;
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const rows = await sql<DemandRow[]>`
    SELECT d.theme_key, max(d.theme_title) AS theme_title,
           count(*)::int AS sample_count,
           count(DISTINCT d.source_kind || ':' || coalesce(nullif(d.source_user, ''), d.source_item_id))::int AS source_count,
           max(d.observed_at) AS latest_at,
           json_agg(json_build_object(
             'id', d.id, 'problem', d.problem, 'scenario', d.scenario, 'workaround', d.workaround,
             'evidence', d.evidence, 'originalUrl', d.original_url, 'sourceName', d.source_name,
             'sourceUser', d.source_user, 'sourceKind', d.source_kind, 'observedAt', d.observed_at
           ) ORDER BY d.observed_at DESC) AS samples
    FROM insight_demands d
    WHERE (${q}::text IS NULL OR d.problem ILIKE ${q} OR d.scenario ILIKE ${q} OR d.theme_title ILIKE ${q})
    GROUP BY d.theme_key
    ORDER BY count(*) DESC, max(d.observed_at) DESC
    LIMIT ${limit}`;
  const [{ total }] = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total FROM insight_demands d
    WHERE (${q}::text IS NULL OR d.problem ILIKE ${q} OR d.scenario ILIKE ${q} OR d.theme_title ILIKE ${q})`;
  return {
    themes: rows.map((r) => ({ ...r, themeKey: r.theme_key, themeTitle: r.theme_title, sampleCount: r.sample_count, sourceCount: r.source_count, latestAt: r.latest_at.toISOString() })),
    totalSamples: total,
    generatedAt: new Date().toISOString(),
  };
}

/** Public read layer for the claim ledger. Evidence is deliberately returned verbatim with URLs. */
export async function loadClaims(opts: { q?: string | null; status?: string | null; limit?: number } = {}): Promise<{ claims: Claim[]; total: number; generatedAt: string }> {
  const q = opts.q?.trim() ? `%${opts.q.trim().slice(0, 100)}%` : null;
  const status = opts.status && ["未验证", "部分支持", "有较强支持", "存在冲突证据"].includes(opts.status) ? opts.status : null;
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const rows = await sql<ClaimRow[]>`
    SELECT c.id, c.claim, c.claimant, c.claim_type, c.original_source, c.evidence,
           c.status, c.missing_evidence, c.observed_at
    FROM insight_claims c
    WHERE (${q}::text IS NULL OR c.claim ILIKE ${q} OR c.claimant ILIKE ${q})
      AND (${status}::text IS NULL OR c.status = ${status})
    ORDER BY c.observed_at DESC, c.id DESC
    LIMIT ${limit}`;
  const [{ total }] = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total FROM insight_claims c
    WHERE (${q}::text IS NULL OR c.claim ILIKE ${q} OR c.claimant ILIKE ${q})
      AND (${status}::text IS NULL OR c.status = ${status})`;
  return {
    claims: rows.map((r) => ({ id: r.id, claim: r.claim, claimant: r.claimant, claimType: r.claim_type, originalSource: r.original_source, evidence: r.evidence ?? [], status: r.status, missingEvidence: r.missing_evidence, observedAt: r.observed_at.toISOString() })),
    total,
    generatedAt: new Date().toISOString(),
  };
}
