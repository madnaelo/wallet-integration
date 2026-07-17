package com.wallet.swap.auth;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
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

  public void lockUserForNonce(String walletAddress) {
    jdbcTemplate.queryForObject(
        "SELECT wallet_address FROM wallet_users WHERE wallet_address = ? FOR UPDATE",
        String.class,
        walletAddress);
  }

  public void saveNonce(UUID id, String walletAddress, String nonce, String message, Instant expiresAt) {
    jdbcTemplate.update(
        """
        INSERT INTO wallet_nonces (id, wallet_address, nonce, message, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, now())
        """,
        id,
        walletAddress,
        nonce,
        message,
        Timestamp.from(expiresAt));
  }

  public void pruneWalletNonces(String walletAddress, int keepCount) {
    jdbcTemplate.update(
        """
        DELETE FROM wallet_nonces
        WHERE wallet_address = ?
          AND id NOT IN (
            SELECT id
            FROM wallet_nonces
            WHERE wallet_address = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ?
          )
        """,
        walletAddress,
        walletAddress,
        keepCount);
  }

  public Optional<StoredNonce> findNonceForUpdate(UUID id, String walletAddress) {
    return jdbcTemplate.query(
        "SELECT id, nonce, message, expires_at FROM wallet_nonces WHERE id = ? AND wallet_address = ? FOR UPDATE",
        rs -> {
          if (!rs.next()) return Optional.empty();
          return Optional.of(new StoredNonce(
              rs.getObject("id", UUID.class),
              rs.getString("nonce"),
              rs.getString("message"),
              rs.getTimestamp("expires_at").toInstant()));
        },
        id,
        walletAddress);
  }

  public List<StoredNonce> findWalletNoncesForUpdate(String walletAddress) {
    return jdbcTemplate.query(
        """
        SELECT id, nonce, message, expires_at
        FROM wallet_nonces
        WHERE wallet_address = ?
        ORDER BY created_at DESC, id DESC
        FOR UPDATE
        """,
        (rs, rowNum) -> new StoredNonce(
            rs.getObject("id", UUID.class),
            rs.getString("nonce"),
            rs.getString("message"),
            rs.getTimestamp("expires_at").toInstant()),
        walletAddress);
  }

  public void deleteNonce(UUID id, String walletAddress) {
    jdbcTemplate.update("DELETE FROM wallet_nonces WHERE id = ? AND wallet_address = ?", id, walletAddress);
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

  public void deleteSessionByTokenHash(String tokenHash) {
    jdbcTemplate.update("DELETE FROM wallet_sessions WHERE token_hash = ?", tokenHash);
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

  public record StoredNonce(UUID id, String nonce, String message, Instant expiresAt) {}
}
