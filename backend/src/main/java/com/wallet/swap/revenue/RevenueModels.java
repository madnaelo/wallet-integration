package com.wallet.swap.revenue;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigInteger;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class RevenueModels {
  private RevenueModels() {}
  public enum State { EXPECTED, NOT_VERIFIED, ACCRUED, RECEIVED, FAILED }

  public record Envelope(@NotBlank @Size(max = 65000) String payload,
                         @Pattern(regexp = "[0-9a-f]{64}") @NotNull String signature) {}
  public record Batch(@NotNull UUID id, @Min(1) @Max(1) int version, long issuedAt,
                      @NotNull @Size(max = 8) List<@NotNull @Valid Snapshot> quotes,
                      @NotNull @Size(max = 8) List<@NotNull @Valid Outcome> outcomes) {}
  public record Outcome(@NotNull @Pattern(regexp = "0x|lifi|mock") String provider,
                        @NotNull @Pattern(regexp = "quoted|fee_validation_failed|unavailable") String outcome) {}
  public record Token(@NotBlank @Size(max = 128) String address,
                      @NotBlank @Size(max = 32) String symbol, @Min(0) @Max(30) int decimals) {}
  public record Snapshot(
      @NotNull UUID id, @Pattern(regexp = "0x|lifi") @NotNull String provider,
      @Size(max = 128) String providerQuoteId, @Size(max = 80) String bridge,
      @NotBlank @Size(max = 32) String executionKind,
      @Min(1) long sourceChain, @Min(1) long destinationChain,
      @Pattern(regexp = "0x[0-9a-fA-F]{40}") @NotNull String owner,
      @NotBlank @Size(max = 128) String taker, @NotBlank @Size(max = 128) String recipient,
      @NotNull @Valid Token sellToken, @NotNull @Valid Token buyToken, @NotNull @Valid Token feeToken,
      @Pattern(regexp = "[0-9]{1,78}") @NotNull String sellAmount,
      @Pattern(regexp = "[0-9]{1,78}") @NotNull String buyAmount,
      @Pattern(regexp = "[0-9]{1,78}") @NotNull String minimumAmount,
      @Min(1) @Max(300) int feeBps,
      @Pattern(regexp = "[0-9]{1,78}") @NotNull String expectedFee,
      @NotBlank @Size(max = 128) String beneficiary,
      @Pattern(regexp = "sell_amount_floor|provider_allocation") @NotNull String feeBasis,
      @NotBlank @Size(max = 128) String transactionTo,
      @Pattern(regexp = "[0-9]{1,78}") @NotNull String transactionValue,
      @Pattern(regexp = "[0-9a-f]{64}") @NotNull String dataHash) {}
  public record Claim(UUID id, UUID quoteId, UUID leaseToken, String wallet, String txHash,
                      int attempts, Instant createdAt) {}
  public record Settlement(State state, String reason, String source, boolean retry,
                           BigInteger fee, BigInteger volume, boolean swapConfirmed, JsonNode evidence) {}
}
