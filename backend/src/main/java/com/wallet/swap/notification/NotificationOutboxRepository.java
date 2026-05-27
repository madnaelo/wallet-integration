package com.wallet.swap.notification;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class NotificationOutboxRepository {
  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;

  public NotificationOutboxRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
  }

  public boolean enqueue(
      String dedupeKey,
      String notificationKind,
      String channel,
      String target,
      String subject,
      String body,
      Object payload) {
    try {
      int rows = jdbcTemplate.update(
          """
          INSERT INTO notification_outbox (
            id, dedupe_key, notification_kind, channel, target, subject, body,
            payload_json, status, next_attempt_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), 'pending', now())
          ON CONFLICT (dedupe_key) DO NOTHING
          """,
          UUID.randomUUID(),
          dedupeKey,
          notificationKind,
          channel,
          target,
          subject,
          body,
          objectMapper.writeValueAsString(payload));
      return rows > 0;
    } catch (JsonProcessingException exception) {
      throw new IllegalArgumentException("Notification payload could not be serialized.", exception);
    }
  }

  public List<NotificationOutboxItem> claimPending(int limit, int maxAttempts, Duration lockTtl) {
    long lockTtlMs = Math.max(1_000, lockTtl.toMillis());
    return jdbcTemplate.query(
        """
        WITH picked AS (
          SELECT id
          FROM notification_outbox
          WHERE (status = 'pending' OR (status = 'sending' AND locked_until <= now()))
            AND next_attempt_at <= now()
            AND attempts < ?
          ORDER BY created_at
          LIMIT ?
          FOR UPDATE SKIP LOCKED
        )
        UPDATE notification_outbox outbox
        SET status = 'sending',
          locked_until = now() + (? * interval '1 millisecond'),
          attempts = outbox.attempts + 1,
          updated_at = now()
        FROM picked
        WHERE outbox.id = picked.id
        RETURNING outbox.id, outbox.notification_kind, outbox.channel, outbox.target,
          outbox.subject, outbox.body, outbox.payload_json::text, outbox.attempts
        """,
        (rs, rowNum) -> mapRow(rs),
        Math.max(1, maxAttempts),
        Math.max(1, limit),
        lockTtlMs);
  }

  public void markSent(UUID id) {
    jdbcTemplate.update(
        """
        UPDATE notification_outbox
        SET status = 'sent',
          locked_until = NULL,
          last_error = NULL,
          sent_at = now(),
          updated_at = now()
        WHERE id = ?
        """,
        id);
  }

  public void markFailed(UUID id, String errorMessage, boolean retry, Duration retryDelay) {
    jdbcTemplate.update(
        """
        UPDATE notification_outbox
        SET status = ?,
          locked_until = NULL,
          last_error = ?,
          next_attempt_at = ?,
          updated_at = now()
        WHERE id = ?
        """,
        retry ? "pending" : "failed",
        truncate(errorMessage, 1_000),
        Timestamp.from(Instant.now().plus(retry ? retryDelay : Duration.ZERO)),
        id);
  }

  public int markExhaustedPending(int maxAttempts) {
    return jdbcTemplate.update(
        """
        UPDATE notification_outbox
        SET status = 'failed',
          locked_until = NULL,
          last_error = COALESCE(last_error, 'Notification retry limit reached.'),
          updated_at = now()
        WHERE (status = 'pending' OR (status = 'sending' AND locked_until <= now()))
          AND attempts >= ?
        """,
        Math.max(1, maxAttempts));
  }

  private NotificationOutboxItem mapRow(ResultSet rs) throws SQLException {
    return new NotificationOutboxItem(
        rs.getObject("id", UUID.class),
        rs.getString("notification_kind"),
        rs.getString("channel"),
        rs.getString("target"),
        rs.getString("subject"),
        rs.getString("body"),
        rs.getString("payload_json"),
        rs.getInt("attempts"));
  }

  private String truncate(String value, int maxLength) {
    if (value == null) return null;
    return value.length() <= maxLength ? value : value.substring(0, maxLength);
  }

  public record NotificationOutboxItem(
      UUID id,
      String notificationKind,
      String channel,
      String target,
      String subject,
      String body,
      String payloadJson,
      int attempts) {}
}
