package com.wallet.swap.notification;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wallet.swap.notification.ReverseProfitModels.ReverseProfitOpportunity;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ReverseProfitAlertRepository {
  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;

  public ReverseProfitAlertRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
  }

  public void saveDelivery(
      ReverseProfitOpportunity opportunity,
      String channel,
      String target,
      boolean sent,
      String errorMessage) {
    Instant now = Instant.now();
    jdbcTemplate.update(
        """
        INSERT INTO reverse_profit_alerts (
          id, wallet_address, original_swap_history_id, alert_type, channel, target,
          delivery_status, error_message, profit_bps,
          original_sell_amount_raw, estimated_reverse_sell_amount_raw,
          price_snapshot_json, sent_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?)
        """,
        UUID.randomUUID(),
        opportunity.candidate().walletAddress(),
        opportunity.candidate().swapHistoryId(),
        opportunity.alertType().value(),
        channel,
        target,
        sent ? "sent" : "failed",
        truncate(errorMessage, 1_000),
        opportunity.profitBps(),
        opportunity.candidate().sellAmountRaw(),
        opportunity.estimatedReverseSellAmountRaw(),
        priceSnapshot(opportunity).toString(),
        sent ? Timestamp.from(now) : null);
  }

  private ObjectNode priceSnapshot(ReverseProfitOpportunity opportunity) {
    ObjectNode node = objectMapper.createObjectNode();
    node.put("source", "coingecko");
    node.put("priceCurrency", "usd");
    node.put("sellTokenUsd", opportunity.sellTokenUsd());
    node.put("buyTokenUsd", opportunity.buyTokenUsd());
    node.put("originalSellAmount", opportunity.originalSellAmount());
    node.put("receivedBuyAmount", opportunity.receivedBuyAmount());
    node.put("estimatedReverseSellAmount", opportunity.estimatedReverseSellAmount());
    return node;
  }

  private String truncate(String value, int maxLength) {
    if (value == null) return null;
    return value.length() <= maxLength ? value : value.substring(0, maxLength);
  }
}
