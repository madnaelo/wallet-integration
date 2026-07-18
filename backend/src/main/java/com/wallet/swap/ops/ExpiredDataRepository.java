package com.wallet.swap.ops;

import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ExpiredDataRepository {
  private final JdbcTemplate jdbcTemplate;

  public ExpiredDataRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public int deleteOldDryRunSwapHistory(Instant cutoff, int limit) {
    return jdbcTemplate.update(
        """
        DELETE FROM swap_history
        WHERE ctid IN (
          SELECT ctid FROM swap_history
          WHERE status = 'dry_run'
            AND created_at < ?
          ORDER BY created_at
          LIMIT ?
        )
        """,
        Timestamp.from(cutoff),
        limit);
  }

  public int deleteOldReverseProfitAlerts(Instant cutoff, int limit) {
    return jdbcTemplate.update(
        """
        DELETE FROM reverse_profit_alerts
        WHERE ctid IN (
          SELECT ctid FROM reverse_profit_alerts
          WHERE created_at < ?
          ORDER BY created_at
          LIMIT ?
        )
        """,
        Timestamp.from(cutoff),
        limit);
  }

  public int deleteOldFavoritePairAlerts(Instant cutoff, int limit) {
    return jdbcTemplate.update(
        """
        DELETE FROM favorite_pair_alerts
        WHERE ctid IN (
          SELECT ctid FROM favorite_pair_alerts
          WHERE created_at < ?
          ORDER BY created_at
          LIMIT ?
        )
        """,
        Timestamp.from(cutoff),
        limit);
  }

  public int deleteOldPriceAlertDeliveries(Instant cutoff, int limit) {
    return jdbcTemplate.update(
        """
        DELETE FROM auto_swap_alerts
        WHERE ctid IN (
          SELECT ctid FROM auto_swap_alerts
          WHERE created_at < ?
          ORDER BY created_at
          LIMIT ?
        )
        """,
        Timestamp.from(cutoff),
        limit);
  }

  public int deleteOldNotificationOutbox(Instant cutoff, int limit) {
    return jdbcTemplate.update(
        """
        DELETE FROM notification_outbox
        WHERE ctid IN (
          SELECT ctid FROM notification_outbox
          WHERE status IN ('sent', 'failed')
            AND updated_at < ?
          ORDER BY updated_at
          LIMIT ?
        )
        """,
        Timestamp.from(cutoff),
        limit);
  }

}
