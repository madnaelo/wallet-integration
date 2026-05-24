package com.wallet.swap.notification;

import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.ReverseProfitModels.ReverseProfitOpportunity;
import java.math.BigDecimal;
import java.math.RoundingMode;
import org.springframework.stereotype.Component;

@Component
public class NotificationMessageFormatter {
  private final NotificationProperties properties;

  public NotificationMessageFormatter(NotificationProperties properties) {
    this.properties = properties;
  }

  public String subject(ReverseProfitOpportunity opportunity) {
    return "Reverse swap opportunity: %s to %s".formatted(
        opportunity.candidate().buyTokenSymbol(),
        opportunity.candidate().sellTokenSymbol());
  }

  public String body(ReverseProfitOpportunity opportunity) {
    String appUrl = properties.getAppUrl() == null || properties.getAppUrl().isBlank()
        ? "The Wallet"
        : properties.getAppUrl().trim();

    return """
        Reverse swap opportunity detected.

        Original swap: %s %s to %s %s
        Estimated reverse now: %s %s
        Indicative profit: +%s%%

        This estimate uses batched USD market prices to avoid excessive quote API calls. Check a live quote before swapping.

        Open The Wallet:
        %s
        """.formatted(
        amount(opportunity.originalSellAmount()),
        opportunity.candidate().sellTokenSymbol(),
        amount(opportunity.receivedBuyAmount()),
        opportunity.candidate().buyTokenSymbol(),
        amount(opportunity.estimatedReverseSellAmount()),
        opportunity.candidate().sellTokenSymbol(),
        percent(opportunity.profitBps()),
        appUrl);
  }

  private String amount(BigDecimal value) {
    return value.setScale(8, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString();
  }

  private String percent(int bps) {
    return BigDecimal.valueOf(bps)
        .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)
        .stripTrailingZeros()
        .toPlainString();
  }
}
