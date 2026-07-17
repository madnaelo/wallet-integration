package com.wallet.swap.limitorder;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.common.ApiException;
import com.wallet.swap.feature.FeatureFlagService;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderRequest;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderResponse;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class LimitOrderServiceTest {
  private static final long ONEINCH_FALLBACK_CHAIN = 10L;
  private static final String WALLET = "0x0000000000000000000000000000000000000001";
  private static final String WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  private static final String USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

  private final ObjectMapper objectMapper = new ObjectMapper();
  private final LimitOrderCapabilityService capabilityService = new LimitOrderCapabilityService();
  private final FeatureFlagService featureFlagService = mock(FeatureFlagService.class);
  private final LimitOrderRepository repository = mock(LimitOrderRepository.class);
  private final LimitOrderSubmissionCoordinator submissionCoordinator = mock(LimitOrderSubmissionCoordinator.class);
  private final LimitOrderSignatureVerifier signatureVerifier = mock(LimitOrderSignatureVerifier.class);
  private final LimitOrderService service = new LimitOrderService(
      capabilityService,
      featureFlagService,
      repository,
      submissionCoordinator,
      signatureVerifier,
      objectMapper);

  @Test
  void checksFeatureFlagBeforeSaving() {
    LimitOrderRequest request = validRequest(WALLET);
    LimitOrderResponse stored = response("stored");
    when(repository.insertIfAbsent(eq(WALLET), any(), eq("supported"), any()))
        .thenReturn(Optional.of(stored));
    when(submissionCoordinator.submitNow(stored.id())).thenReturn(Optional.of(response("submitted")));

    service.save(WALLET, request);

    verify(featureFlagService).requireLimitOrdersEnabled();
  }

  @Test
  void rejectsTamperedMakerBeforeSubmission() {
    LimitOrderRequest request = validRequest("0x0000000000000000000000000000000000000002");

    assertThatThrownBy(() -> service.save(WALLET, request))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("maker");
  }

  @Test
  void submitsOnlyPersistedPayloadThatMatchesRequestTerms() {
    LimitOrderRequest request = validRequest(WALLET);
    LimitOrderResponse stored = response("stored");
    when(repository.insertIfAbsent(eq(WALLET), any(), eq("supported"), any()))
        .thenReturn(Optional.of(stored));
    when(submissionCoordinator.submitNow(stored.id())).thenReturn(Optional.of(response("submitted")));

    service.save(WALLET, request);

    verify(repository).insertIfAbsent(eq(WALLET), eq(request), eq("supported"), any());
    verify(signatureVerifier).verify(eq(WALLET), eq(request.orderHash()), eq(request.signature()), any());
    verify(submissionCoordinator).submitNow(stored.id());
  }

  @Test
  void retriesAnExistingIdenticalOrderIdempotently() {
    LimitOrderRequest request = validRequest(WALLET);
    LimitOrderResponse failed = response("failed", payloadHash(request.signedPayloadJson()));
    when(repository.insertIfAbsent(eq(WALLET), any(), eq("supported"), any()))
        .thenReturn(Optional.empty());
    when(repository.findByOrderHash(request.orderHash())).thenReturn(Optional.of(failed));
    when(submissionCoordinator.submitNow(failed.id())).thenReturn(Optional.of(response("submitted")));

    service.save(WALLET, request);

    verify(repository).scheduleManualRetry(failed.id());
    verify(submissionCoordinator).submitNow(failed.id());
  }

  @Test
  void rejectsDisplayRateThatDoesNotMatchSignedAmounts() {
    LimitOrderRequest valid = validRequest(WALLET);
    LimitOrderRequest request = new LimitOrderRequest(
        valid.chainId(),
        valid.sellTokenAddress(),
        valid.sellTokenSymbol(),
        valid.sellTokenDecimals(),
        valid.buyTokenAddress(),
        valid.buyTokenSymbol(),
        valid.buyTokenDecimals(),
        valid.sellAmountRaw(),
        valid.minBuyAmountRaw(),
        new BigDecimal("2501"),
        valid.expiresAt(),
        valid.recipientAddress(),
        valid.executionProvider(),
        valid.orderHash(),
        valid.signature(),
        valid.signedPayloadJson(),
        true);

    assertThatThrownBy(() -> service.save(WALLET, request))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("Target rate");
  }

  private LimitOrderRequest validRequest(String maker) {
    Instant expiresAt = Instant.now().plusSeconds(3600).truncatedTo(ChronoUnit.SECONDS);
    BigInteger makerTraits = BigInteger.ONE.shiftLeft(255)
        .or(BigInteger.valueOf(expiresAt.getEpochSecond()).shiftLeft(80))
        .or(BigInteger.valueOf(7).shiftLeft(120));
    String payload = validPayload(maker, makerTraits.toString(), expiresAt);
    return new LimitOrderRequest(
        ONEINCH_FALLBACK_CHAIN,
        WETH,
        "WETH",
        18,
        USDT,
        "USDT",
        6,
        "1000000000000000000",
        "2500000000",
        new BigDecimal("2500"),
        expiresAt,
        WALLET,
        "1inch_orderbook",
        "0x" + "a".repeat(64),
        "0x" + "1".repeat(130),
        payload,
        true);
  }

  private String validPayload(String maker, String makerTraits, Instant expiresAt) {
    return """
        {
          "version": "1inch-limit-order-v4",
          "provider": "1inch_orderbook",
          "chainId": %d,
          "data": {
            "salt": "1",
            "maker": "%s",
            "receiver": "%s",
            "makerAsset": "%s",
            "takerAsset": "%s",
            "makingAmount": "1000000000000000000",
            "takingAmount": "2500000000",
            "makerTraits": "%s",
            "extension": "0x"
          },
          "typedData": {
            "types": {
              "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"}
              ],
              "Order": [
                {"name": "salt", "type": "uint256"},
                {"name": "maker", "type": "address"},
                {"name": "receiver", "type": "address"},
                {"name": "makerAsset", "type": "address"},
                {"name": "takerAsset", "type": "address"},
                {"name": "makingAmount", "type": "uint256"},
                {"name": "takingAmount", "type": "uint256"},
                {"name": "makerTraits", "type": "uint256"}
              ]
            },
            "primaryType": "Order",
            "domain": {
              "name": "1inch Aggregation Router",
              "version": "6",
              "chainId": %d,
              "verifyingContract": "0x111111125421ca6dc452d289314280a0f8842a65"
            },
            "message": {
              "salt": "1",
              "maker": "%s",
              "receiver": "%s",
              "makerAsset": "%s",
              "takerAsset": "%s",
              "makingAmount": "1000000000000000000",
              "takingAmount": "2500000000",
              "makerTraits": "%s"
            }
          },
          "createdAt": "%s"
        }
        """.formatted(
        ONEINCH_FALLBACK_CHAIN,
        maker,
        WALLET,
        WETH,
        USDT,
        makerTraits,
        ONEINCH_FALLBACK_CHAIN,
        maker,
        WALLET,
        WETH,
        USDT,
        makerTraits,
        expiresAt);
  }

  private LimitOrderResponse response(String status) {
    return response(status, "hash");
  }

  private LimitOrderResponse response(String status, String signedPayloadHash) {
    Instant now = Instant.now();
    return new LimitOrderResponse(
        UUID.randomUUID(),
        WALLET,
        ONEINCH_FALLBACK_CHAIN,
        WETH,
        "WETH",
        18,
        USDT,
        "USDT",
        6,
        "1000000000000000000",
        "2500000000",
        new BigDecimal("2500"),
        now.plusSeconds(3600),
        WALLET,
        "1inch_orderbook",
        "supported",
        status,
        signedPayloadHash,
        "0x" + "a".repeat(64),
        null,
        now,
        null,
        "submitted".equals(status) ? now : null,
        null,
        now,
        now);
  }

  private String payloadHash(String payload) {
    try {
      return LimitOrderPayloadIntegrity.sha256(objectMapper.readTree(payload), objectMapper);
    } catch (Exception exception) {
      throw new IllegalStateException(exception);
    }
  }
}
