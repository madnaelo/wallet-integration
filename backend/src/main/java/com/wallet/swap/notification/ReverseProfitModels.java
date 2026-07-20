package com.wallet.swap.notification;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class ReverseProfitModels {
  private ReverseProfitModels() {}

  public enum ReverseAlertType {
    PROFIT("profit"),
    LOSS("loss");

    private final String value;

    ReverseAlertType(String value) {
      this.value = value;
    }

    public String value() {
      return value;
    }
  }

  public record TokenRef(
      long chainId,
      String address,
      String symbol,
      int decimals) {}

  public record ReverseProfitCandidate(
      UUID swapHistoryId,
      String walletAddress,
      long chainId,
      long buyChainId,
      String sellTokenAddress,
      String sellTokenSymbol,
      int sellTokenDecimals,
      String buyTokenAddress,
      String buyTokenSymbol,
      int buyTokenDecimals,
      BigDecimal sellAmountRaw,
      BigDecimal buyAmountRaw,
      int profitThresholdBps,
      boolean lossAlertsEnabled,
      int lossThresholdBps,
      int cooldownMinutes,
      String emailAddress,
      boolean emailEnabled,
      Instant lastEmailProfitAlertAt,
      Instant lastEmailLossAlertAt,
      String telegramChatId,
      boolean telegramEnabled,
      Instant lastTelegramProfitAlertAt,
      Instant lastTelegramLossAlertAt,
      boolean pushEnabled,
      Instant lastPushProfitAlertAt,
      Instant lastPushLossAlertAt,
      Instant createdAt) {
    public TokenRef sellToken() {
      return new TokenRef(chainId, sellTokenAddress, sellTokenSymbol, sellTokenDecimals);
    }

    public TokenRef buyToken() {
      return new TokenRef(buyChainId, buyTokenAddress, buyTokenSymbol, buyTokenDecimals);
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
      int profitBps,
      ReverseAlertType alertType) {
    public Instant lastEmailAlertAt() {
      return alertType == ReverseAlertType.LOSS
          ? candidate.lastEmailLossAlertAt()
          : candidate.lastEmailProfitAlertAt();
    }

    public Instant lastTelegramAlertAt() {
      return alertType == ReverseAlertType.LOSS
          ? candidate.lastTelegramLossAlertAt()
          : candidate.lastTelegramProfitAlertAt();
    }

    public Instant lastPushAlertAt() {
      return alertType == ReverseAlertType.LOSS
          ? candidate.lastPushLossAlertAt()
          : candidate.lastPushProfitAlertAt();
    }
  }
}
