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
            SELECT *
            FROM notification_preferences
            WHERE wallet_address = ?
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
      int defaultThresholdBps,
      int defaultLossThresholdBps,
      int defaultCooldownMinutes) {
    jdbcTemplate.update(
        """
        INSERT INTO notification_preferences (
          wallet_address, email_address, email_enabled, telegram_chat_id, telegram_enabled,
          reverse_profit_threshold_bps, reverse_loss_enabled, reverse_loss_threshold_bps, cooldown_minutes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (wallet_address) DO UPDATE SET
          email_address = EXCLUDED.email_address,
          email_enabled = EXCLUDED.email_enabled,
          telegram_chat_id = EXCLUDED.telegram_chat_id,
          telegram_enabled = EXCLUDED.telegram_enabled,
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
        request.reverseProfitThresholdBps() == null ? defaultThresholdBps : request.reverseProfitThresholdBps(),
        Boolean.TRUE.equals(request.reverseLossEnabled()),
        request.reverseLossThresholdBps() == null ? defaultLossThresholdBps : request.reverseLossThresholdBps(),
        request.cooldownMinutes() == null ? defaultCooldownMinutes : request.cooldownMinutes());

    return find(walletAddress).orElseThrow();
  }

  private NotificationPreferenceResponse mapRow(ResultSet rs) throws SQLException {
    return new NotificationPreferenceResponse(
        rs.getString("wallet_address"),
        rs.getString("email_address"),
        rs.getBoolean("email_enabled"),
        rs.getString("telegram_chat_id"),
        rs.getBoolean("telegram_enabled"),
        rs.getInt("reverse_profit_threshold_bps"),
        rs.getBoolean("reverse_loss_enabled"),
        rs.getInt("reverse_loss_threshold_bps"),
        rs.getInt("cooldown_minutes"));
  }

  private String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }
}
