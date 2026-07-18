package com.wallet.swap.pricealert;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wallet.swap.pricealert.PriceAlertModels.PriceAlertOpportunity;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class PriceAlertDeliveryRepository {
  // Table names are retained for compatibility with already-applied migrations.
  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;
  private final PriceAlertRepository priceAlertRepository;

  public PriceAlertDeliveryRepository(
      JdbcTemplate jdbcTemplate,
      ObjectMapper objectMapper,
      PriceAlertRepository priceAlertRepository) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
    this.priceAlertRepository = priceAlertRepository;
  }

  public void saveDelivery(
      PriceAlertOpportunity opportunity,
      String channel,
      String target,
      boolean sent,
      String errorMessage) {
    Instant now = Instant.now();
    jdbcTemplate.update(
        """
        INSERT INTO auto_swap_alerts (
          id, auto_swap_rule_id, wallet_address, channel, target,
          delivery_status, error_message, current_rate, threshold_rate, alert_direction,
          sell_amount_raw, slippage_bps, price_snapshot_json, sent_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?)
        """,
        UUID.randomUUID(),
        opportunity.candidate().id(),
        opportunity.candidate().walletAddress(),
        channel,
        target,
        sent ? "sent" : "failed",
        truncate(errorMessage, 1_000),
        opportunity.currentRate(),
        opportunity.candidate().thresholdRate(),
        opportunity.candidate().alertDirection(),
        opportunity.candidate().sellAmountRaw(),
        opportunity.candidate().slippageBps(),
        priceSnapshot(opportunity).toString(),
        sent ? Timestamp.from(now) : null);

    if (sent) {
      priceAlertRepository.markTriggered(opportunity.candidate().id(), now);
    }
  }

  private ObjectNode priceSnapshot(PriceAlertOpportunity opportunity) {
    ObjectNode node = objectMapper.createObjectNode();
    node.put("source", "coingecko");
    node.put("priceCurrency", "usd");
    node.put("sellTokenUsd", opportunity.sellTokenUsd());
    node.put("buyTokenUsd", opportunity.buyTokenUsd());
    node.put("currentRate", opportunity.currentRate());
    node.put("thresholdRate", opportunity.candidate().thresholdRate());
    return node;
  }

  private String truncate(String value, int maxLength) {
    if (value == null) return null;
    return value.length() <= maxLength ? value : value.substring(0, maxLength);
  }
}
