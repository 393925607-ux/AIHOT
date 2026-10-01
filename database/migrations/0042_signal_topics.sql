-- Shared topic metadata for the two MVP signal tables. The tables remain separate;
-- publication code unions them for the Reality Radar views.
ALTER TABLE insight_demands ADD COLUMN IF NOT EXISTS topic_key text;
ALTER TABLE insight_demands ADD COLUMN IF NOT EXISTS topic_label text;
ALTER TABLE insight_claims ADD COLUMN IF NOT EXISTS topic_key text;
ALTER TABLE insight_claims ADD COLUMN IF NOT EXISTS topic_label text;

CREATE INDEX IF NOT EXISTS insight_demands_topic_idx ON insight_demands (topic_key, observed_at DESC);
CREATE INDEX IF NOT EXISTS insight_claims_topic_idx ON insight_claims (topic_key, observed_at DESC);
