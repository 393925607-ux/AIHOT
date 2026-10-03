CREATE TABLE IF NOT EXISTS radar_discovery_queue (
  id              bigserial PRIMARY KEY,
  stream          text NOT NULL CHECK (stream IN ('demand', 'claim_page')),
  source_family   text NOT NULL,
  source_item_id  text NOT NULL,
  source_url      text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'retryable', 'blocked', 'needs_review')),
  priority        smallint NOT NULL DEFAULT 50,
  attempts        integer NOT NULL DEFAULT 0,
  available_at    timestamptz NOT NULL DEFAULT now(),
  lease_until     timestamptz,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  last_error      text,
  content_hash    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stream, source_item_id)
);
CREATE INDEX IF NOT EXISTS radar_discovery_queue_due_idx
  ON radar_discovery_queue (stream, status, available_at, priority DESC, first_seen_at);
