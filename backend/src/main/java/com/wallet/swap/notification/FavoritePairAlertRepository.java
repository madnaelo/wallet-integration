package com.wallet.swap.notification;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wallet.swap.notification.FavoritePairModels.FavoritePairOpportunity;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class FavoritePairAlertRepository {
  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;

  public FavoritePairAlertRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
  }

  public void saveDelivery(
      FavoritePairOpportunity opportunity,
      String channel,
      String target,
      boolean sent,
      String errorMessage) {
    Instant now = Instant.now();
    jdbcTemplate.update(
        """
        INSERT INTO favorite_pair_alerts (
          id, favorite_pair_id, wallet_address, channel, target,
          delivery_status, error_message, current_rate, target_rate, alert_direction,
          price_snapshot_json, sent_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?)
        """,
        UUID.randomUUID(),
        opportunity.candidate().id(),
        opportunity.candidate().walletAddress(),
        channel,
        target,
        sent ? "sent" : "failed",
        truncate(errorMessage, 1_000),
        opportunity.currentRate(),
        opportunity.candidate().targetRate(),
        opportunity.candidate().alertDirection(),
        priceSnapshot(opportunity).toString(),
        sent ? Timestamp.from(now) : null);
  }

  private ObjectNode priceSnapshot(FavoritePairOpportunity opportunity) {
    ObjectNode node = objectMapper.createObjectNode();
    node.put("source", "coingecko");
    node.put("priceCurrency", "usd");
    node.put("sellTokenUsd", opportunity.sellTokenUsd());
    node.put("buyTokenUsd", opportunity.buyTokenUsd());
    node.put("currentRate", opportunity.currentRate());
    node.put("targetRate", opportunity.candidate().targetRate());
    return node;
  }

  private String truncate(String value, int maxLength) {
    if (value == null) return null;
    return value.length() <= maxLength ? value : value.substring(0, maxLength);
  }
}
