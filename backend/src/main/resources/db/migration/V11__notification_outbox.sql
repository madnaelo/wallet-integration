CREATE TABLE notification_outbox (
  id UUID PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  notification_kind TEXT NOT NULL,
  channel TEXT NOT NULL,
  target TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_notification_outbox_attempts CHECK (attempts >= 0),
  CONSTRAINT chk_notification_outbox_status CHECK (status IN ('pending', 'sending', 'sent', 'failed'))
);

CREATE INDEX idx_notification_outbox_claim
  ON notification_outbox(status, next_attempt_at, locked_until, created_at);

CREATE INDEX idx_notification_outbox_created_at
  ON notification_outbox(created_at);
