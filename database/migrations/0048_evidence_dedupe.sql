-- Remove exact duplicate evidence records left by repeated Phase 4/5 runs.
-- JSONB equality is sufficient here: same kind, URL and quote are one record.
UPDATE insight_claims
SET evidence = (
  SELECT coalesce(jsonb_agg(DISTINCT item), '[]'::jsonb)
  FROM jsonb_array_elements(evidence) AS item
);
