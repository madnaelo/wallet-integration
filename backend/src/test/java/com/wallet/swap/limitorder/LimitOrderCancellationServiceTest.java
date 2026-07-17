package com.wallet.swap.limitorder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.common.ApiException;
import com.wallet.swap.feature.FeatureFlagService;
import com.wallet.swap.limitorder.LimitOrderCancellationClient.CancellationResult;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCancellationRequest;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderResponse;
import com.wallet.swap.limitorder.LimitOrderRepository.CancellationCandidate;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class LimitOrderCancellationServiceTest {
  private static final String WALLET = "0x0000000000000000000000000000000000000001";
  private static final String ORDER_HASH = "0x" + "a".repeat(64);

  private final ObjectMapper objectMapper = new ObjectMapper();
  private final FeatureFlagService featureFlagService = mock(FeatureFlagService.class);
  private final LimitOrderRepository repository = mock(LimitOrderRepository.class);
  private final LimitOrderCancellationClient client = mock(LimitOrderCancellationClient.class);
  private final LimitOrderSignatureVerifier signatureVerifier = mock(LimitOrderSignatureVerifier.class);
  private final LimitOrderCancellationService service = new LimitOrderCancellationService(
      featureFlagService,
      repository,
      client,
      signatureVerifier,
      objectMapper);

  @Test
  void cancelsAnUnsubmittedOrderWithoutWalletAuthorization() {
    CancellationCandidate candidate = cowCandidate("stored", null, null);
    LimitOrderResponse cancelled = response(candidate, "cancelled");
    when(repository.findCancellationCandidate(candidate.id(), WALLET)).thenReturn(Optional.of(candidate));
    when(repository.cancelUnsubmitted(candidate.id(), WALLET)).thenReturn(Optional.of(cancelled));

    LimitOrderResponse result = service.cancel(
        WALLET,
        candidate.id(),
        new LimitOrderCancellationRequest(null, null));

    assertThat(result.executionStatus()).isEqualTo("cancelled");
    verify(client, never()).cancelCow(any(Long.class), any(), any());
  }

  @Test
  void buildsAndSubmitsAnExactCowCancellationSignature() {
    CancellationCandidate candidate = cowCandidate("open", cowUid(), null);
    LimitOrderResponse pending = response(candidate, "cancellation_pending");
    when(repository.findCancellationCandidate(candidate.id(), WALLET)).thenReturn(Optional.of(candidate));
    when(client.cancelCow(candidate.chainId(), candidate.providerOrderId(), "0x" + "2".repeat(130)))
        .thenReturn(CancellationResult.success());
    when(repository.markProviderCancellationRequested(candidate.id(), WALLET, null))
        .thenReturn(Optional.of(pending));

    var plan = service.plan(WALLET, candidate.id());
    LimitOrderResponse result = service.cancel(
        WALLET,
        candidate.id(),
        new LimitOrderCancellationRequest("0x" + "2".repeat(130), null));

    assertThat(plan.mode()).isEqualTo(LimitOrderCancellationService.COW_SIGNATURE_MODE);
    assertThat(plan.typedData().path("primaryType").asText()).isEqualTo("OrderCancellation");
    assertThat(plan.typedData().path("message").path("orderUid").asText()).isEqualTo(cowUid());
    assertThat(result.executionStatus()).isEqualTo("cancellation_pending");
    verify(signatureVerifier).verifyTypedDataSigner(
        eq(WALLET),
        eq("OrderCancellation"),
        eq("0x" + "2".repeat(130)),
        any(JsonNode.class));
  }

  @Test
  void returnsServiceUnavailableWithoutChangingStateWhenCowIsUncertain() {
    CancellationCandidate candidate = cowCandidate("submitted", cowUid(), null);
    when(repository.findCancellationCandidate(candidate.id(), WALLET)).thenReturn(Optional.of(candidate));
    when(client.cancelCow(any(Long.class), any(), any()))
        .thenReturn(CancellationResult.failure("Temporarily unavailable.", true));

    assertThatThrownBy(() -> service.cancel(
        WALLET,
        candidate.id(),
        new LimitOrderCancellationRequest("0x" + "2".repeat(130), null)))
        .isInstanceOfSatisfying(ApiException.class, exception ->
            assertThat(exception.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));

    verify(repository, never()).markProviderCancellationRequested(any(), any(), any());
  }

  @Test
  void rejectsACowUidThatDoesNotBelongToTheSavedOrder() {
    CancellationCandidate candidate = cowCandidate("open", "0x" + "b".repeat(112), null);
    when(repository.findCancellationCandidate(candidate.id(), WALLET)).thenReturn(Optional.of(candidate));

    assertThatThrownBy(() -> service.plan(WALLET, candidate.id()))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("integrity");
  }

  @Test
  void returnsStrictOneInchCancellationMaterialAndRecordsOnlyAConfirmedHash() {
    CancellationCandidate candidate = oneInchCandidate();
    LimitOrderResponse pending = response(candidate, "cancellation_pending");
    String transactionHash = "0x" + "3".repeat(64);
    when(repository.findCancellationCandidate(candidate.id(), WALLET)).thenReturn(Optional.of(candidate));
    when(repository.markProviderCancellationRequested(candidate.id(), WALLET, transactionHash))
        .thenReturn(Optional.of(pending));

    var plan = service.plan(WALLET, candidate.id());
    LimitOrderResponse result = service.cancel(
        WALLET,
        candidate.id(),
        new LimitOrderCancellationRequest(null, transactionHash));

    assertThat(plan.mode()).isEqualTo(LimitOrderCancellationService.ONEINCH_TRANSACTION_MODE);
    assertThat(plan.contractAddress()).isEqualTo(LimitOrderProviderSupport.ONEINCH_LIMIT_ORDER_CONTRACT);
    assertThat(plan.makerTraits()).isNotBlank();
    assertThat(result.executionStatus()).isEqualTo("cancellation_pending");
  }

  @Test
  void treatsAnAlreadyRequestedCancellationIdempotently() {
    CancellationCandidate candidate = cowCandidate("open", cowUid(), Instant.now());
    LimitOrderResponse pending = response(candidate, "cancellation_pending");
    when(repository.findCancellationCandidate(candidate.id(), WALLET)).thenReturn(Optional.of(candidate));
    when(repository.findByIdForWallet(candidate.id(), WALLET)).thenReturn(Optional.of(pending));

    LimitOrderResponse result = service.cancel(
        WALLET,
        candidate.id(),
        new LimitOrderCancellationRequest(null, null));

    assertThat(result.executionStatus()).isEqualTo("cancellation_pending");
    verify(client, never()).cancelCow(any(Long.class), any(), any());
  }

  @Test
  void doesNotRevealOrdersOwnedByAnotherWallet() {
    UUID id = UUID.randomUUID();
    when(repository.findCancellationCandidate(id, WALLET)).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.plan(WALLET, id))
        .isInstanceOfSatisfying(ApiException.class, exception ->
            assertThat(exception.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
  }

  @Test
  void reportsAConflictWhenSubmissionWinsTheLocalCancellationRace() {
    CancellationCandidate stored = cowCandidate("stored", null, null);
    CancellationCandidate submitting = new CancellationCandidate(
        stored.id(),
        stored.walletAddress(),
        stored.chainId(),
        stored.executionProvider(),
        "pending_submission",
        stored.orderHash(),
        stored.providerOrderId(),
        stored.signature(),
        stored.signedPayloadHash(),
        stored.signedPayloadHashVersion(),
        stored.signedPayloadJson(),
        stored.expiresAt(),
        null);
    when(repository.findCancellationCandidate(stored.id(), WALLET))
        .thenReturn(Optional.of(stored))
        .thenReturn(Optional.of(submitting));
    when(repository.cancelUnsubmitted(stored.id(), WALLET)).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.cancel(
        WALLET,
        stored.id(),
        new LimitOrderCancellationRequest(null, null)))
        .isInstanceOfSatisfying(ApiException.class, exception ->
            assertThat(exception.getStatus()).isEqualTo(HttpStatus.CONFLICT));
  }

  private CancellationCandidate cowCandidate(
      String status,
      String providerOrderId,
      Instant cancellationRequestedAt) {
    Instant expiresAt = expiry();
    String payload = """
        {
          "version": "cow-protocol-order-v1",
          "provider": "cow_protocol",
          "chainId": 1,
          "data": {"from": "%s", "validTo": %d},
          "typedData": {"primaryType": "Order", "domain": {}, "types": {}, "message": {}}
        }
        """.formatted(WALLET, expiresAt.getEpochSecond());
    return candidate(
        1L,
        "cow_protocol",
        status,
        providerOrderId,
        payload,
        expiresAt,
        cancellationRequestedAt);
  }

  private CancellationCandidate oneInchCandidate() {
    Instant expiresAt = expiry();
    String makerTraits = BigInteger.ONE.shiftLeft(255)
        .or(BigInteger.valueOf(expiresAt.getEpochSecond()).shiftLeft(80))
        .toString();
    String payload = """
        {
          "version": "1inch-limit-order-v4",
          "provider": "1inch_orderbook",
          "chainId": 10,
          "data": {"maker": "%s", "makerTraits": "%s"},
          "typedData": {
            "primaryType": "Order",
            "domain": {},
            "types": {},
            "message": {"maker": "%s", "makerTraits": "%s"}
          }
        }
        """.formatted(WALLET, makerTraits, WALLET, makerTraits);
    return candidate(
        10L,
        "1inch_orderbook",
        "open",
        ORDER_HASH,
        payload,
        expiresAt,
        null);
  }

  private CancellationCandidate candidate(
      long chainId,
      String provider,
      String status,
      String providerOrderId,
      String payload,
      Instant expiresAt,
      Instant cancellationRequestedAt) {
    try {
      String hash = LimitOrderPayloadIntegrity.sha256(objectMapper.readTree(payload), objectMapper);
      return new CancellationCandidate(
          UUID.randomUUID(),
          WALLET,
          chainId,
          provider,
          status,
          ORDER_HASH,
          providerOrderId,
          "0x" + "1".repeat(130),
          hash,
          LimitOrderPayloadIntegrity.CURRENT_VERSION,
          payload,
          expiresAt,
          cancellationRequestedAt);
    } catch (Exception exception) {
      throw new IllegalStateException(exception);
    }
  }

  private LimitOrderResponse response(CancellationCandidate candidate, String status) {
    Instant now = Instant.now();
    return new LimitOrderResponse(
        candidate.id(),
        WALLET,
        candidate.chainId(),
        "0x0000000000000000000000000000000000000002",
        "SELL",
        18,
        "0x0000000000000000000000000000000000000003",
        "BUY",
        6,
        "1000",
        "2000",
        new BigDecimal("2"),
        candidate.expiresAt(),
        WALLET,
        candidate.executionProvider(),
        "supported",
        status,
        candidate.signedPayloadHash(),
        candidate.orderHash(),
        candidate.providerOrderId(),
        null,
        now,
        now,
        LimitOrderTerms.CURRENT_VERSION,
        null,
        now,
        null,
        now,
        now);
  }

  private Instant expiry() {
    return Instant.ofEpochSecond(2_000_000_000L);
  }

  private String cowUid() {
    return (ORDER_HASH + WALLET.substring(2) + String.format("%08x", expiry().getEpochSecond())).toLowerCase();
  }
}
