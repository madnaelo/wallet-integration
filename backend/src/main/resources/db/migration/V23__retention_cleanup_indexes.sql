CREATE INDEX idx_telegram_link_codes_expires_at
  ON telegram_link_codes(expires_at);

CREATE INDEX idx_reverse_profit_alerts_created_at_brin
  ON reverse_profit_alerts USING BRIN(created_at);

CREATE INDEX idx_favorite_pair_alerts_created_at_brin
  ON favorite_pair_alerts USING BRIN(created_at);

CREATE INDEX idx_auto_swap_alerts_created_at_brin
  ON auto_swap_alerts USING BRIN(created_at);

CREATE INDEX idx_notification_outbox_terminal_updated_at
  ON notification_outbox(updated_at)
  WHERE status IN ('sent', 'failed');
