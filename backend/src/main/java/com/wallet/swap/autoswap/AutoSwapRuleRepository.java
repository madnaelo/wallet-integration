package com.wallet.swap.autoswap;

import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleRequest;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleResponse;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleCandidate;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleTarget;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AutoSwapRuleRepository {
  private final JdbcTemplate jdbcTemplate;

  public AutoSwapRuleRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public List<AutoSwapRuleResponse> listForWallet(String walletAddress) {
    return jdbcTemplate.query(
        """
        SELECT *
        FROM auto_swap_rules
        WHERE wallet_address = ?
        ORDER BY created_at DESC
        """,
        (rs, rowNum) -> mapRow(rs),
        walletAddress);
  }

  public AutoSwapRuleResponse insert(
      String walletAddress,
      AutoSwapRuleRequest request,
      String executionMode,
      String executionReadiness) {
    UUID id = UUID.randomUUID();
    return jdbcTemplate.queryForObject(
        """
        INSERT INTO auto_swap_rules (
          id, wallet_address, chain_id,
          sell_token_address, sell_token_symbol, sell_token_decimals,
          buy_token_address, buy_token_symbol, buy_token_decimals,
          sell_amount_raw, threshold_rate, alert_direction, slippage_bps,
          recipient_address, execution_mode, execution_readiness, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        RETURNING *
        """,
        (rs, rowNum) -> mapRow(rs),
        id,
        walletAddress,
        request.chainId(),
        request.sellTokenAddress().trim(),
        request.sellTokenSymbol().trim(),
        request.sellTokenDecimals(),
        request.buyTokenAddress().trim(),
        request.buyTokenSymbol().trim(),
        request.buyTokenDecimals(),
        request.sellAmountRaw().trim(),
        request.thresholdRate(),
        normalizeDirection(request.alertDirection()),
        request.slippageBps(),
        request.recipientAddress().trim(),
        executionMode,
        executionReadiness);
  }

  public List<AutoSwapRuleTarget> listTargetsForPair(String walletAddress, AutoSwapRuleRequest request) {
    return jdbcTemplate.query(
        """
        SELECT id, threshold_rate
        FROM auto_swap_rules
        WHERE wallet_address = ?
          AND chain_id = ?
          AND lower(sell_token_address) = lower(?)
          AND lower(buy_token_address) = lower(?)
          AND alert_direction = ?
          AND status = 'active'
        """,
        (rs, rowNum) -> new AutoSwapRuleTarget(rs.getObject("id", UUID.class), rs.getBigDecimal("threshold_rate")),
        walletAddress,
        request.chainId(),
        request.sellTokenAddress().trim(),
        request.buyTokenAddress().trim(),
        normalizeDirection(request.alertDirection()));
  }

  public List<AutoSwapRuleCandidate> findNotificationCandidates(int limit) {
    return jdbcTemplate.query(
        """
        SELECT
          r.id,
          r.wallet_address,
          r.chain_id,
          r.sell_token_address,
          r.sell_token_symbol,
          r.sell_token_decimals,
          r.buy_token_address,
          r.buy_token_symbol,
          r.buy_token_decimals,
          r.sell_amount_raw,
          r.threshold_rate,
          r.alert_direction,
          r.slippage_bps,
          r.recipient_address,
          r.execution_mode,
          r.execution_readiness,
          p.email_address,
          p.email_enabled,
          p.telegram_chat_id,
          p.telegram_enabled,
          (p.push_enabled AND COALESCE(active_push.subscription_count, 0) > 0) AS push_enabled,
          p.cooldown_minutes,
          email_alert.last_sent_at AS last_email_alert_at,
          telegram_alert.last_sent_at AS last_telegram_alert_at,
          push_alert.last_sent_at AS last_push_alert_at
        FROM auto_swap_rules r
        JOIN notification_preferences p ON p.wallet_address = r.wallet_address
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
          FROM auto_swap_alerts a
          WHERE a.auto_swap_rule_id = r.id
            AND a.channel = 'email'
            AND a.delivery_status = 'sent'
        ) email_alert ON true
        LEFT JOIN LATERAL (
          SELECT max(sent_at) AS last_sent_at
          FROM auto_swap_alerts a
          WHERE a.auto_swap_rule_id = r.id
            AND a.channel = 'telegram'
            AND a.delivery_status = 'sent'
        ) telegram_alert ON true
        LEFT JOIN LATERAL (
          SELECT max(sent_at) AS last_sent_at
          FROM auto_swap_alerts a
          WHERE a.auto_swap_rule_id = r.id
            AND a.channel = 'push'
            AND a.delivery_status = 'sent'
        ) push_alert ON true
        WHERE r.status = 'active'
          AND (p.email_enabled OR p.telegram_enabled OR (p.push_enabled AND COALESCE(active_push.subscription_count, 0) > 0))
        ORDER BY r.updated_at DESC
        LIMIT ?
        """,
        (rs, rowNum) -> mapCandidateRow(rs),
        Math.max(1, limit));
  }

  public void delete(String walletAddress, UUID id) {
    jdbcTemplate.update(
        """
        DELETE FROM auto_swap_rules
        WHERE wallet_address = ? AND id = ?
        """,
        walletAddress,
        id);
  }

  public void markTriggered(UUID id, Instant triggeredAt) {
    jdbcTemplate.update(
        """
        UPDATE auto_swap_rules
        SET last_triggered_at = ?, updated_at = now()
        WHERE id = ?
        """,
        Timestamp.from(triggeredAt),
        id);
  }

  private AutoSwapRuleResponse mapRow(ResultSet rs) throws SQLException {
    return new AutoSwapRuleResponse(
        rs.getObject("id", UUID.class),
        rs.getString("wallet_address"),
        rs.getLong("chain_id"),
        rs.getString("sell_token_address"),
        rs.getString("sell_token_symbol"),
        rs.getInt("sell_token_decimals"),
        rs.getString("buy_token_address"),
        rs.getString("buy_token_symbol"),
        rs.getInt("buy_token_decimals"),
        rs.getString("sell_amount_raw"),
        rs.getBigDecimal("threshold_rate"),
        rs.getString("alert_direction"),
        rs.getInt("slippage_bps"),
        rs.getString("recipient_address"),
        rs.getString("execution_mode"),
        rs.getString("execution_readiness"),
        rs.getString("status"),
        timestampToInstant(rs.getTimestamp("last_triggered_at")),
        timestampToInstant(rs.getTimestamp("created_at")),
        timestampToInstant(rs.getTimestamp("updated_at")));
  }

  private String normalizeDirection(String direction) {
    return direction == null || direction.isBlank() ? "above" : direction.trim().toLowerCase(Locale.ROOT);
  }

  private AutoSwapRuleCandidate mapCandidateRow(ResultSet rs) throws SQLException {
    return new AutoSwapRuleCandidate(
        rs.getObject("id", UUID.class),
        rs.getString("wallet_address"),
        rs.getLong("chain_id"),
        rs.getString("sell_token_address"),
        rs.getString("sell_token_symbol"),
        rs.getInt("sell_token_decimals"),
        rs.getString("buy_token_address"),
        rs.getString("buy_token_symbol"),
        rs.getInt("buy_token_decimals"),
        rs.getString("sell_amount_raw"),
        rs.getBigDecimal("threshold_rate"),
        rs.getString("alert_direction"),
        rs.getInt("slippage_bps"),
        rs.getString("recipient_address"),
        rs.getString("execution_mode"),
        rs.getString("execution_readiness"),
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
