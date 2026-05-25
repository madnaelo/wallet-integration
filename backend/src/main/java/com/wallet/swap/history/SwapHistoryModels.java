package com.wallet.swap.history;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class SwapHistoryModels {
  private SwapHistoryModels() {}

  public record SaveSwapHistoryRequest(
      @NotNull @Min(1) Long chainId,
      @Size(max = 128) String txHash,
      @NotBlank @Size(max = 32) String status,
      @NotBlank @Size(max = 128) String sellTokenAddress,
      @NotBlank @Size(max = 32) String sellTokenSymbol,
      @NotNull @Min(0) @Max(30) Integer sellTokenDecimals,
      @NotBlank @Size(max = 128) String buyTokenAddress,
      @NotBlank @Size(max = 32) String buyTokenSymbol,
      @NotNull @Min(0) @Max(30) Integer buyTokenDecimals,
      @NotBlank @Size(max = 78) String sellAmountRaw,
      @NotBlank @Size(max = 78) String buyAmountRaw,
      @Size(max = 78) String minBuyAmountRaw,
      @Size(max = 64) String aggregator,
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
