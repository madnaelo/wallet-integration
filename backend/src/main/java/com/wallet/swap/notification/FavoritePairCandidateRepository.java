package com.wallet.swap.notification;

import com.wallet.swap.notification.FavoritePairModels.FavoritePairCandidate;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class FavoritePairCandidateRepository {
  private final JdbcTemplate jdbcTemplate;

  public FavoritePairCandidateRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public List<FavoritePairCandidate> findCandidates(int limit) {
    return jdbcTemplate.query(
        """
        SELECT
          f.id,
          f.wallet_address,
          f.chain_id,
          f.sell_token_address,
          f.sell_token_symbol,
          f.sell_token_decimals,
          f.buy_token_address,
          f.buy_token_symbol,
          f.buy_token_decimals,
          f.target_rate,
          f.alert_direction,
          p.email_address,
          p.email_enabled,
          p.telegram_chat_id,
          p.telegram_enabled,
          (p.push_enabled AND COALESCE(active_push.subscription_count, 0) > 0) AS push_enabled,
          p.cooldown_minutes,
          email_alert.last_sent_at AS last_email_alert_at,
          telegram_alert.last_sent_at AS last_telegram_alert_at,
          push_alert.last_sent_at AS last_push_alert_at
        FROM favorite_pairs f
        JOIN notification_preferences p ON p.wallet_address = f.wallet_address
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS subscription_count
          FROM push_subscriptions ps
          WHERE ps.wallet_address = p.wallet_address
            AND ps.disabled_at IS NULL
        ) active_push ON true
        LEFT JOIN LATERAL (
          SELECT max(sent_at) AS last_sent_at
          FROM favorite_pair_alerts a
          WHERE a.favorite_pair_id = f.id
            AND a.channel = 'email'
            AND a.delivery_status = 'sent'
        ) email_alert ON true
        LEFT JOIN LATERAL (
          SELECT max(sent_at) AS last_sent_at
          FROM favorite_pair_alerts a
          WHERE a.favorite_pair_id = f.id
            AND a.channel = 'telegram'
            AND a.delivery_status = 'sent'
        ) telegram_alert ON true
        LEFT JOIN LATERAL (
          SELECT max(sent_at) AS last_sent_at
          FROM favorite_pair_alerts a
          WHERE a.favorite_pair_id = f.id
            AND a.channel = 'push'
            AND a.delivery_status = 'sent'
        ) push_alert ON true
        WHERE f.alerts_enabled
          AND f.target_rate IS NOT NULL
          AND (p.email_enabled OR p.telegram_enabled OR (p.push_enabled AND COALESCE(active_push.subscription_count, 0) > 0))
        ORDER BY f.updated_at DESC
        LIMIT ?
        """,
        (rs, rowNum) -> mapRow(rs),
        Math.max(1, limit));
  }

  private FavoritePairCandidate mapRow(ResultSet rs) throws SQLException {
    return new FavoritePairCandidate(
        rs.getObject("id", java.util.UUID.class),
        rs.getString("wallet_address"),
        rs.getLong("chain_id"),
        rs.getString("sell_token_address"),
        rs.getString("sell_token_symbol"),
        rs.getInt("sell_token_decimals"),
        rs.getString("buy_token_address"),
        rs.getString("buy_token_symbol"),
        rs.getInt("buy_token_decimals"),
        rs.getBigDecimal("target_rate"),
        rs.getString("alert_direction"),
        rs.getString("email_address"),
        rs.getBoolean("email_enabled"),
        timestampToInstant(rs.getTimestamp("last_email_alert_at")),
        rs.getString("telegram_chat_id"),
        rs.getBoolean("telegram_enabled"),
        timestampToInstant(rs.getTimestamp("last_telegram_alert_at")),
        rs.getBoolean("push_enabled"),
        timestampToInstant(rs.getTimestamp("last_push_alert_at")),
        rs.getInt("cooldown_minutes"));
  }

  private Instant timestampToInstant(Timestamp timestamp) {
    return timestamp == null ? null : timestamp.toInstant();
  }
}
