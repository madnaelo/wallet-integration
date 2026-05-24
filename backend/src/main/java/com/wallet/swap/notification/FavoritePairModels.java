package com.wallet.swap.notification;

import com.wallet.swap.notification.ReverseProfitModels.TokenRef;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class FavoritePairModels {
  private FavoritePairModels() {}

  public record FavoritePairRequest(
      @NotNull @Min(1) Long chainId,
      @NotBlank String sellTokenAddress,
      @NotBlank String sellTokenSymbol,
      @Min(0) @Max(30) Integer sellTokenDecimals,
      @NotBlank String buyTokenAddress,
      @NotBlank String buyTokenSymbol,
      @Min(0) @Max(30) Integer buyTokenDecimals,
      BigDecimal targetRate,
      String alertDirection,
      Boolean alertsEnabled) {}

  public record FavoritePairResponse(
      UUID id,
      String walletAddress,
      long chainId,
      String sellTokenAddress,
      String sellTokenSymbol,
      int sellTokenDecimals,
      String buyTokenAddress,
      String buyTokenSymbol,
      int buyTokenDecimals,
      BigDecimal targetRate,
      String alertDirection,
      boolean alertsEnabled,
      Instant createdAt,
      Instant updatedAt) {}

  public record FavoritePairCandidate(
      UUID id,
      String walletAddress,
      long chainId,
      String sellTokenAddress,
      String sellTokenSymbol,
      int sellTokenDecimals,
      String buyTokenAddress,
      String buyTokenSymbol,
      int buyTokenDecimals,
      BigDecimal targetRate,
      String alertDirection,
      String emailAddress,
      boolean emailEnabled,
      Instant lastEmailAlertAt,
      String telegramChatId,
      boolean telegramEnabled,
      Instant lastTelegramAlertAt,
      int cooldownMinutes) {
    public TokenRef sellToken() {
      return new TokenRef(chainId, sellTokenAddress, sellTokenSymbol, sellTokenDecimals);
    }

    public TokenRef buyToken() {
      return new TokenRef(chainId, buyTokenAddress, buyTokenSymbol, buyTokenDecimals);
    }
  }

  public record FavoritePairOpportunity(
      FavoritePairCandidate candidate,
      BigDecimal currentRate,
      BigDecimal sellTokenUsd,
      BigDecimal buyTokenUsd) {}
}
