package com.wallet.swap.notification;

import static org.assertj.core.api.Assertions.assertThat;

import com.wallet.swap.notification.FavoritePairModels.FavoritePairCandidate;
import com.wallet.swap.notification.ReverseProfitModels.TokenRef;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class FavoritePairCalculatorTest {
  private final FavoritePairCalculator calculator = new FavoritePairCalculator();

  @Test
  void triggersWhenCurrentRateIsAtOrAboveTarget() {
    FavoritePairCandidate candidate = candidate("2500", "above");

    assertThat(calculator.evaluate(candidate, prices("2600", "1"))).isPresent();
  }

  @Test
  void ignoresWhenCurrentRateHasNotReachedTarget() {
    FavoritePairCandidate candidate = candidate("2500", "above");

    assertThat(calculator.evaluate(candidate, prices("2400", "1"))).isEmpty();
  }

  @Test
  void supportsBelowTargetAlerts() {
    FavoritePairCandidate candidate = candidate("2500", "below");

    assertThat(calculator.evaluate(candidate, prices("2400", "1"))).isPresent();
  }

  private Map<TokenRef, BigDecimal> prices(String sellTokenUsd, String buyTokenUsd) {
    FavoritePairCandidate candidate = candidate("2500", "above");
    return Map.of(
        candidate.sellToken(), new BigDecimal(sellTokenUsd),
        candidate.buyToken(), new BigDecimal(buyTokenUsd));
  }

  private FavoritePairCandidate candidate(String targetRate, String direction) {
    return new FavoritePairCandidate(
        UUID.randomUUID(),
        "0x1234567890123456789012345678901234567890",
        1L,
        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        "ETH",
        18,
        "0xdac17f958d2ee523a2206206994597c13d831ec7",
        "USDT",
        6,
        new BigDecimal(targetRate),
        direction,
        "user@example.com",
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
