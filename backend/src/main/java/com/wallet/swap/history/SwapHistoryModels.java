package com.wallet.swap.history;

import com.fasterxml.jackson.databind.JsonNode;
import com.wallet.swap.common.SafeText;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class SwapHistoryModels {
  private SwapHistoryModels() {}

  public record SaveSwapHistoryRequest(
      @NotNull @Min(1) Long chainId,
      @NotNull @Min(1) Long buyChainId,
      @Size(max = 128) @Pattern(regexp = SafeText.IDENTIFIER_PATTERN) String txHash,
      @NotBlank @Size(max = 32) String status,
      @NotBlank @Size(max = 128) @Pattern(regexp = SafeText.IDENTIFIER_PATTERN) String sellTokenAddress,
      @NotBlank @Size(max = 32) @Pattern(regexp = SafeText.DISPLAY_LABEL_PATTERN) String sellTokenSymbol,
      @NotNull @Min(0) @Max(30) Integer sellTokenDecimals,
      @NotBlank @Size(max = 128) @Pattern(regexp = SafeText.IDENTIFIER_PATTERN) String buyTokenAddress,
      @NotBlank @Size(max = 32) @Pattern(regexp = SafeText.DISPLAY_LABEL_PATTERN) String buyTokenSymbol,
      @NotNull @Min(0) @Max(30) Integer buyTokenDecimals,
      @NotBlank @Size(max = 78) String sellAmountRaw,
      @NotBlank @Size(max = 78) String buyAmountRaw,
      @Size(max = 78) String minBuyAmountRaw,
      @Size(max = 64) @Pattern(regexp = SafeText.DISPLAY_LABEL_PATTERN) String aggregator,
      JsonNode quote) {}

  public record SwapHistoryResponse(
      UUID id,
      String walletAddress,
      Long chainId,
      Long buyChainId,
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
      String providerStatus,
      String providerSubstatus,
      String destinationTransactionHash,
      Instant lastStatusCheckedAt,
      Instant submittedAt,
      Instant confirmedAt,
      Instant createdAt,
      Instant updatedAt) {}
}
