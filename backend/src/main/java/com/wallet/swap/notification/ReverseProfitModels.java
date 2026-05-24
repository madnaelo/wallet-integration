package com.wallet.swap.notification;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class ReverseProfitModels {
  private ReverseProfitModels() {}

  public record TokenRef(
      long chainId,
      String address,
      String symbol,
      int decimals) {}

  public record ReverseProfitCandidate(
      UUID swapHistoryId,
      String walletAddress,
      long chainId,
      String sellTokenAddress,
      String sellTokenSymbol,
      int sellTokenDecimals,
      String buyTokenAddress,
      String buyTokenSymbol,
      int buyTokenDecimals,
      BigDecimal sellAmountRaw,
      BigDecimal buyAmountRaw,
      int thresholdBps,
      int cooldownMinutes,
      String emailAddress,
      boolean emailEnabled,
      Instant lastEmailAlertAt,
      String telegramChatId,
      boolean telegramEnabled,
      Instant lastTelegramAlertAt,
      Instant createdAt) {
    public TokenRef sellToken() {
      return new TokenRef(chainId, sellTokenAddress, sellTokenSymbol, sellTokenDecimals);
    }

    public TokenRef buyToken() {
      return new TokenRef(chainId, buyTokenAddress, buyTokenSymbol, buyTokenDecimals);
    }
  }

  public record ReverseProfitOpportunity(
      ReverseProfitCandidate candidate,
      BigDecimal originalSellAmount,
      BigDecimal receivedBuyAmount,
      BigDecimal estimatedReverseSellAmount,
      BigDecimal sellTokenUsd,
      BigDecimal buyTokenUsd,
      BigDecimal estimatedReverseSellAmountRaw,
      int profitBps) {}
}
