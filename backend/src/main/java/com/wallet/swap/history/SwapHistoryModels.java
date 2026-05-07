package com.wallet.swap.history;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

public final class SwapHistoryModels {
  private SwapHistoryModels() {}

  public record SaveSwapHistoryRequest(
      @NotNull @Min(1) Long chainId,
      String txHash,
      @NotBlank String status,
      @NotBlank String sellTokenAddress,
      @NotBlank String sellTokenSymbol,
      @NotNull @Min(0) Integer sellTokenDecimals,
      @NotBlank String buyTokenAddress,
      @NotBlank String buyTokenSymbol,
      @NotNull @Min(0) Integer buyTokenDecimals,
      @NotBlank String sellAmountRaw,
      @NotBlank String buyAmountRaw,
      String minBuyAmountRaw,
      String aggregator,
      JsonNode quote) {}

  public record SwapHistoryResponse(
      UUID id,
      String walletAddress,
      Long chainId,
      String txHash,
      String status,
      String sellTokenAddress,
      String sellTokenSymbol,
      Integer sellTokenDecimals,
      String buyTokenAddress,
      String buyTokenSymbol,
      Integer buyTokenDecimals,
      String sellAmountRaw,
      String buyAmountRaw,
      String minBuyAmountRaw,
      String aggregator,
      JsonNode quote,
      Instant submittedAt,
      Instant confirmedAt,
      Instant createdAt) {}
}
