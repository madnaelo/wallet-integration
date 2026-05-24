package com.wallet.swap.notification;

import com.wallet.swap.notification.FavoritePairModels.FavoritePairRequest;
import com.wallet.swap.notification.FavoritePairModels.FavoritePairResponse;
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

  public FavoritePairResponse upsert(String walletAddress, FavoritePairRequest request) {
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
        ON CONFLICT (wallet_address, chain_id, (lower(sell_token_address)), (lower(buy_token_address)))
        DO UPDATE SET
          sell_token_symbol = EXCLUDED.sell_token_symbol,
          sell_token_decimals = EXCLUDED.sell_token_decimals,
          buy_token_symbol = EXCLUDED.buy_token_symbol,
          buy_token_decimals = EXCLUDED.buy_token_decimals,
          target_rate = EXCLUDED.target_rate,
          alert_direction = EXCLUDED.alert_direction,
          alerts_enabled = EXCLUDED.alerts_enabled,
          updated_at = now()
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
}
