package com.wallet.swap.marketradar;

import com.wallet.swap.common.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public final class MarketRadarWatchBudget {
  private final JdbcTemplate jdbc;
  private final int limit;

  public MarketRadarWatchBudget(
      JdbcTemplate jdbc, @Value("${wallet.market-radar.maximum-watched-pairs:5}") int limit) {
    if (limit < 0 || limit > 50) throw new IllegalArgumentException("Invalid Radar watch limit");
    this.jdbc = jdbc;
    this.limit = limit;
  }

  public void reserve(String pair) {
    if (!TransactionSynchronizationManager.isActualTransactionActive())
      throw new IllegalStateException("Radar watch reservation requires a transaction");
    // Dedicated application lock, not a fictitious wallet-user row.
    jdbc.execute("SELECT pg_advisory_xact_lock(846521, 1)");
    Integer count =
        jdbc.queryForObject(
            """
            SELECT count(*) FROM (SELECT pair_key FROM market_radar.watches WHERE expires_at>now()
              UNION SELECT pair_key FROM market_radar.alert_rules) active WHERE pair_key<>?
            """,
            Integer.class,
            pair);
    if (count == null || count >= limit)
      throw new ApiException(
          HttpStatus.TOO_MANY_REQUESTS,
          "The live watchlist is currently full. Please try again shortly.");
    jdbc.update(
        "INSERT INTO market_radar.watches(pair_key,expires_at) VALUES(?,now()+interval '5 minutes')"
            + " ON CONFLICT(pair_key) DO UPDATE SET expires_at=EXCLUDED.expires_at",
        pair);
  }
}
