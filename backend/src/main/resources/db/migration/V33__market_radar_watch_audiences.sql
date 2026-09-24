ALTER TABLE ${marketRadarSchema}.watches
  ADD COLUMN audience varchar(12) NOT NULL DEFAULT 'commercial'
    CHECK (audience IN ('research','commercial'));
ALTER TABLE ${marketRadarSchema}.watches DROP CONSTRAINT watches_pkey;
ALTER TABLE ${marketRadarSchema}.watches ADD PRIMARY KEY (pair_key, audience);
