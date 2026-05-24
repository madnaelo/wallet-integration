package com.wallet.swap.notification;

import com.wallet.swap.notification.FavoritePairModels.FavoritePairCandidate;
import com.wallet.swap.notification.FavoritePairModels.FavoritePairOpportunity;
import com.wallet.swap.notification.ReverseProfitModels.TokenRef;
import java.math.BigDecimal;
import java.math.MathContext;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class FavoritePairCalculator {
  private static final MathContext MC = MathContext.DECIMAL128;

  public Optional<FavoritePairOpportunity> evaluate(
      FavoritePairCandidate candidate,
      Map<TokenRef, BigDecimal> prices) {
    BigDecimal sellTokenUsd = prices.get(candidate.sellToken());
    BigDecimal buyTokenUsd = prices.get(candidate.buyToken());
    if (sellTokenUsd == null || buyTokenUsd == null || sellTokenUsd.signum() <= 0 || buyTokenUsd.signum() <= 0) {
      return Optional.empty();
    }
    if (candidate.targetRate() == null || candidate.targetRate().signum() <= 0) return Optional.empty();

    BigDecimal currentRate = sellTokenUsd.divide(buyTokenUsd, MC);
    boolean reached = "below".equals(candidate.alertDirection())
        ? currentRate.compareTo(candidate.targetRate()) <= 0
        : currentRate.compareTo(candidate.targetRate()) >= 0;
    if (!reached) return Optional.empty();

    return Optional.of(new FavoritePairOpportunity(candidate, currentRate, sellTokenUsd, buyTokenUsd));
  }
}
