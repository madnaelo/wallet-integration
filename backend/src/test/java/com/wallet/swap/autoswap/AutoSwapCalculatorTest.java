package com.wallet.swap.autoswap;

import static org.assertj.core.api.Assertions.assertThat;

import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapOpportunity;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleCandidate;
import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AutoSwapCalculatorTest {
  private final AutoSwapCalculator calculator = new AutoSwapCalculator();

  @Test
  void triggersWhenCurrentRateReachesAboveTarget() {
    AutoSwapRuleCandidate candidate = candidate("above", "2000");

    Optional<AutoSwapOpportunity> result = calculator.evaluate(candidate, Map.of(
        candidate.sellToken(), new BigDecimal("2100"),
        candidate.buyToken(), BigDecimal.ONE));

    assertThat(result).isPresent();
    assertThat(result.get().currentRate()).isEqualByComparingTo(new BigDecimal("2100"));
  }

  @Test
  void ignoresWhenCurrentRateHasNotReachedBelowTarget() {
    AutoSwapRuleCandidate candidate = candidate("below", "1900");

    Optional<AutoSwapOpportunity> result = calculator.evaluate(candidate, Map.of(
        candidate.sellToken(), new BigDecimal("2000"),
        candidate.buyToken(), BigDecimal.ONE));

    assertThat(result).isEmpty();
  }

  private AutoSwapRuleCandidate candidate(String direction, String thresholdRate) {
    return new AutoSwapRuleCandidate(
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
        360);
  }
}
