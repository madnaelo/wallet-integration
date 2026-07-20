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
import java.util.List;
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
      case "submitted", "confirmed", "failed" -> now;
      default -> null;
    };
    Instant confirmedAt = "confirmed".equals(status) ? now : null;
    String quoteJson = request.quote() == null ? null : request.quote().toString();
    String aggregator = request.aggregator() == null || request.aggregator().isBlank() ? "0x" : request.aggregator();

    jdbcTemplate.update(
        """
        INSERT INTO swap_history (
          id, wallet_address, chain_id, buy_chain_id, tx_hash, status,
          sell_token_address, sell_token_symbol, sell_token_decimals,
          buy_token_address, buy_token_symbol, buy_token_decimals,
          sell_amount_raw, buy_amount_raw, min_buy_amount_raw,
          aggregator, quote_json, submitted_at, confirmed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?)
        """,
        id,
        walletAddress,
        request.chainId(),
        request.buyChainId(),
        blankToNull(request.txHash()),
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
        confirmedAt == null ? null : Timestamp.from(confirmedAt));

    return findById(walletAddress, id);
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

  private SwapHistoryResponse findById(String walletAddress, UUID id) {
    return jdbcTemplate.queryForObject(
        "SELECT * FROM swap_history WHERE wallet_address = ? AND id = ?",
        (rs, rowNum) -> mapRow(rs),
        walletAddress,
        id);
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
        timestampToInstant(rs.getTimestamp("submitted_at")),
        timestampToInstant(rs.getTimestamp("confirmed_at")),
        timestampToInstant(rs.getTimestamp("created_at")));
  }

  private Instant timestampToInstant(Timestamp timestamp) {
    return timestamp == null ? null : timestamp.toInstant();
  }

  private String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }
}
