package com.wallet.swap.history;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.history.SwapHistoryModels.SaveSwapHistoryRequest;
import com.wallet.swap.history.SwapHistoryModels.SwapHistoryResponse;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class SwapHistoryRepository {
  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;

  public SwapHistoryRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
  }

  public SwapHistoryResponse save(String walletAddress, SaveSwapHistoryRequest request) {
    UUID id = UUID.randomUUID();
    String status = request.status();
    Instant now = Instant.now();
    Instant submittedAt = switch (status) {
      case "submitted", "confirmed", "failed", "refunded" -> now;
      default -> null;
    };
    Instant confirmedAt = "confirmed".equals(status) ? now : null;
    String quoteJson = request.quote() == null ? null : request.quote().toString();
    String aggregator = request.aggregator() == null || request.aggregator().isBlank()
        ? "0x"
        : request.aggregator().trim().toLowerCase(Locale.ROOT);
    String transactionHash = normalizeTransactionHash(request.txHash());

    List<SwapHistoryResponse> rows = jdbcTemplate.query(
        """
        INSERT INTO swap_history (
          id, wallet_address, chain_id, buy_chain_id, tx_hash, status,
          sell_token_address, sell_token_symbol, sell_token_decimals,
          buy_token_address, buy_token_symbol, buy_token_decimals,
          sell_amount_raw, buy_amount_raw, min_buy_amount_raw,
          aggregator, quote_json, submitted_at, confirmed_at, next_status_check_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?,
          CASE WHEN ? = 'lifi' AND ? <> ? AND ? = 'submitted' THEN now() ELSE NULL END)
        ON CONFLICT (wallet_address, chain_id, tx_hash)
          WHERE tx_hash IS NOT NULL AND tx_hash <> '' AND tx_hash <> 'dry-run'
        DO UPDATE SET
          status = CASE
            WHEN swap_history.status IN ('confirmed', 'refunded', 'failed') THEN swap_history.status
            WHEN EXCLUDED.status IN ('confirmed', 'refunded', 'failed') THEN EXCLUDED.status
            ELSE 'submitted'
          END,
          submitted_at = COALESCE(swap_history.submitted_at, EXCLUDED.submitted_at),
          confirmed_at = CASE
            WHEN swap_history.status = 'confirmed'
              OR (swap_history.status NOT IN ('refunded', 'failed') AND EXCLUDED.status = 'confirmed')
              THEN COALESCE(swap_history.confirmed_at, EXCLUDED.confirmed_at, now())
            ELSE swap_history.confirmed_at
          END,
          next_status_check_at = CASE
            WHEN swap_history.status IN ('confirmed', 'refunded', 'failed')
              OR EXCLUDED.status IN ('confirmed', 'refunded', 'failed') THEN NULL
            ELSE COALESCE(swap_history.next_status_check_at, EXCLUDED.next_status_check_at)
          END,
          updated_at = now()
        RETURNING *
        """,
        (rs, rowNum) -> mapRow(rs),
        id,
        walletAddress,
        request.chainId(),
        request.buyChainId(),
        transactionHash,
        status,
        request.sellTokenAddress(),
        request.sellTokenSymbol(),
        request.sellTokenDecimals(),
        request.buyTokenAddress(),
        request.buyTokenSymbol(),
        request.buyTokenDecimals(),
        new BigDecimal(request.sellAmountRaw()),
        new BigDecimal(request.buyAmountRaw()),
        blankToNull(request.minBuyAmountRaw()) == null ? null : new BigDecimal(request.minBuyAmountRaw()),
        aggregator,
        quoteJson,
        submittedAt == null ? null : Timestamp.from(submittedAt),
        confirmedAt == null ? null : Timestamp.from(confirmedAt),
        aggregator,
        request.chainId(),
        request.buyChainId(),
        status);

    if (rows.isEmpty()) throw new IllegalStateException("Swap history could not be saved.");
    return rows.get(0);
  }

  public List<SwapHistoryResponse> listForWallet(String walletAddress, int limit) {
    return jdbcTemplate.query(
        """
        SELECT *
        FROM swap_history
        WHERE wallet_address = ?
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (rs, rowNum) -> mapRow(rs),
        walletAddress,
        limit);
  }

  public int countForWallet(String walletAddress) {
    Integer count = jdbcTemplate.queryForObject(
        "SELECT count(*)::int FROM swap_history WHERE wallet_address = ?",
        Integer.class,
        walletAddress);
    return count == null ? 0 : count;
  }

  public boolean existsTransaction(String walletAddress, long chainId, String transactionHash) {
    String normalized = normalizeTransactionHash(transactionHash);
    if (normalized == null || "dry-run".equals(normalized)) return false;
    Boolean exists = jdbcTemplate.queryForObject(
        "SELECT EXISTS (SELECT 1 FROM swap_history WHERE wallet_address = ? AND chain_id = ? AND tx_hash = ?)",
        Boolean.class,
        walletAddress,
        chainId,
        normalized);
    return Boolean.TRUE.equals(exists);
  }

  public List<TransferStatusCandidate> claimDueStatusChecks(int limit, Duration lockTtl) {
    UUID lockToken = UUID.randomUUID();
    long lockTtlMs = Math.max(1_000, lockTtl.toMillis());
    return jdbcTemplate.query(
        """
        WITH picked AS (
          SELECT id
          FROM swap_history
          WHERE lower(aggregator) = 'lifi'
            AND status = 'submitted'
            AND chain_id <> buy_chain_id
            AND (tx_hash ~* '^(0x)?[0-9a-f]{64}$' OR tx_hash ~ '^[1-9A-HJ-NP-Za-km-z]{80,90}$')
            AND next_status_check_at <= now()
            AND (status_check_locked_until IS NULL OR status_check_locked_until <= now())
          ORDER BY next_status_check_at, created_at
          LIMIT ?
          FOR UPDATE SKIP LOCKED
        )
        UPDATE swap_history history
        SET status_check_attempts = history.status_check_attempts + 1,
            status_check_locked_until = now() + (? * interval '1 millisecond'),
            status_check_lock_token = ?,
            updated_at = now()
        FROM picked
        WHERE history.id = picked.id
        RETURNING history.id, history.chain_id, history.buy_chain_id, history.tx_hash,
          history.quote_json ->> 'bridgeTool' AS bridge_tool,
          history.status_check_attempts
        """,
        (rs, rowNum) -> new TransferStatusCandidate(
            rs.getObject("id", UUID.class),
            rs.getLong("chain_id"),
            rs.getLong("buy_chain_id"),
            rs.getString("tx_hash"),
            rs.getString("bridge_tool"),
            rs.getInt("status_check_attempts"),
            lockToken),
        Math.max(1, limit),
        lockTtlMs,
        lockToken);
  }

  public boolean completeStatusCheck(
      TransferStatusCandidate candidate,
      String status,
      String providerStatus,
      String providerSubstatus,
      String destinationTransactionHash,
      String statusCheckError,
      Instant nextStatusCheckAt) {
    int updated = jdbcTemplate.update(
        """
        UPDATE swap_history
        SET status = ?,
            provider_status = COALESCE(?, provider_status),
            provider_substatus = COALESCE(?, provider_substatus),
            destination_tx_hash = COALESCE(?, destination_tx_hash),
            status_check_error = ?,
            last_status_checked_at = now(),
            next_status_check_at = ?,
            status_check_locked_until = NULL,
            status_check_lock_token = NULL,
            confirmed_at = CASE WHEN ? = 'confirmed' THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END,
            updated_at = now()
        WHERE id = ?
          AND status_check_lock_token = ?
          AND status = 'submitted'
        """,
        status,
        truncate(providerStatus, 32),
        truncate(providerSubstatus, 64),
        normalizeTransactionHash(destinationTransactionHash),
        truncate(statusCheckError, 1_000),
        nextStatusCheckAt == null ? null : Timestamp.from(nextStatusCheckAt),
        status,
        candidate.id(),
        candidate.lockToken());
    return updated == 1;
  }

  public int stopExpiredTracking(Duration maximumAge) {
    long maximumAgeSeconds = Math.max(3_600, maximumAge.toSeconds());
    return jdbcTemplate.update(
        """
        UPDATE swap_history
        SET provider_status = 'TRACKING_PAUSED',
            provider_substatus = 'MAX_TRACKING_WINDOW',
            status_check_error = 'Automatic delivery tracking reached its maximum window.',
            last_status_checked_at = now(),
            next_status_check_at = NULL,
            status_check_locked_until = NULL,
            status_check_lock_token = NULL,
            updated_at = now()
        WHERE lower(aggregator) = 'lifi'
          AND status = 'submitted'
          AND next_status_check_at IS NOT NULL
          AND created_at < now() - (? * interval '1 second')
        """,
        maximumAgeSeconds);
  }

  private SwapHistoryResponse mapRow(ResultSet rs) throws SQLException {
    String quoteJson = rs.getString("quote_json");
    JsonNode quote = null;
    if (quoteJson != null) {
      try {
        quote = objectMapper.readTree(quoteJson);
      } catch (JsonProcessingException ignored) {
        quote = null;
      }
    }

    return new SwapHistoryResponse(
        rs.getObject("id", UUID.class),
        rs.getString("wallet_address"),
        rs.getLong("chain_id"),
        rs.getLong("buy_chain_id"),
        rs.getString("tx_hash"),
        rs.getString("status"),
        rs.getString("sell_token_address"),
        rs.getString("sell_token_symbol"),
        rs.getInt("sell_token_decimals"),
        rs.getString("buy_token_address"),
        rs.getString("buy_token_symbol"),
        rs.getInt("buy_token_decimals"),
        rs.getBigDecimal("sell_amount_raw").toPlainString(),
        rs.getBigDecimal("buy_amount_raw").toPlainString(),
        rs.getBigDecimal("min_buy_amount_raw") == null ? null : rs.getBigDecimal("min_buy_amount_raw").toPlainString(),
        rs.getString("aggregator"),
        quote,
        rs.getString("provider_status"),
        rs.getString("provider_substatus"),
        rs.getString("destination_tx_hash"),
        timestampToInstant(rs.getTimestamp("last_status_checked_at")),
        timestampToInstant(rs.getTimestamp("submitted_at")),
        timestampToInstant(rs.getTimestamp("confirmed_at")),
        timestampToInstant(rs.getTimestamp("created_at")),
        timestampToInstant(rs.getTimestamp("updated_at")));
  }

  private Instant timestampToInstant(Timestamp timestamp) {
    return timestamp == null ? null : timestamp.toInstant();
  }

  private String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }

  private String normalizeTransactionHash(String value) {
    String normalized = blankToNull(value);
    if (normalized == null) return null;
    normalized = normalized.trim();
    if (normalized.matches("(?i)^(0x)?[0-9a-f]{64}$")) return normalized.toLowerCase(Locale.ROOT);
    return normalized;
  }

  private String truncate(String value, int maxLength) {
    if (value == null) return null;
    String normalized = value.trim();
    return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
  }

  public record TransferStatusCandidate(
      UUID id,
      long fromChainId,
      long toChainId,
      String transactionHash,
      String bridge,
      int attempts,
      UUID lockToken) {}
}
