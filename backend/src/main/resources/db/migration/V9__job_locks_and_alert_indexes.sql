CREATE TABLE job_locks (
  lock_name TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  locked_until TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_locks_locked_until ON job_locks(locked_until);

CREATE INDEX idx_swap_history_status_created_at
  ON swap_history(status, created_at DESC);

CREATE INDEX idx_swap_history_created_at
  ON swap_history(created_at DESC);
