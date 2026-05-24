package com.wallet.swap.notification;

import com.wallet.swap.notification.ReverseProfitModels.ReverseProfitCandidate;
import com.wallet.swap.notification.ReverseProfitModels.ReverseProfitOpportunity;
import com.wallet.swap.notification.ReverseProfitModels.TokenRef;
import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class ReverseProfitCalculator {
  private static final MathContext MC = MathContext.DECIMAL128;

  public Optional<ReverseProfitOpportunity> evaluate(
      ReverseProfitCandidate candidate,
      Map<TokenRef, BigDecimal> prices) {
    BigDecimal sellTokenUsd = prices.get(candidate.sellToken());
    BigDecimal buyTokenUsd = prices.get(candidate.buyToken());
    if (sellTokenUsd == null || buyTokenUsd == null || sellTokenUsd.signum() <= 0 || buyTokenUsd.signum() <= 0) {
      return Optional.empty();
    }

    BigDecimal originalSellAmount = toHuman(candidate.sellAmountRaw(), candidate.sellTokenDecimals());
    BigDecimal receivedBuyAmount = toHuman(candidate.buyAmountRaw(), candidate.buyTokenDecimals());
    if (originalSellAmount.signum() <= 0 || receivedBuyAmount.signum() <= 0) return Optional.empty();

    BigDecimal estimatedReverseSellAmount = receivedBuyAmount.multiply(buyTokenUsd, MC).divide(sellTokenUsd, MC);
    if (estimatedReverseSellAmount.signum() <= 0) return Optional.empty();

    BigDecimal profitRatio = estimatedReverseSellAmount.divide(originalSellAmount, MC).subtract(BigDecimal.ONE, MC);
    int profitBps = profitRatio
        .multiply(BigDecimal.valueOf(10_000), MC)
        .setScale(0, RoundingMode.HALF_UP)
        .intValue();
    if (profitBps < candidate.thresholdBps()) return Optional.empty();

    BigDecimal estimatedReverseSellAmountRaw = estimatedReverseSellAmount
        .multiply(BigDecimal.TEN.pow(candidate.sellTokenDecimals()), MC)
        .setScale(0, RoundingMode.DOWN);

    return Optional.of(new ReverseProfitOpportunity(
        candidate,
        originalSellAmount,
        receivedBuyAmount,
        estimatedReverseSellAmount,
        sellTokenUsd,
        buyTokenUsd,
        estimatedReverseSellAmountRaw,
        profitBps));
  }

  private BigDecimal toHuman(BigDecimal raw, int decimals) {
    return raw.divide(BigDecimal.TEN.pow(decimals), Math.max(decimals, 18), RoundingMode.HALF_UP).stripTrailingZeros();
  }
}
