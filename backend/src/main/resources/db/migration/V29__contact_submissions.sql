CREATE TABLE contact_submissions (
  id UUID PRIMARY KEY,
  dedupe_hash CHAR(64) NOT NULL UNIQUE,
  sender_name VARCHAR(80),
  sender_email VARCHAR(254) NOT NULL,
  topic VARCHAR(32) NOT NULL,
  message VARCHAR(3000) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_contact_submission_topic
    CHECK (topic IN ('general', 'technical', 'privacy', 'partnership', 'legal')),
  CONSTRAINT chk_contact_submission_status
    CHECK (status IN ('new', 'reviewed', 'resolved', 'spam'))
);

CREATE INDEX idx_contact_submissions_status_created
  ON contact_submissions(status, created_at DESC);

CREATE INDEX idx_contact_submissions_created
  ON contact_submissions(created_at);
