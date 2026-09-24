ALTER TABLE contact_submissions
  ADD COLUMN landing_page varchar(100) NOT NULL DEFAULT '',
  ADD COLUMN referrer_group varchar(32) NOT NULL DEFAULT '',
  ADD COLUMN utm_source varchar(48) NOT NULL DEFAULT '',
  ADD COLUMN utm_medium varchar(48) NOT NULL DEFAULT '',
  ADD COLUMN utm_campaign varchar(48) NOT NULL DEFAULT '',
  ADD COLUMN enquiry_type varchar(32) NOT NULL DEFAULT 'general';

-- Anonymous, unverified observations. No wallet, IP, cookie, or visitor identity.
CREATE TABLE growth_events (
  id uuid PRIMARY KEY,
  event varchar(20) NOT NULL CHECK (event IN ('landing', 'demo_cta', 'contact_opened')),
  page varchar(100) NOT NULL,
  landing_page varchar(100) NOT NULL,
  referrer_group varchar(32) NOT NULL,
  utm_source varchar(48) NOT NULL,
  utm_medium varchar(48) NOT NULL,
  utm_campaign varchar(48) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX growth_events_created_idx ON growth_events(created_at);
