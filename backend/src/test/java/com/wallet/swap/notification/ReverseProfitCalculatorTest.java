package com.wallet.swap.notification;

import static org.assertj.core.api.Assertions.assertThat;

import com.wallet.swap.notification.ReverseProfitModels.ReverseProfitCandidate;
import com.wallet.swap.notification.ReverseProfitModels.ReverseAlertType;
import com.wallet.swap.notification.ReverseProfitModels.TokenRef;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ReverseProfitCalculatorTest {
  private final ReverseProfitCalculator calculator = new ReverseProfitCalculator();

  @Test
  void evaluatesOpportunityWhenReverseEstimateBeatsThreshold() {
    ReverseProfitCandidate candidate = candidate(100);

    Optional<ReverseProfitModels.ReverseProfitOpportunity> opportunity = calculator.evaluate(candidate, Map.of(
        candidate.sellToken(), new BigDecimal("2000"),
        candidate.buyToken(), BigDecimal.ONE));

    assertThat(opportunity).isPresent();
    assertThat(opportunity.orElseThrow().estimatedReverseSellAmount()).isEqualByComparingTo("1.1");
    assertThat(opportunity.orElseThrow().profitBps()).isEqualTo(1000);
    assertThat(opportunity.orElseThrow().alertType()).isEqualTo(ReverseAlertType.PROFIT);
  }

  @Test
  void ignoresOpportunityBelowThreshold() {
    ReverseProfitCandidate candidate = candidate(100);

    Optional<ReverseProfitModels.ReverseProfitOpportunity> opportunity = calculator.evaluate(candidate, Map.of(
        candidate.sellToken(), new BigDecimal("2200"),
        candidate.buyToken(), BigDecimal.ONE));

    assertThat(opportunity).isEmpty();
  }

  @Test
  void evaluatesLossProtectionWhenReverseEstimateMovesAgainstUser() {
    ReverseProfitCandidate candidate = candidate(100, true, 500);

    Optional<ReverseProfitModels.ReverseProfitOpportunity> opportunity = calculator.evaluate(candidate, Map.of(
        candidate.sellToken(), new BigDecimal("2500"),
        candidate.buyToken(), BigDecimal.ONE));

    assertThat(opportunity).isPresent();
    assertThat(opportunity.orElseThrow().profitBps()).isEqualTo(-1200);
    assertThat(opportunity.orElseThrow().alertType()).isEqualTo(ReverseAlertType.LOSS);
  }

  private ReverseProfitCandidate candidate(int thresholdBps) {
    return candidate(thresholdBps, false, 500);
  }

  private ReverseProfitCandidate candidate(int thresholdBps, boolean lossEnabled, int lossThresholdBps) {
    return new ReverseProfitCandidate(
        UUID.randomUUID(),
        "0x1234567890123456789012345678901234567890",
        1L,
        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        "ETH",
        18,
        "0xdac17f958d2ee523a2206206994597c13d831ec7",
        "USDT",
        6,
        new BigDecimal("1000000000000000000"),
        new BigDecimal("2200000000"),
        thresholdBps,
        lossEnabled,
        lossThresholdBps,
        360,
        "user@example.com",
        true,
        null,
        null,
        "12345",
        true,
        null,
        null,
        Instant.now());
  }
}
