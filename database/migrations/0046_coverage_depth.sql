-- Small audit metadata on the existing content tables. No new database or queue.
ALTER TABLE insight_demands ADD COLUMN coverage jsonb;
ALTER TABLE insight_demands ADD COLUMN grouping_judgement jsonb;
ALTER TABLE insight_claims ADD COLUMN evidence_audit jsonb;
