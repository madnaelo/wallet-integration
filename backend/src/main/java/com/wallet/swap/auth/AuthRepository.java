package com.wallet.swap.auth;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AuthRepository {
  private final JdbcTemplate jdbcTemplate;

  public AuthRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public void upsertUser(String walletAddress) {
    jdbcTemplate.update(
        """
        INSERT INTO wallet_users (wallet_address)
        VALUES (?)
        ON CONFLICT (wallet_address) DO NOTHING
        """,
        walletAddress);
  }

  public void saveNonce(String walletAddress, String nonce, String message, Instant expiresAt) {
    jdbcTemplate.update(
        """
        INSERT INTO wallet_nonces (wallet_address, nonce, message, expires_at, created_at)
        VALUES (?, ?, ?, ?, now())
        ON CONFLICT (wallet_address)
        DO UPDATE SET nonce = EXCLUDED.nonce,
          message = EXCLUDED.message,
          expires_at = EXCLUDED.expires_at,
          created_at = now()
        """,
        walletAddress,
        nonce,
        message,
        Timestamp.from(expiresAt));
  }

  public Optional<StoredNonce> findNonce(String walletAddress) {
    return jdbcTemplate.query(
        "SELECT nonce, message, expires_at FROM wallet_nonces WHERE wallet_address = ?",
        rs -> {
          if (!rs.next()) return Optional.empty();
          return Optional.of(new StoredNonce(
              rs.getString("nonce"),
              rs.getString("message"),
              rs.getTimestamp("expires_at").toInstant()));
        },
        walletAddress);
  }

  public void deleteNonce(String walletAddress) {
    jdbcTemplate.update("DELETE FROM wallet_nonces WHERE wallet_address = ?", walletAddress);
  }

  public void saveSession(UUID id, String walletAddress, String tokenHash, Instant expiresAt) {
    jdbcTemplate.update(
        """
        INSERT INTO wallet_sessions (id, wallet_address, token_hash, expires_at)
        VALUES (?, ?, ?, ?)
        """,
        id,
        walletAddress,
        tokenHash,
        Timestamp.from(expiresAt));
  }

  public Optional<String> findWalletBySessionTokenHash(String tokenHash, Instant now) {
    return jdbcTemplate.query(
        """
        SELECT wallet_address
        FROM wallet_sessions
        WHERE token_hash = ? AND expires_at > ?
        """,
        rs -> rs.next() ? Optional.of(rs.getString("wallet_address")) : Optional.empty(),
        tokenHash,
        Timestamp.from(now));
  }

  public int deleteExpiredNonces(Instant now) {
    return jdbcTemplate.update("DELETE FROM wallet_nonces WHERE expires_at <= ?", Timestamp.from(now));
  }

  public int deleteExpiredSessions(Instant now) {
    return jdbcTemplate.update("DELETE FROM wallet_sessions WHERE expires_at <= ?", Timestamp.from(now));
  }

  public void markLastLogin(String walletAddress) {
    jdbcTemplate.update("UPDATE wallet_users SET last_login_at = now() WHERE wallet_address = ?", walletAddress);
  }

  public record StoredNonce(String nonce, String message, Instant expiresAt) {}
}
