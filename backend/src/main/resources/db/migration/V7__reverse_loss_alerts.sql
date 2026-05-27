ALTER TABLE notification_preferences
  ADD COLUMN reverse_loss_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN reverse_loss_threshold_bps INTEGER NOT NULL DEFAULT 500;

ALTER TABLE notification_preferences
  ADD CONSTRAINT chk_notification_loss_threshold
  CHECK (reverse_loss_threshold_bps BETWEEN 0 AND 100000);

ALTER TABLE reverse_profit_alerts
  ADD COLUMN alert_type TEXT NOT NULL DEFAULT 'profit';

ALTER TABLE reverse_profit_alerts
  ADD CONSTRAINT chk_reverse_profit_alert_type
  CHECK (alert_type IN ('profit', 'loss'));

DROP INDEX idx_reverse_profit_alerts_swap_channel_sent;

CREATE INDEX idx_reverse_profit_alerts_swap_type_channel_sent
  ON reverse_profit_alerts(original_swap_history_id, alert_type, channel, sent_at DESC)
  WHERE delivery_status = 'sent';
