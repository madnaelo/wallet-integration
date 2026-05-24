package com.wallet.swap.notification;

import com.wallet.swap.notification.TelegramLinkModels.TelegramLinkCode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TelegramLinkCodeRepository {
  private final JdbcTemplate jdbcTemplate;

  public TelegramLinkCodeRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public void save(String walletAddress, String code, Instant expiresAt) {
    jdbcTemplate.update(
        """
        INSERT INTO telegram_link_codes (id, wallet_address, code, expires_at)
        VALUES (?, ?, ?, ?)
        """,
        UUID.randomUUID(),
        walletAddress,
        code,
        Timestamp.from(expiresAt));
  }

  public List<TelegramLinkCode> findActiveForWallet(String walletAddress) {
    return jdbcTemplate.query(
        """
        SELECT *
        FROM telegram_link_codes
        WHERE wallet_address = ?
          AND consumed_at IS NULL
          AND expires_at > now()
        ORDER BY created_at DESC
        LIMIT 5
        """,
        (rs, rowNum) -> mapRow(rs),
        walletAddress);
  }

  public void markConsumed(UUID id) {
    jdbcTemplate.update(
        """
        UPDATE telegram_link_codes
        SET consumed_at = now()
        WHERE id = ?
        """,
        id);
  }

  private TelegramLinkCode mapRow(ResultSet rs) throws SQLException {
    return new TelegramLinkCode(
        rs.getObject("id", UUID.class),
        rs.getString("wallet_address"),
        rs.getString("code"),
        timestampToInstant(rs.getTimestamp("expires_at")),
        timestampToInstant(rs.getTimestamp("consumed_at")),
        timestampToInstant(rs.getTimestamp("created_at")));
  }

  private Instant timestampToInstant(Timestamp timestamp) {
    return timestamp == null ? null : timestamp.toInstant();
  }
}
