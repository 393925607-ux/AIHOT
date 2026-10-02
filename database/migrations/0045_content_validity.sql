-- Evidence and validity metadata on the existing tables; preserve all raw rows.
ALTER TABLE insight_demands ADD COLUMN raw_content text;
ALTER TABLE insight_demands ADD COLUMN source_ref text;
ALTER TABLE insight_demands ADD COLUMN is_testimony boolean NOT NULL DEFAULT true;
ALTER TABLE insight_demands ADD COLUMN testimony_judgement jsonb;
UPDATE insight_demands SET raw_content = evidence, source_ref = original_url;
UPDATE insight_demands SET is_testimony = false WHERE source_kind = 'hn_comment';

ALTER TABLE insight_claims ADD COLUMN raw_claim text;
ALTER TABLE insight_claims ADD COLUMN raw_source text;
ALTER TABLE insight_claims ADD COLUMN strong_claim boolean NOT NULL DEFAULT false;
ALTER TABLE insight_claims ADD COLUMN claim_judgement jsonb;
ALTER TABLE insight_claims ADD COLUMN evidence_updated_at timestamptz;
UPDATE insight_claims SET raw_claim = claim, raw_source = original_source;
CREATE INDEX insight_demands_valid_theme_idx ON insight_demands (theme_key, observed_at DESC) WHERE is_testimony;
