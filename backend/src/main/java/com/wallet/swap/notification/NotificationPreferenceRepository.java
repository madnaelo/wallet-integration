package com.wallet.swap.notification;

import com.wallet.swap.notification.NotificationModels.NotificationPreferenceRequest;
import com.wallet.swap.notification.NotificationModels.NotificationPreferenceResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class NotificationPreferenceRepository {
  private final JdbcTemplate jdbcTemplate;

  public NotificationPreferenceRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public Optional<NotificationPreferenceResponse> find(String walletAddress) {
    return jdbcTemplate.query(
            """
            SELECT p.*,
              COALESCE(active_push.subscription_count, 0) AS push_subscription_count
            FROM notification_preferences p
            LEFT JOIN LATERAL (
              SELECT count(*)::int AS subscription_count
              FROM push_subscription_wallets psw
              JOIN push_subscriptions ps ON ps.id = psw.push_subscription_id
              WHERE psw.wallet_address = p.wallet_address
                AND psw.disabled_at IS NULL
                AND ps.disabled_at IS NULL
            ) active_push ON true
            WHERE p.wallet_address = ?
            """,
            (rs, rowNum) -> mapRow(rs),
            walletAddress)
        .stream()
        .findFirst();
  }

  public NotificationPreferenceResponse upsert(
      String walletAddress,
      NotificationPreferenceRequest request,
      String telegramChatId,
      boolean telegramEnabled,
      boolean pushEnabled,
      int defaultThresholdBps,
      int defaultLossThresholdBps,
      int defaultCooldownMinutes) {
    Integer reverseProfitThresholdBps = request.reverseProfitThresholdBps();
    if (reverseProfitThresholdBps == null) reverseProfitThresholdBps = Integer.valueOf(defaultThresholdBps);
    Integer reverseLossThresholdBps = request.reverseLossThresholdBps();
    if (reverseLossThresholdBps == null) reverseLossThresholdBps = Integer.valueOf(defaultLossThresholdBps);
    Integer cooldownMinutes = request.cooldownMinutes();
    if (cooldownMinutes == null) cooldownMinutes = Integer.valueOf(defaultCooldownMinutes);

    jdbcTemplate.update(
        """
        INSERT INTO notification_preferences (
          wallet_address, email_address, email_enabled, telegram_chat_id, telegram_enabled,
          push_enabled, reverse_profit_threshold_bps, reverse_loss_enabled, reverse_loss_threshold_bps, cooldown_minutes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (wallet_address) DO UPDATE SET
          email_address = EXCLUDED.email_address,
          email_enabled = EXCLUDED.email_enabled,
          telegram_chat_id = EXCLUDED.telegram_chat_id,
          telegram_enabled = EXCLUDED.telegram_enabled,
          push_enabled = EXCLUDED.push_enabled,
          reverse_profit_threshold_bps = EXCLUDED.reverse_profit_threshold_bps,
          reverse_loss_enabled = EXCLUDED.reverse_loss_enabled,
          reverse_loss_threshold_bps = EXCLUDED.reverse_loss_threshold_bps,
          cooldown_minutes = EXCLUDED.cooldown_minutes,
          updated_at = now()
        """,
        walletAddress,
        blankToNull(request.emailAddress()),
        Boolean.TRUE.equals(request.emailEnabled()),
        blankToNull(telegramChatId),
        telegramEnabled,
        pushEnabled,
        reverseProfitThresholdBps,
        Boolean.TRUE.equals(request.reverseLossEnabled()),
        reverseLossThresholdBps,
        cooldownMinutes);

    return find(walletAddress).orElseThrow();
  }

  public NotificationPreferenceResponse setPushEnabled(
      String walletAddress,
      boolean pushEnabled,
      int defaultThresholdBps,
      int defaultLossThresholdBps,
      int defaultCooldownMinutes) {
    jdbcTemplate.update(
        """
        INSERT INTO notification_preferences (
          wallet_address, push_enabled, reverse_profit_threshold_bps,
          reverse_loss_threshold_bps, cooldown_minutes
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (wallet_address) DO UPDATE SET
          push_enabled = EXCLUDED.push_enabled,
          updated_at = now()
        """,
        walletAddress,
        pushEnabled,
        defaultThresholdBps,
        defaultLossThresholdBps,
        defaultCooldownMinutes);
    return find(walletAddress).orElseThrow();
  }

  private NotificationPreferenceResponse mapRow(ResultSet rs) throws SQLException {
    return new NotificationPreferenceResponse(
        rs.getString("wallet_address"),
        rs.getString("email_address"),
        rs.getBoolean("email_enabled"),
        rs.getString("telegram_chat_id"),
        rs.getBoolean("telegram_enabled"),
        rs.getBoolean("push_enabled") && rs.getInt("push_subscription_count") > 0,
        rs.getInt("push_subscription_count"),
        rs.getInt("reverse_profit_threshold_bps"),
        rs.getBoolean("reverse_loss_enabled"),
        rs.getInt("reverse_loss_threshold_bps"),
        rs.getInt("cooldown_minutes"));
  }

  private String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }
}
