-- MVP insight modes: public demand samples and claim verification ledger.
-- These tables are intentionally independent from the editorial projection so the
-- existing collection, selection and event grouping pipelines remain unchanged.

CREATE TABLE insight_demands (
  id              bigserial PRIMARY KEY,
  theme_key       text NOT NULL,
  theme_title     text NOT NULL,
  problem         text NOT NULL,
  scenario        text NOT NULL,
  workaround      text NOT NULL DEFAULT '',
  evidence        text NOT NULL,
  original_url    text NOT NULL,
  source_name     text NOT NULL,
  source_user     text,
  source_item_id  text NOT NULL,
  source_kind     text NOT NULL,
  observed_at     timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_kind, source_item_id)
);

CREATE INDEX insight_demands_theme_idx ON insight_demands (theme_key, observed_at DESC);
CREATE INDEX insight_demands_time_idx ON insight_demands (observed_at DESC);

CREATE TABLE insight_claims (
  id                bigserial PRIMARY KEY,
  claim             text NOT NULL,
  claimant          text NOT NULL,
  claim_type        text NOT NULL CHECK (claim_type IN ('性能', '成本', '用户量', 'Benchmark', '产品能力')),
  original_source   text NOT NULL,
  evidence          jsonb NOT NULL DEFAULT '[]',
  status            text NOT NULL CHECK (status IN ('未验证', '部分支持', '有较强支持', '存在冲突证据')),
  missing_evidence  text NOT NULL DEFAULT '',
  source_item_id    text NOT NULL UNIQUE,
  observed_at       timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX insight_claims_status_idx ON insight_claims (status, observed_at DESC);
CREATE INDEX insight_claims_time_idx ON insight_claims (observed_at DESC);
