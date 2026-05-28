package com.wallet.swap.notification;

import com.wallet.swap.notification.NotificationModels.PushSubscriptionRequest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class PushSubscriptionRepository {
  private final JdbcTemplate jdbcTemplate;

  public PushSubscriptionRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public void upsert(String walletAddress, PushSubscriptionRequest request, String userAgent) {
    jdbcTemplate.update(
        """
        INSERT INTO push_subscriptions (
          id, wallet_address, endpoint, p256dh, auth_secret, user_agent, disabled_at
        )
        VALUES (?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT (endpoint) DO UPDATE SET
          wallet_address = EXCLUDED.wallet_address,
          p256dh = EXCLUDED.p256dh,
          auth_secret = EXCLUDED.auth_secret,
          user_agent = EXCLUDED.user_agent,
          disabled_at = NULL,
          updated_at = now(),
          last_seen_at = now()
        """,
        UUID.randomUUID(),
        walletAddress,
        request.endpoint().trim(),
        request.keys().p256dh().trim(),
        request.keys().auth().trim(),
        truncate(userAgent, 500));
  }

  public int countActive(String walletAddress) {
    Integer count = jdbcTemplate.queryForObject(
        """
        SELECT count(*)::int
        FROM push_subscriptions
        WHERE wallet_address = ?
          AND disabled_at IS NULL
        """,
        Integer.class,
        walletAddress);
    return count == null ? 0 : count;
  }

  public List<PushSubscriptionRecord> findActiveForWallet(String walletAddress) {
    return jdbcTemplate.query(
        """
        SELECT id, wallet_address, endpoint, p256dh, auth_secret, created_at, updated_at, last_seen_at
        FROM push_subscriptions
        WHERE wallet_address = ?
          AND disabled_at IS NULL
        ORDER BY updated_at DESC
        """,
        (rs, rowNum) -> mapRow(rs),
        walletAddress);
  }

  public int disableForWallet(String walletAddress) {
    return jdbcTemplate.update(
        """
        UPDATE push_subscriptions
        SET disabled_at = COALESCE(disabled_at, now()),
          updated_at = now()
        WHERE wallet_address = ?
          AND disabled_at IS NULL
        """,
        walletAddress);
  }

  public void disableEndpoint(String endpoint) {
    jdbcTemplate.update(
        """
        UPDATE push_subscriptions
        SET disabled_at = COALESCE(disabled_at, now()),
          updated_at = now()
        WHERE endpoint = ?
        """,
        endpoint);
  }

  private PushSubscriptionRecord mapRow(ResultSet rs) throws SQLException {
    return new PushSubscriptionRecord(
        rs.getObject("id", UUID.class),
        rs.getString("wallet_address"),
        rs.getString("endpoint"),
        rs.getString("p256dh"),
        rs.getString("auth_secret"),
        rs.getTimestamp("created_at").toInstant(),
        rs.getTimestamp("updated_at").toInstant(),
        rs.getTimestamp("last_seen_at").toInstant());
  }

  private String truncate(String value, int maxLength) {
    if (value == null) return null;
    String trimmed = value.trim();
    return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
  }

  public record PushSubscriptionRecord(
      UUID id,
      String walletAddress,
      String endpoint,
      String p256dh,
      String authSecret,
      Instant createdAt,
      Instant updatedAt,
      Instant lastSeenAt) {}
}
