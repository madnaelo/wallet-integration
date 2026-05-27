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

  public int deleteOldDryRunSwapHistory(Instant cutoff) {
    return jdbcTemplate.update(
        """
        DELETE FROM swap_history
        WHERE status = 'dry_run'
          AND created_at < ?
        """,
        Timestamp.from(cutoff));
  }

  public int deleteOldReverseProfitAlerts(Instant cutoff) {
    return jdbcTemplate.update("DELETE FROM reverse_profit_alerts WHERE created_at < ?", Timestamp.from(cutoff));
  }

  public int deleteOldFavoritePairAlerts(Instant cutoff) {
    return jdbcTemplate.update("DELETE FROM favorite_pair_alerts WHERE created_at < ?", Timestamp.from(cutoff));
  }

  public int deleteOldAutoSwapAlerts(Instant cutoff) {
    return jdbcTemplate.update("DELETE FROM auto_swap_alerts WHERE created_at < ?", Timestamp.from(cutoff));
  }

  public int deleteOldNotificationOutbox(Instant cutoff) {
    return jdbcTemplate.update(
        """
        DELETE FROM notification_outbox
        WHERE status IN ('sent', 'failed')
          AND updated_at < ?
        """,
        Timestamp.from(cutoff));
  }
}
