package com.wallet.swap.autoswap;

import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapOpportunity;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleCandidate;
import com.wallet.swap.notification.ReverseProfitModels.TokenRef;
import java.math.BigDecimal;
import java.math.MathContext;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class AutoSwapCalculator {
  private static final MathContext MC = MathContext.DECIMAL128;

  public Optional<AutoSwapOpportunity> evaluate(
      AutoSwapRuleCandidate candidate,
      Map<TokenRef, BigDecimal> prices) {
    BigDecimal sellTokenUsd = prices.get(candidate.sellToken());
    BigDecimal buyTokenUsd = prices.get(candidate.buyToken());
    if (sellTokenUsd == null || buyTokenUsd == null || sellTokenUsd.signum() <= 0 || buyTokenUsd.signum() <= 0) {
      return Optional.empty();
    }
    if (candidate.thresholdRate() == null || candidate.thresholdRate().signum() <= 0) return Optional.empty();

    BigDecimal currentRate = sellTokenUsd.divide(buyTokenUsd, MC);
    boolean reached = "below".equals(candidate.alertDirection())
        ? currentRate.compareTo(candidate.thresholdRate()) <= 0
        : currentRate.compareTo(candidate.thresholdRate()) >= 0;
    if (!reached) return Optional.empty();

    return Optional.of(new AutoSwapOpportunity(candidate, currentRate, sellTokenUsd, buyTokenUsd));
  }
}
