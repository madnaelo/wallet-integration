-- A quote is evidence of terms, not a single-use transaction authorization.
ALTER TABLE revenue_records DROP CONSTRAINT revenue_records_quote_id_key;
CREATE INDEX revenue_records_quote ON revenue_records(quote_id);
