package com.wallet.swap.limitorder;

import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderRequest;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
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

  public LimitOrderResponse insert(
      String walletAddress,
      LimitOrderRequest request,
      String executionSupport,
      String executionStatus,
      String signedPayloadHash) {
    return jdbcTemplate.queryForObject(
        """
        INSERT INTO limit_orders (
          id, wallet_address, chain_id,
          sell_token_address, sell_token_symbol, sell_token_decimals,
          buy_token_address, buy_token_symbol, buy_token_decimals,
          sell_amount_raw, min_buy_amount_raw, target_rate, expires_at,
          recipient_address, execution_provider, execution_support, execution_status,
          terms_accepted_at, signed_payload_hash, order_hash, signature, signed_payload_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), ?, ?, ?, CAST(? AS jsonb))
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
        executionStatus,
        signedPayloadHash,
        request.orderHash().trim(),
        request.signature().trim(),
        request.signedPayloadJson().trim());
  }

  public LimitOrderResponse updateSubmissionStatus(UUID id, String executionStatus, String executionError) {
    return jdbcTemplate.queryForObject(
        """
        UPDATE limit_orders
        SET execution_status = ?,
            execution_error = ?,
            submitted_at = CASE WHEN ? = 'submitted' THEN now() ELSE submitted_at END,
            updated_at = now()
        WHERE id = ?
        RETURNING *
        """,
        (rs, rowNum) -> mapRow(rs),
        executionStatus,
        executionError,
        executionStatus,
        id);
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
}
