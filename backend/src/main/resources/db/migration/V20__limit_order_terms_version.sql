ALTER TABLE limit_orders
  ADD COLUMN terms_version TEXT;

UPDATE limit_orders
SET terms_version = 'pre-versioned'
WHERE terms_version IS NULL;

ALTER TABLE limit_orders
  ALTER COLUMN terms_version SET NOT NULL,
  ADD CONSTRAINT chk_limit_orders_terms_version
    CHECK (length(terms_version) BETWEEN 1 AND 64);
