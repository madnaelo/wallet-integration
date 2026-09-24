package com.wallet.swap.marketradar;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.common.WalletMutationLock;
import com.wallet.swap.marketradar.MarketRadarModels.AlertRequest;
import com.wallet.swap.marketradar.MarketRadarModels.AlertRule;
import com.wallet.swap.marketradar.MarketRadarModels.AlertType;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MarketRadarAlerts {
  private final MarketRadarPolicy policy;
  private final JdbcTemplate jdbc;
  private final WalletMutationLock locks;
  private final MarketRadarWatchBudget budget;

  public MarketRadarAlerts(
      MarketRadarPolicy policy,
      JdbcTemplate jdbc,
      WalletMutationLock locks,
      MarketRadarWatchBudget budget) {
    this.policy = policy;
    this.jdbc = jdbc;
    this.locks = locks;
    this.budget = budget;
  }

  public List<AlertRule> list(String wallet) {
    return jdbc.query(
        "SELECT * FROM market_radar.alert_rules WHERE wallet_address=? ORDER BY created_at DESC"
            + " LIMIT 50",
        (rs, row) ->
            new AlertRule(
                rs.getObject("id", UUID.class),
                rs.getString("pair_key"),
                AlertType.valueOf(rs.getString("event_type")),
                rs.getInt("minimum_score"),
                rs.getInt("cooldown_minutes"),
                rs.getTimestamp("created_at").toInstant()),
        wallet);
  }

  @Transactional(timeout = 5)
  public AlertRule save(String wallet, AlertRequest request) {
    policy.requireEnabled();
    if (request == null
        || request.pairKey() == null
        || !request.pairKey().matches(MarketRadarModels.PAIR_PATTERN)
        || request.eventType() == null
        || request.minimumScore() < 0
        || request.minimumScore() > 100
        || request.cooldownMinutes() < 15
        || request.cooldownMinutes() > 1440) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Choose a valid market and alert threshold.");
    }
    String[] pair = request.pairKey().split("/");
    if (pair[0].equals(pair[1]))
      throw new ApiException(HttpStatus.BAD_REQUEST, "Choose two different assets.");
    locks.lock(wallet);
    Boolean current =
        jdbc.queryForObject(
            """
SELECT EXISTS(SELECT 1 FROM market_radar.latest WHERE pair_key=? AND audience='commercial'
  AND observed_at>? AND snapshot->>'freshness'='LIVE'
  AND snapshot->>'coverage'<>'INSUFFICIENT_DATA')
""",
            Boolean.class,
            request.pairKey(),
            System.currentTimeMillis() - 15000);
    if (!Boolean.TRUE.equals(current))
      throw new ApiException(
          HttpStatus.CONFLICT, "This market does not have enough current coverage for alerts.");
    Boolean exists =
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM market_radar.alert_rules WHERE wallet_address=? AND"
                + " pair_key=? AND event_type=?)",
            Boolean.class,
            wallet,
            request.pairKey(),
            request.eventType().name());
    Integer count =
        jdbc.queryForObject(
            "SELECT count(*) FROM market_radar.alert_rules WHERE wallet_address=?",
            Integer.class,
            wallet);
    if (!Boolean.TRUE.equals(exists) && count != null && count >= 50)
      throw new ApiException(
          HttpStatus.CONFLICT, "This wallet has reached its Market Radar alert limit.");
    budget.reserve(request.pairKey());
    UUID id =
        jdbc.queryForObject(
            """
INSERT INTO market_radar.alert_rules(id,wallet_address,pair_key,event_type,minimum_score,cooldown_minutes)
VALUES(?,?,?,?,?,?) ON CONFLICT(wallet_address,pair_key,event_type) DO UPDATE
SET minimum_score=EXCLUDED.minimum_score,cooldown_minutes=EXCLUDED.cooldown_minutes RETURNING id
""",
            UUID.class,
            UUID.randomUUID(),
            wallet,
            request.pairKey(),
            request.eventType().name(),
            request.minimumScore(),
            request.cooldownMinutes());
    return list(wallet).stream().filter(rule -> rule.id().equals(id)).findFirst().orElseThrow();
  }

  public void delete(String wallet, UUID id) {
    // Disabling rollout must never prevent users deleting their alert rules.
    jdbc.update("DELETE FROM market_radar.alert_rules WHERE id=? AND wallet_address=?", id, wallet);
  }
}
