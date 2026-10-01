ALTER TABLE insight_demands ADD COLUMN IF NOT EXISTS problem_zh text;
ALTER TABLE insight_demands ADD COLUMN IF NOT EXISTS scenario_zh text;
ALTER TABLE insight_demands ADD COLUMN IF NOT EXISTS workaround_zh text;
ALTER TABLE insight_claims ADD COLUMN IF NOT EXISTS claim_zh text;
