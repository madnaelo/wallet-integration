package com.wallet.swap.autoswap;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapOpportunity;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AutoSwapAlertRepository {
  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;
  private final AutoSwapRuleRepository autoSwapRuleRepository;

  public AutoSwapAlertRepository(
      JdbcTemplate jdbcTemplate,
      ObjectMapper objectMapper,
      AutoSwapRuleRepository autoSwapRuleRepository) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
    this.autoSwapRuleRepository = autoSwapRuleRepository;
  }

  public void saveDelivery(
      AutoSwapOpportunity opportunity,
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
      autoSwapRuleRepository.markTriggered(opportunity.candidate().id(), now);
    }
  }

  private ObjectNode priceSnapshot(AutoSwapOpportunity opportunity) {
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
