package com.wallet.swap.notification;

import com.wallet.swap.notification.FavoritePairModels.FavoritePairRequest;
import com.wallet.swap.notification.FavoritePairModels.FavoritePairResponse;
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
public class FavoritePairRepository {
  private final JdbcTemplate jdbcTemplate;

  public FavoritePairRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public List<FavoritePairResponse> listForWallet(String walletAddress) {
    return jdbcTemplate.query(
        """
        SELECT *
        FROM favorite_pairs
        WHERE wallet_address = ?
        ORDER BY created_at DESC
        """,
        (rs, rowNum) -> mapRow(rs),
        walletAddress);
  }

  public FavoritePairResponse insert(String walletAddress, FavoritePairRequest request) {
    UUID id = UUID.randomUUID();
    return jdbcTemplate.queryForObject(
        """
        INSERT INTO favorite_pairs (
          id, wallet_address, chain_id,
          sell_token_address, sell_token_symbol, sell_token_decimals,
          buy_token_address, buy_token_symbol, buy_token_decimals,
          target_rate, alert_direction, alerts_enabled
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        request.targetRate(),
        normalizeDirection(request.alertDirection()),
        Boolean.TRUE.equals(request.alertsEnabled()));
  }

  public List<FavoritePairTarget> listTargetsForPair(String walletAddress, FavoritePairRequest request, UUID excludedId) {
    if (excludedId == null) {
      return jdbcTemplate.query(
          """
          SELECT id, target_rate
          FROM favorite_pairs
          WHERE wallet_address = ?
            AND chain_id = ?
            AND lower(sell_token_address) = lower(?)
            AND lower(buy_token_address) = lower(?)
            AND alert_direction = ?
            AND target_rate IS NOT NULL
          """,
          (rs, rowNum) -> new FavoritePairTarget(rs.getObject("id", UUID.class), rs.getBigDecimal("target_rate")),
          walletAddress,
          request.chainId(),
          request.sellTokenAddress().trim(),
          request.buyTokenAddress().trim(),
          normalizeDirection(request.alertDirection()));
    }

    return jdbcTemplate.query(
        """
        SELECT id, target_rate
        FROM favorite_pairs
        WHERE wallet_address = ?
          AND chain_id = ?
          AND lower(sell_token_address) = lower(?)
          AND lower(buy_token_address) = lower(?)
          AND alert_direction = ?
          AND target_rate IS NOT NULL
          AND id <> ?
        """,
        (rs, rowNum) -> new FavoritePairTarget(rs.getObject("id", UUID.class), rs.getBigDecimal("target_rate")),
        walletAddress,
        request.chainId(),
        request.sellTokenAddress().trim(),
        request.buyTokenAddress().trim(),
        normalizeDirection(request.alertDirection()),
        excludedId);
  }

  public boolean existsUntargetedForPair(String walletAddress, FavoritePairRequest request, UUID excludedId) {
    String excludedClause = excludedId == null ? "" : "\n          AND id <> ?";
    Object[] params = excludedId == null
        ? new Object[] {
            walletAddress,
            request.chainId(),
            request.sellTokenAddress().trim(),
            request.buyTokenAddress().trim()
        }
        : new Object[] {
            walletAddress,
            request.chainId(),
            request.sellTokenAddress().trim(),
            request.buyTokenAddress().trim(),
            excludedId
        };

    Integer count = jdbcTemplate.queryForObject(
        """
        SELECT count(*)
        FROM favorite_pairs
        WHERE wallet_address = ?
          AND chain_id = ?
          AND lower(sell_token_address) = lower(?)
          AND lower(buy_token_address) = lower(?)
          AND target_rate IS NULL
        """
            + excludedClause,
        Integer.class,
        params);
    return count != null && count > 0;
  }

  public FavoritePairResponse update(String walletAddress, UUID id, FavoritePairRequest request) {
    return jdbcTemplate.queryForObject(
        """
        UPDATE favorite_pairs SET
          chain_id = ?,
          sell_token_address = ?,
          sell_token_symbol = ?,
          sell_token_decimals = ?,
          buy_token_address = ?,
          buy_token_symbol = ?,
          buy_token_decimals = ?,
          target_rate = ?,
          alert_direction = ?,
          alerts_enabled = ?,
          updated_at = now()
        WHERE wallet_address = ? AND id = ?
        RETURNING *
        """,
        (rs, rowNum) -> mapRow(rs),
        request.chainId(),
        request.sellTokenAddress().trim(),
        request.sellTokenSymbol().trim(),
        request.sellTokenDecimals(),
        request.buyTokenAddress().trim(),
        request.buyTokenSymbol().trim(),
        request.buyTokenDecimals(),
        request.targetRate(),
        normalizeDirection(request.alertDirection()),
        Boolean.TRUE.equals(request.alertsEnabled()),
        walletAddress,
        id);
  }

  public void delete(String walletAddress, UUID id) {
    jdbcTemplate.update(
        """
        DELETE FROM favorite_pairs
        WHERE wallet_address = ? AND id = ?
        """,
        walletAddress,
        id);
  }

  private FavoritePairResponse mapRow(ResultSet rs) throws SQLException {
    return new FavoritePairResponse(
        rs.getObject("id", UUID.class),
        rs.getString("wallet_address"),
        rs.getLong("chain_id"),
        rs.getString("sell_token_address"),
        rs.getString("sell_token_symbol"),
        rs.getInt("sell_token_decimals"),
        rs.getString("buy_token_address"),
        rs.getString("buy_token_symbol"),
        rs.getInt("buy_token_decimals"),
        rs.getBigDecimal("target_rate"),
        rs.getString("alert_direction"),
        rs.getBoolean("alerts_enabled"),
        timestampToInstant(rs.getTimestamp("created_at")),
        timestampToInstant(rs.getTimestamp("updated_at")));
  }

  private String normalizeDirection(String direction) {
    return direction == null || direction.isBlank() ? "above" : direction.trim().toLowerCase();
  }

  private Instant timestampToInstant(Timestamp timestamp) {
    return timestamp == null ? null : timestamp.toInstant();
  }

  public record FavoritePairTarget(UUID id, BigDecimal targetRate) {}
}
