package com.wallet.swap.autoswap;

import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleRequest;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleResponse;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleTarget;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AutoSwapRuleRepository {
  private final JdbcTemplate jdbcTemplate;

  public AutoSwapRuleRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public List<AutoSwapRuleResponse> listForWallet(String walletAddress) {
    return jdbcTemplate.query(
        """
        SELECT *
        FROM auto_swap_rules
        WHERE wallet_address = ?
        ORDER BY created_at DESC
        """,
        (rs, rowNum) -> mapRow(rs),
        walletAddress);
  }

  public AutoSwapRuleResponse insert(
      String walletAddress,
      AutoSwapRuleRequest request,
      String executionMode,
      String executionReadiness) {
    UUID id = UUID.randomUUID();
    return jdbcTemplate.queryForObject(
        """
        INSERT INTO auto_swap_rules (
          id, wallet_address, chain_id,
          sell_token_address, sell_token_symbol, sell_token_decimals,
          buy_token_address, buy_token_symbol, buy_token_decimals,
          sell_amount_raw, threshold_rate, alert_direction, slippage_bps,
          recipient_address, execution_mode, execution_readiness, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        RETURNING *
        """,
        (rs, rowNum) -> mapRow(rs),
        id,
        walletAddress,
        request.chainId(),
        request.sellTokenAddress().trim(),
        request.sellTokenSymbol().trim(),
        request.sellTokenDecimals(),
        request.buyTokenAddress().trim(),
        request.buyTokenSymbol().trim(),
        request.buyTokenDecimals(),
        request.sellAmountRaw().trim(),
        request.thresholdRate(),
        normalizeDirection(request.alertDirection()),
        request.slippageBps(),
        request.recipientAddress().trim(),
        executionMode,
        executionReadiness);
  }

  public List<AutoSwapRuleTarget> listTargetsForPair(String walletAddress, AutoSwapRuleRequest request) {
    return jdbcTemplate.query(
        """
        SELECT id, threshold_rate
        FROM auto_swap_rules
        WHERE wallet_address = ?
          AND chain_id = ?
          AND lower(sell_token_address) = lower(?)
          AND lower(buy_token_address) = lower(?)
          AND alert_direction = ?
          AND status = 'active'
        """,
        (rs, rowNum) -> new AutoSwapRuleTarget(rs.getObject("id", UUID.class), rs.getBigDecimal("threshold_rate")),
        walletAddress,
        request.chainId(),
        request.sellTokenAddress().trim(),
        request.buyTokenAddress().trim(),
        normalizeDirection(request.alertDirection()));
  }

  public void delete(String walletAddress, UUID id) {
    jdbcTemplate.update(
        """
        DELETE FROM auto_swap_rules
        WHERE wallet_address = ? AND id = ?
        """,
        walletAddress,
        id);
  }

  private AutoSwapRuleResponse mapRow(ResultSet rs) throws SQLException {
    return new AutoSwapRuleResponse(
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
        rs.getBigDecimal("threshold_rate"),
        rs.getString("alert_direction"),
        rs.getInt("slippage_bps"),
        rs.getString("recipient_address"),
        rs.getString("execution_mode"),
        rs.getString("execution_readiness"),
        rs.getString("status"),
        timestampToInstant(rs.getTimestamp("last_triggered_at")),
        timestampToInstant(rs.getTimestamp("created_at")),
        timestampToInstant(rs.getTimestamp("updated_at")));
  }

  private String normalizeDirection(String direction) {
    return direction == null || direction.isBlank() ? "above" : direction.trim().toLowerCase();
  }

  private Instant timestampToInstant(Timestamp timestamp) {
    return timestamp == null ? null : timestamp.toInstant();
  }
}
