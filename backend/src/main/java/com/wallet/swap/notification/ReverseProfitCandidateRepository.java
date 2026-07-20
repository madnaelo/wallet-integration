package com.wallet.swap.notification;

import com.wallet.swap.notification.ReverseProfitModels.ReverseProfitCandidate;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ReverseProfitCandidateRepository {
  private final JdbcTemplate jdbcTemplate;

  public ReverseProfitCandidateRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public List<ReverseProfitCandidate> findCandidates(List<String> eligibleStatuses, int lookbackDays, int limit) {
    if (eligibleStatuses == null || eligibleStatuses.isEmpty()) return List.of();
    String placeholders = String.join(",", eligibleStatuses.stream().map(status -> "?").toList());
    List<Object> args = new ArrayList<>(eligibleStatuses);
    args.add(Math.max(1, lookbackDays));
    args.add(Math.max(1, limit));

    return jdbcTemplate.query(
        """
        SELECT
          h.id AS swap_history_id,
          h.wallet_address,
          h.chain_id,
          h.buy_chain_id,
          h.sell_token_address,
          h.sell_token_symbol,
          h.sell_token_decimals,
          h.buy_token_address,
          h.buy_token_symbol,
          h.buy_token_decimals,
          h.sell_amount_raw,
          h.buy_amount_raw,
          h.created_at,
          p.email_address,
          p.email_enabled,
          p.telegram_chat_id,
          p.telegram_enabled,
          (p.push_enabled AND COALESCE(active_push.subscription_count, 0) > 0) AS push_enabled,
          p.reverse_profit_threshold_bps,
          p.reverse_loss_enabled,
          p.reverse_loss_threshold_bps,
          p.cooldown_minutes,
          email_profit_alert.last_sent_at AS last_email_profit_alert_at,
          email_loss_alert.last_sent_at AS last_email_loss_alert_at,
          telegram_profit_alert.last_sent_at AS last_telegram_profit_alert_at,
          telegram_loss_alert.last_sent_at AS last_telegram_loss_alert_at,
          push_profit_alert.last_sent_at AS last_push_profit_alert_at,
          push_loss_alert.last_sent_at AS last_push_loss_alert_at
        FROM notification_preferences p
        JOIN swap_history h ON h.wallet_address = p.wallet_address
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS subscription_count
          FROM push_subscription_wallets psw
          JOIN push_subscriptions ps ON ps.id = psw.push_subscription_id
          WHERE psw.wallet_address = p.wallet_address
            AND psw.disabled_at IS NULL
            AND ps.disabled_at IS NULL
        ) active_push ON true
        LEFT JOIN LATERAL (
          SELECT max(sent_at) AS last_sent_at
          FROM reverse_profit_alerts a
          WHERE a.original_swap_history_id = h.id
            AND a.channel = 'email'
            AND a.alert_type = 'profit'
            AND a.delivery_status = 'sent'
        ) email_profit_alert ON true
        LEFT JOIN LATERAL (
          SELECT max(sent_at) AS last_sent_at
          FROM reverse_profit_alerts a
          WHERE a.original_swap_history_id = h.id
            AND a.channel = 'email'
            AND a.alert_type = 'loss'
            AND a.delivery_status = 'sent'
        ) email_loss_alert ON true
        LEFT JOIN LATERAL (
          SELECT max(sent_at) AS last_sent_at
          FROM reverse_profit_alerts a
          WHERE a.original_swap_history_id = h.id
            AND a.channel = 'telegram'
            AND a.alert_type = 'profit'
            AND a.delivery_status = 'sent'
        ) telegram_profit_alert ON true
        LEFT JOIN LATERAL (
          SELECT max(sent_at) AS last_sent_at
          FROM reverse_profit_alerts a
          WHERE a.original_swap_history_id = h.id
            AND a.channel = 'telegram'
            AND a.alert_type = 'loss'
            AND a.delivery_status = 'sent'
        ) telegram_loss_alert ON true
        LEFT JOIN LATERAL (
          SELECT max(sent_at) AS last_sent_at
          FROM reverse_profit_alerts a
          WHERE a.original_swap_history_id = h.id
            AND a.channel = 'push'
            AND a.alert_type = 'profit'
            AND a.delivery_status = 'sent'
        ) push_profit_alert ON true
        LEFT JOIN LATERAL (
          SELECT max(sent_at) AS last_sent_at
          FROM reverse_profit_alerts a
          WHERE a.original_swap_history_id = h.id
            AND a.channel = 'push'
            AND a.alert_type = 'loss'
            AND a.delivery_status = 'sent'
        ) push_loss_alert ON true
        WHERE (p.email_enabled OR p.telegram_enabled OR (p.push_enabled AND COALESCE(active_push.subscription_count, 0) > 0))
          AND h.status IN (%s)
          AND h.created_at >= now() - (? * interval '1 day')
        ORDER BY h.created_at DESC
        LIMIT ?
        """.formatted(placeholders),
        (rs, rowNum) -> mapRow(rs),
        args.toArray());
  }

  private ReverseProfitCandidate mapRow(ResultSet rs) throws SQLException {
    return new ReverseProfitCandidate(
        rs.getObject("swap_history_id", java.util.UUID.class),
        rs.getString("wallet_address"),
        rs.getLong("chain_id"),
        rs.getLong("buy_chain_id"),
        rs.getString("sell_token_address"),
        rs.getString("sell_token_symbol"),
        rs.getInt("sell_token_decimals"),
        rs.getString("buy_token_address"),
        rs.getString("buy_token_symbol"),
        rs.getInt("buy_token_decimals"),
        rs.getBigDecimal("sell_amount_raw"),
        rs.getBigDecimal("buy_amount_raw"),
        rs.getInt("reverse_profit_threshold_bps"),
        rs.getBoolean("reverse_loss_enabled"),
        rs.getInt("reverse_loss_threshold_bps"),
        rs.getInt("cooldown_minutes"),
        rs.getString("email_address"),
        rs.getBoolean("email_enabled"),
        timestampToInstant(rs.getTimestamp("last_email_profit_alert_at")),
        timestampToInstant(rs.getTimestamp("last_email_loss_alert_at")),
        rs.getString("telegram_chat_id"),
        rs.getBoolean("telegram_enabled"),
        timestampToInstant(rs.getTimestamp("last_telegram_profit_alert_at")),
        timestampToInstant(rs.getTimestamp("last_telegram_loss_alert_at")),
        rs.getBoolean("push_enabled"),
        timestampToInstant(rs.getTimestamp("last_push_profit_alert_at")),
        timestampToInstant(rs.getTimestamp("last_push_loss_alert_at")),
        timestampToInstant(rs.getTimestamp("created_at")));
  }

  private Instant timestampToInstant(Timestamp timestamp) {
    return timestamp == null ? null : timestamp.toInstant();
  }
}
