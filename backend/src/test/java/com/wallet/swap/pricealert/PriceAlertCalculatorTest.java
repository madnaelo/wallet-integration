package com.wallet.swap.pricealert;

import static org.assertj.core.api.Assertions.assertThat;

import com.wallet.swap.pricealert.PriceAlertModels.PriceAlertOpportunity;
import com.wallet.swap.pricealert.PriceAlertModels.PriceAlertCandidate;
import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PriceAlertCalculatorTest {
  private final PriceAlertCalculator calculator = new PriceAlertCalculator();

  @Test
  void triggersWhenCurrentRateReachesAboveTarget() {
    PriceAlertCandidate candidate = candidate("above", "2000");

    Optional<PriceAlertOpportunity> result = calculator.evaluate(candidate, Map.of(
        candidate.sellToken(), new BigDecimal("2100"),
        candidate.buyToken(), BigDecimal.ONE));

    assertThat(result).isPresent();
    assertThat(result.get().currentRate()).isEqualByComparingTo(new BigDecimal("2100"));
  }

  @Test
  void ignoresWhenCurrentRateHasNotReachedBelowTarget() {
    PriceAlertCandidate candidate = candidate("below", "1900");

    Optional<PriceAlertOpportunity> result = calculator.evaluate(candidate, Map.of(
        candidate.sellToken(), new BigDecimal("2000"),
        candidate.buyToken(), BigDecimal.ONE));

    assertThat(result).isEmpty();
  }

  private PriceAlertCandidate candidate(String direction, String thresholdRate) {
    return new PriceAlertCandidate(
        UUID.randomUUID(),
        "0x0000000000000000000000000000000000000001",
        1L,
        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        "ETH",
        18,
        "0xdac17f958d2ee523a2206206994597c13d831ec7",
        "USDT",
        6,
        "1000000000000000000",
        new BigDecimal(thresholdRate),
        direction,
        100,
        "0x0000000000000000000000000000000000000001",
        "notify_to_confirm",
        "confirmation_required",
        "alerts@example.com",
        true,
        null,
        "12345",
        true,
        null,
        false,
        null,
        360);
  }
}
