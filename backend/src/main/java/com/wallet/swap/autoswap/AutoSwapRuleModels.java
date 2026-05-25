package com.wallet.swap.autoswap;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class AutoSwapRuleModels {
  private AutoSwapRuleModels() {}

  public record AutoSwapRuleRequest(
      @NotNull @Min(1) Long chainId,
      @NotBlank String sellTokenAddress,
      @NotBlank String sellTokenSymbol,
      @Min(0) @Max(30) Integer sellTokenDecimals,
      @NotBlank String buyTokenAddress,
      @NotBlank String buyTokenSymbol,
      @Min(0) @Max(30) Integer buyTokenDecimals,
      @NotBlank @Pattern(regexp = "^[0-9]+$") String sellAmountRaw,
      @NotNull BigDecimal thresholdRate,
      String alertDirection,
      @NotNull @Min(0) @Max(10000) Integer slippageBps,
      @NotBlank String recipientAddress,
      String executionMode) {}

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
}
