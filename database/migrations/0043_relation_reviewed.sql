ALTER TABLE insight_claims ADD COLUMN IF NOT EXISTS relation_reviewed boolean NOT NULL DEFAULT false;
-- Rows carrying the new model's relation-shaped evidence are already reviewed.
UPDATE insight_claims SET relation_reviewed = true
WHERE evidence @> '[{"kind":"related"}]'::jsonb
   OR missing_evidence IN ('需要独立来源、原始数据或可复现实验', '需要第二个独立支持来源或公开方法');
