CREATE TABLE api_rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_api_rate_limit_request_count CHECK (request_count >= 0)
);

CREATE INDEX idx_api_rate_limit_buckets_reset_at ON api_rate_limit_buckets(reset_at);
