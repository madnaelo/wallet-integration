package com.wallet.swap.limitorder;

import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderRequest;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class LimitOrderRepository {
  private final JdbcTemplate jdbcTemplate;

  public LimitOrderRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public List<LimitOrderResponse> listForWallet(String walletAddress) {
    return jdbcTemplate.query(
        """
        SELECT *
        FROM limit_orders
        WHERE wallet_address = ?
        ORDER BY created_at DESC
        """,
        (rs, rowNum) -> mapRow(rs),
        walletAddress);
  }

  public Optional<LimitOrderResponse> insertIfAbsent(
      String walletAddress,
      LimitOrderRequest request,
      String executionSupport,
      String signedPayloadHash) {
    List<LimitOrderResponse> rows = jdbcTemplate.query(
        """
        INSERT INTO limit_orders (
          id, wallet_address, chain_id,
          sell_token_address, sell_token_symbol, sell_token_decimals,
          buy_token_address, buy_token_symbol, buy_token_decimals,
          sell_amount_raw, min_buy_amount_raw, target_rate, expires_at,
          recipient_address, execution_provider, execution_support, execution_status,
          terms_accepted_at, signed_payload_hash, order_hash, signature, signed_payload_json,
          signed_payload_hash_version, next_submission_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stored', now(), ?, ?, ?, CAST(? AS jsonb), ?, now())
        ON CONFLICT (order_hash) DO NOTHING
        RETURNING *
        """,
        (rs, rowNum) -> mapRow(rs),
        UUID.randomUUID(),
        walletAddress,
        request.chainId(),
        request.sellTokenAddress().trim(),
        request.sellTokenSymbol().trim(),
        request.sellTokenDecimals(),
        request.buyTokenAddress().trim(),
        request.buyTokenSymbol().trim(),
        request.buyTokenDecimals(),
        request.sellAmountRaw().trim(),
        request.minBuyAmountRaw().trim(),
        request.targetRate(),
        Timestamp.from(request.expiresAt()),
        request.recipientAddress().trim(),
        request.executionProvider().trim(),
        executionSupport,
        signedPayloadHash,
        request.orderHash().trim().toLowerCase(),
        request.signature().trim(),
        request.signedPayloadJson().trim(),
        LimitOrderPayloadIntegrity.CURRENT_VERSION);
    return rows.stream().findFirst();
  }

  public Optional<LimitOrderResponse> findByOrderHash(String orderHash) {
    List<LimitOrderResponse> rows = jdbcTemplate.query(
        "SELECT * FROM limit_orders WHERE lower(order_hash) = ? ORDER BY created_at LIMIT 1",
        (rs, rowNum) -> mapRow(rs),
        orderHash.trim().toLowerCase());
    return rows.stream().findFirst();
  }

  public Optional<LimitOrderResponse> findById(UUID id) {
    return queryOne("SELECT * FROM limit_orders WHERE id = ?", id);
  }

  public void scheduleManualRetry(UUID id) {
    jdbcTemplate.update(
        """
        UPDATE limit_orders
        SET submission_attempts = 0,
            next_submission_at = now(),
            execution_error = NULL,
            updated_at = now()
        WHERE id = ?
          AND execution_status IN ('stored', 'failed')
          AND expires_at > now()
          AND (submission_locked_until IS NULL OR submission_locked_until <= now())
        """,
        id);
  }

  public Optional<SubmissionCandidate> claimById(UUID id, int maxAttempts, Duration lockTtl) {
    UUID lockToken = UUID.randomUUID();
    long lockTtlMs = Math.max(1_000, lockTtl.toMillis());
    List<SubmissionCandidate> rows = jdbcTemplate.query(
        """
        WITH picked AS (
          SELECT id
          FROM limit_orders
          WHERE id = ?
            AND execution_status IN ('stored', 'pending_submission', 'failed')
            AND expires_at > now()
            AND next_submission_at <= now()
            AND submission_attempts < ?
            AND (submission_locked_until IS NULL OR submission_locked_until <= now())
          FOR UPDATE SKIP LOCKED
        )
        UPDATE limit_orders orders
        SET execution_status = 'pending_submission',
            submission_attempts = orders.submission_attempts + 1,
            last_submission_attempt_at = now(),
            submission_locked_until = now() + (? * interval '1 millisecond'),
            submission_lock_token = ?,
            updated_at = now()
        FROM picked
        WHERE orders.id = picked.id
        RETURNING orders.id, orders.wallet_address, orders.chain_id, orders.execution_provider, orders.order_hash,
          orders.signature, orders.signed_payload_hash, orders.signed_payload_hash_version,
          orders.signed_payload_json::text, orders.expires_at,
          orders.submission_attempts
        """,
        (rs, rowNum) -> mapSubmissionCandidate(rs, lockToken),
        id,
        Math.max(1, maxAttempts),
        lockTtlMs,
        lockToken);
    return rows.stream().findFirst();
  }

  public List<SubmissionCandidate> claimDue(int limit, int maxAttempts, Duration lockTtl) {
    UUID lockToken = UUID.randomUUID();
    long lockTtlMs = Math.max(1_000, lockTtl.toMillis());
    return jdbcTemplate.query(
        """
        WITH picked AS (
          SELECT id
          FROM limit_orders
          WHERE execution_status IN ('stored', 'pending_submission', 'failed')
            AND expires_at > now()
            AND next_submission_at <= now()
            AND submission_attempts < ?
            AND (submission_locked_until IS NULL OR submission_locked_until <= now())
          ORDER BY next_submission_at, created_at
          LIMIT ?
          FOR UPDATE SKIP LOCKED
        )
        UPDATE limit_orders orders
        SET execution_status = 'pending_submission',
            submission_attempts = orders.submission_attempts + 1,
            last_submission_attempt_at = now(),
            submission_locked_until = now() + (? * interval '1 millisecond'),
            submission_lock_token = ?,
            updated_at = now()
        FROM picked
        WHERE orders.id = picked.id
        RETURNING orders.id, orders.wallet_address, orders.chain_id, orders.execution_provider, orders.order_hash,
          orders.signature, orders.signed_payload_hash, orders.signed_payload_hash_version,
          orders.signed_payload_json::text, orders.expires_at,
          orders.submission_attempts
        """,
        (rs, rowNum) -> mapSubmissionCandidate(rs, lockToken),
        Math.max(1, maxAttempts),
        Math.max(1, limit),
        lockTtlMs,
        lockToken);
  }

  public Optional<LimitOrderResponse> completeSubmission(
      SubmissionCandidate candidate,
      String executionStatus,
      String executionError,
      String providerOrderId,
      Instant nextSubmissionAt,
      String verifiedPayloadHash,
      int verifiedPayloadHashVersion) {
    List<LimitOrderResponse> rows = jdbcTemplate.query(
        """
        UPDATE limit_orders
        SET execution_status = ?,
            execution_error = ?,
            provider_order_id = COALESCE(?, provider_order_id),
            submitted_at = CASE WHEN ? = 'submitted' THEN COALESCE(submitted_at, now()) ELSE submitted_at END,
            next_submission_at = ?,
            signed_payload_hash = ?,
            signed_payload_hash_version = ?,
            submission_locked_until = NULL,
            submission_lock_token = NULL,
            updated_at = now()
        WHERE id = ? AND submission_lock_token = ?
        RETURNING *
        """,
        (rs, rowNum) -> mapRow(rs),
        executionStatus,
        truncate(executionError, 1_000),
        providerOrderId,
        executionStatus,
        nextSubmissionAt == null ? null : Timestamp.from(nextSubmissionAt),
        verifiedPayloadHash,
        verifiedPayloadHashVersion,
        candidate.id(),
        candidate.lockToken());
    return rows.stream().findFirst();
  }

  public int markExpiredPending() {
    return jdbcTemplate.update(
        """
        UPDATE limit_orders
        SET execution_status = 'expired',
            execution_error = NULL,
            next_submission_at = NULL,
            submission_locked_until = NULL,
            submission_lock_token = NULL,
            updated_at = now()
        WHERE execution_status IN ('stored', 'pending_submission', 'failed')
          AND expires_at <= now()
        """);
  }

  private Optional<LimitOrderResponse> queryOne(String sql, Object parameter) {
    List<LimitOrderResponse> rows = jdbcTemplate.query(sql, (rs, rowNum) -> mapRow(rs), parameter);
    return rows.stream().findFirst();
  }

  private SubmissionCandidate mapSubmissionCandidate(ResultSet rs, UUID lockToken) throws SQLException {
    return new SubmissionCandidate(
        rs.getObject("id", UUID.class),
        rs.getString("wallet_address"),
        rs.getLong("chain_id"),
        rs.getString("execution_provider"),
        rs.getString("order_hash"),
        rs.getString("signature"),
        rs.getString("signed_payload_hash"),
        rs.getInt("signed_payload_hash_version"),
        rs.getString("signed_payload_json"),
        timestampToInstant(rs.getTimestamp("expires_at")),
        rs.getInt("submission_attempts"),
        lockToken);
  }

  private LimitOrderResponse mapRow(ResultSet rs) throws SQLException {
    return new LimitOrderResponse(
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
        rs.getString("min_buy_amount_raw"),
        rs.getBigDecimal("target_rate"),
        timestampToInstant(rs.getTimestamp("expires_at")),
        rs.getString("recipient_address"),
        rs.getString("execution_provider"),
        rs.getString("execution_support"),
        rs.getString("execution_status"),
        rs.getString("signed_payload_hash"),
        rs.getString("order_hash"),
        rs.getString("provider_order_id"),
        timestampToInstant(rs.getTimestamp("terms_accepted_at")),
        rs.getString("execution_error"),
        timestampToInstant(rs.getTimestamp("submitted_at")),
        timestampToInstant(rs.getTimestamp("executed_at")),
        timestampToInstant(rs.getTimestamp("created_at")),
        timestampToInstant(rs.getTimestamp("updated_at")));
  }

  private Instant timestampToInstant(Timestamp timestamp) {
    return timestamp == null ? null : timestamp.toInstant();
  }

  private String truncate(String value, int maxLength) {
    if (value == null) return null;
    return value.length() <= maxLength ? value : value.substring(0, maxLength);
  }

  public record SubmissionCandidate(
      UUID id,
      String walletAddress,
      long chainId,
      String executionProvider,
      String orderHash,
      String signature,
      String signedPayloadHash,
      int signedPayloadHashVersion,
      String signedPayloadJson,
      Instant expiresAt,
      int attempts,
      UUID lockToken) {}
}
