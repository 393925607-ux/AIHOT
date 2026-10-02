-- Phase 6 Claim Gate metadata. Keep the original claimant column as the raw
-- discovery actor; these fields describe who actually made the claim.
ALTER TABLE insight_claims ADD COLUMN IF NOT EXISTS claimant_name text;
ALTER TABLE insight_claims ADD COLUMN IF NOT EXISTS claimant_type text;
ALTER TABLE insight_claims ADD COLUMN IF NOT EXISTS claimant_interest text;
ALTER TABLE insight_claims ADD COLUMN IF NOT EXISTS original_claim_url text;
ALTER TABLE insight_claims ADD COLUMN IF NOT EXISTS claim_gate_judgement jsonb;

DO $$
BEGIN
  ALTER TABLE insight_claims ADD CONSTRAINT insight_claims_claimant_type_check
    CHECK (claimant_type IS NULL OR claimant_type IN (
      'company', 'official_account', 'founder_or_executive',
      'project_author', 'benchmark_publisher', 'researcher',
      'media_or_analyst'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE insight_claims ADD CONSTRAINT insight_claims_claimant_interest_check
    CHECK (claimant_interest IS NULL OR claimant_interest IN ('interested', 'independent'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS insight_claims_gate_idx
  ON insight_claims (strong_claim, observed_at DESC);
