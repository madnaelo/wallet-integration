package com.wallet.swap.limitorder;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMin;
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

public final class LimitOrderModels {
  private static final String EVM_ADDRESS_PATTERN = "(?i)^0x[0-9a-f]{40}$";
  private static final String ORDER_HASH_PATTERN = "(?i)^0x[0-9a-f]{64}$";
  private static final String EOA_SIGNATURE_PATTERN = "(?i)^0x[0-9a-f]{130}$";

  private LimitOrderModels() {}

  public record LimitOrderCapabilityRequest(
      @NotNull @Min(1) Long chainId,
      @NotBlank @Size(max = 128) String sellTokenAddress,
      @NotBlank @Size(max = 32) String sellTokenSymbol,
      @Min(0) @Max(30) Integer sellTokenDecimals,
      @NotBlank @Size(max = 128) String buyTokenAddress,
      @NotBlank @Size(max = 32) String buyTokenSymbol,
      @Min(0) @Max(30) Integer buyTokenDecimals) {}

  public record LimitOrderCapabilityResponse(
      boolean automaticExecutionSupported,
      String executionProvider,
      String executionSupport,
      String reason,
      String requiredSignature,
      String riskLevel) {}

  public record LimitOrderRequest(
      @NotNull @Min(1) Long chainId,
      @NotBlank
          @Size(max = 128)
          @Pattern(regexp = EVM_ADDRESS_PATTERN, message = "must be an EVM token address")
          String sellTokenAddress,
      @NotBlank @Size(max = 32) String sellTokenSymbol,
      @Min(0) @Max(30) Integer sellTokenDecimals,
      @NotBlank
          @Size(max = 128)
          @Pattern(regexp = EVM_ADDRESS_PATTERN, message = "must be an EVM token address")
          String buyTokenAddress,
      @NotBlank @Size(max = 32) String buyTokenSymbol,
      @Min(0) @Max(30) Integer buyTokenDecimals,
      @NotBlank @Size(max = 78) @Pattern(regexp = "^[0-9]+$") String sellAmountRaw,
      @NotBlank @Size(max = 78) @Pattern(regexp = "^[0-9]+$") String minBuyAmountRaw,
      @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 20, fraction = 18) BigDecimal targetRate,
      @NotNull Instant expiresAt,
      @NotBlank
          @Size(max = 128)
          @Pattern(regexp = EVM_ADDRESS_PATTERN, message = "must be an EVM address")
          String recipientAddress,
      @NotBlank @Size(max = 32) String executionProvider,
      @NotBlank
          @Size(max = 128)
          @Pattern(regexp = ORDER_HASH_PATTERN, message = "must be a 32-byte hex hash")
          String orderHash,
      @NotBlank
          @Size(min = 132, max = 132)
          @Pattern(regexp = EOA_SIGNATURE_PATTERN, message = "must be a 65-byte EVM signature")
          String signature,
      @NotBlank @Size(max = 20000) String signedPayloadJson,
      @AssertTrue boolean termsAccepted) {}

  public record LimitOrderResponse(
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
      String minBuyAmountRaw,
      BigDecimal targetRate,
      Instant expiresAt,
      String recipientAddress,
      String executionProvider,
      String executionSupport,
      String executionStatus,
      String signedPayloadHash,
      String orderHash,
      String providerOrderId,
      Instant termsAcceptedAt,
      String executionError,
      Instant submittedAt,
      Instant executedAt,
      Instant createdAt,
      Instant updatedAt) {}
}
