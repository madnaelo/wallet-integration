package com.wallet.swap.autoswap;

import com.wallet.swap.notification.ReverseProfitModels.TokenRef;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class AutoSwapRuleModels {
  private AutoSwapRuleModels() {}

  public record AutoSwapRuleRequest(
      @NotNull @Min(1) Long chainId,
      @NotBlank @Size(max = 128) String sellTokenAddress,
      @NotBlank @Size(max = 32) String sellTokenSymbol,
      @Min(0) @Max(30) Integer sellTokenDecimals,
      @NotBlank @Size(max = 128) String buyTokenAddress,
      @NotBlank @Size(max = 32) String buyTokenSymbol,
      @Min(0) @Max(30) Integer buyTokenDecimals,
      @NotBlank @Size(max = 78) @Pattern(regexp = "^[0-9]+$") String sellAmountRaw,
      @NotNull @Digits(integer = 20, fraction = 18) BigDecimal thresholdRate,
      @Size(max = 16) String alertDirection,
      @NotNull @Min(0) @Max(10000) Integer slippageBps,
      @NotBlank @Size(max = 256) String recipientAddress,
      @Size(max = 32) String executionMode) {}

  public record AutoSwapRuleResponse(
      UUID id,
      String walletAddress,
      long chainId,
      String sellTokenAddress,
      String sellTokenSymbol,
      int sellTokenDecimals,
      String buyTokenAddress,
      String buyTokenSymbol,
      int buyTokenDecimals,
      String sellAmountRaw,
      BigDecimal thresholdRate,
      String alertDirection,
      int slippageBps,
      String recipientAddress,
      String executionMode,
      String executionReadiness,
      String status,
      Instant lastTriggeredAt,
      Instant createdAt,
      Instant updatedAt) {}

  public record AutoSwapRuleTarget(UUID id, BigDecimal thresholdRate) {}

  public record AutoSwapRuleCandidate(
      UUID id,
      String walletAddress,
      long chainId,
      String sellTokenAddress,
      String sellTokenSymbol,
      int sellTokenDecimals,
      String buyTokenAddress,
      String buyTokenSymbol,
      int buyTokenDecimals,
      String sellAmountRaw,
      BigDecimal thresholdRate,
      String alertDirection,
      int slippageBps,
      String recipientAddress,
      String executionMode,
      String executionReadiness,
      String emailAddress,
      boolean emailEnabled,
      Instant lastEmailAlertAt,
      String telegramChatId,
      boolean telegramEnabled,
      Instant lastTelegramAlertAt,
      boolean pushEnabled,
      Instant lastPushAlertAt,
      int cooldownMinutes) {
    public TokenRef sellToken() {
      return new TokenRef(chainId, sellTokenAddress, sellTokenSymbol, sellTokenDecimals);
    }

    public TokenRef buyToken() {
      return new TokenRef(chainId, buyTokenAddress, buyTokenSymbol, buyTokenDecimals);
    }
  }

  public record AutoSwapOpportunity(
      AutoSwapRuleCandidate candidate,
      BigDecimal currentRate,
      BigDecimal sellTokenUsd,
      BigDecimal buyTokenUsd) {}
}
