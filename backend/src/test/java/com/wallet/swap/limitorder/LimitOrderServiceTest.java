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
import com.wallet.swap.limitorder.LimitOrderSubmissionClient.LimitOrderSubmissionResult;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class LimitOrderServiceTest {
  private static final String WALLET = "0x0000000000000000000000000000000000000001";
  private static final String WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  private static final String USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

  private final LimitOrderCapabilityService capabilityService = new LimitOrderCapabilityService();
  private final FeatureFlagService featureFlagService = mock(FeatureFlagService.class);
  private final LimitOrderRepository repository = mock(LimitOrderRepository.class);
  private final LimitOrderSubmissionClient submissionClient = mock(LimitOrderSubmissionClient.class);
  private final LimitOrderService service = new LimitOrderService(
      capabilityService,
      featureFlagService,
      repository,
      submissionClient,
      new ObjectMapper());

  @Test
  void checksFeatureFlagBeforeSaving() {
    LimitOrderRequest request = validRequest(validPayload(WALLET));
    LimitOrderResponse stored = response("stored");
    when(repository.insert(eq(WALLET), any(), eq("supported"), eq("stored"), any())).thenReturn(stored);
    when(submissionClient.submit(eq(1L), any(), any(), any())).thenReturn(new LimitOrderSubmissionResult(true, false, ""));
    when(repository.updateSubmissionStatus(eq(stored.id()), eq("submitted"), any())).thenReturn(response("submitted"));

    service.save(WALLET, request);

    verify(featureFlagService).requireLimitOrdersEnabled();
  }

  @Test
  void rejectsTamperedMakerBeforeSubmission() {
    LimitOrderRequest request = validRequest(validPayload("0x0000000000000000000000000000000000000002"));

    assertThatThrownBy(() -> service.save(WALLET, request))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("maker");
  }

  @Test
  void submitsOnlyPayloadThatMatchesRequestTerms() {
    LimitOrderRequest request = validRequest(validPayload(WALLET));
    LimitOrderResponse stored = response("stored");
    when(repository.insert(eq(WALLET), any(), eq("supported"), eq("stored"), any())).thenReturn(stored);
    when(submissionClient.submit(eq(1L), eq(request.orderHash()), eq(request.signature()), any()))
        .thenReturn(new LimitOrderSubmissionResult(true, false, ""));
    when(repository.updateSubmissionStatus(eq(stored.id()), eq("submitted"), any())).thenReturn(response("submitted"));

    service.save(WALLET, request);

    verify(submissionClient).submit(eq(1L), eq(request.orderHash()), eq(request.signature()), any());
  }

  private LimitOrderRequest validRequest(String payload) {
    return new LimitOrderRequest(
        1L,
        WETH,
        "WETH",
        18,
        USDT,
        "USDT",
        6,
        "1000000000000000000",
        "2500000000",
        new BigDecimal("2500"),
        Instant.now().plusSeconds(3600),
        WALLET,
        "1inch_orderbook",
        "0x" + "a".repeat(64),
        "0x" + "1".repeat(130),
        payload,
        true);
  }

  private String validPayload(String maker) {
    return """
        {
          "data": {
            "maker": "%s",
            "makerAsset": "%s",
            "takerAsset": "%s",
            "makingAmount": "1000000000000000000",
            "takingAmount": "2500000000",
            "receiver": "%s",
            "extension": "0x"
          },
          "typedData": {
            "domain": {
              "chainId": 1,
              "verifyingContract": "0x111111125421ca6dc452d289314280a0f8842a65"
            }
          }
        }
        """.formatted(maker, WETH, USDT, WALLET);
  }

  private LimitOrderResponse response(String status) {
    Instant now = Instant.now();
    return new LimitOrderResponse(
        UUID.randomUUID(),
        WALLET,
        1L,
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
        "hash",
        "0x" + "a".repeat(64),
        now,
        null,
        "submitted".equals(status) ? now : null,
        null,
        now,
        now);
  }
}
