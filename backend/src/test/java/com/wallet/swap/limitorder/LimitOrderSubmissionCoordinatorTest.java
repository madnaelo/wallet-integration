package com.wallet.swap.limitorder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.config.LimitOrderProperties;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderResponse;
import com.wallet.swap.limitorder.LimitOrderRepository.SubmissionCandidate;
import com.wallet.swap.limitorder.LimitOrderSubmissionClient.LimitOrderSubmissionResult;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class LimitOrderSubmissionCoordinatorTest {
  private static final String WALLET = "0x0000000000000000000000000000000000000001";

  private final ObjectMapper objectMapper = new ObjectMapper();
  private final LimitOrderRepository repository = mock(LimitOrderRepository.class);
  private final LimitOrderSubmissionClient client = mock(LimitOrderSubmissionClient.class);
  private final LimitOrderSignatureVerifier signatureVerifier = mock(LimitOrderSignatureVerifier.class);
  private final LimitOrderProperties properties = new LimitOrderProperties();
  private final LimitOrderSubmissionCoordinator coordinator = new LimitOrderSubmissionCoordinator(
      repository,
      client,
      properties,
      objectMapper,
      signatureVerifier);

  @Test
  void marksConfirmedProviderSubmissionAndClearsRetry() {
    SubmissionCandidate candidate = candidate(1);
    LimitOrderResponse submitted = response("submitted");
    when(client.submit(eq(1L), eq("cow_protocol"), eq(candidate.orderHash()), eq(candidate.signature()), any()))
        .thenReturn(LimitOrderSubmissionResult.success("provider-order"));
    when(repository.completeSubmission(
        eq(candidate),
        eq("submitted"),
        isNull(),
        eq("provider-order"),
        isNull(),
        eq(candidate.signedPayloadHash()),
        eq(LimitOrderPayloadIntegrity.CURRENT_VERSION)))
        .thenReturn(Optional.of(submitted));

    LimitOrderResponse result = coordinator.submitClaimed(candidate);

    assertThat(result.executionStatus()).isEqualTo("submitted");
  }

  @Test
  void schedulesRetryForTransientProviderFailure() {
    SubmissionCandidate candidate = candidate(1);
    LimitOrderResponse failed = response("failed");
    when(client.submit(eq(1L), eq("cow_protocol"), eq(candidate.orderHash()), eq(candidate.signature()), any()))
        .thenReturn(LimitOrderSubmissionResult.failure("Temporarily unavailable.", true));
    when(repository.completeSubmission(
        eq(candidate),
        eq("failed"),
        eq("Temporarily unavailable."),
        isNull(),
        any(Instant.class),
        eq(candidate.signedPayloadHash()),
        eq(LimitOrderPayloadIntegrity.CURRENT_VERSION)))
        .thenReturn(Optional.of(failed));

    coordinator.submitClaimed(candidate);

    verify(repository).completeSubmission(
        eq(candidate),
        eq("failed"),
        eq("Temporarily unavailable."),
        isNull(),
        any(Instant.class),
        eq(candidate.signedPayloadHash()),
        eq(LimitOrderPayloadIntegrity.CURRENT_VERSION));
  }

  @Test
  void reservesAnUnconfirmedOrderAfterItsFinalRetry() {
    SubmissionCandidate candidate = candidate(properties.getSubmissionMaxAttempts());
    LimitOrderResponse failed = response("failed");
    when(client.submit(eq(1L), eq("cow_protocol"), eq(candidate.orderHash()), eq(candidate.signature()), any()))
        .thenReturn(LimitOrderSubmissionResult.failure("Temporarily unavailable.", true));
    when(repository.completeSubmission(
        eq(candidate),
        eq("failed"),
        eq("The order service could not confirm this order. For safety, its token approval remains reserved until expiry."),
        isNull(),
        isNull(),
        eq(candidate.signedPayloadHash()),
        eq(LimitOrderPayloadIntegrity.CURRENT_VERSION)))
        .thenReturn(Optional.of(failed));

    coordinator.submitClaimed(candidate);

    verify(repository).completeSubmission(
        eq(candidate),
        eq("failed"),
        eq("The order service could not confirm this order. For safety, its token approval remains reserved until expiry."),
        isNull(),
        isNull(),
        eq(candidate.signedPayloadHash()),
        eq(LimitOrderPayloadIntegrity.CURRENT_VERSION));
  }

  @Test
  void doesNotRetryPermanentProviderFailure() {
    SubmissionCandidate candidate = candidate(1);
    LimitOrderResponse rejected = response("rejected");
    when(client.submit(eq(1L), eq("cow_protocol"), eq(candidate.orderHash()), eq(candidate.signature()), any()))
        .thenReturn(LimitOrderSubmissionResult.failure("Terms rejected.", false));
    when(repository.completeSubmission(
        eq(candidate),
        eq("rejected"),
        eq("Terms rejected."),
        isNull(),
        isNull(),
        eq(candidate.signedPayloadHash()),
        eq(LimitOrderPayloadIntegrity.CURRENT_VERSION)))
        .thenReturn(Optional.of(rejected));

    coordinator.submitClaimed(candidate);

    verify(repository).completeSubmission(
        eq(candidate),
        eq("rejected"),
        eq("Terms rejected."),
        isNull(),
        isNull(),
        eq(candidate.signedPayloadHash()),
        eq(LimitOrderPayloadIntegrity.CURRENT_VERSION));
  }

  @Test
  void refusesPayloadChangedAfterItWasSaved() {
    SubmissionCandidate original = candidate(1);
    SubmissionCandidate tampered = new SubmissionCandidate(
        original.id(),
        original.walletAddress(),
        original.chainId(),
        original.executionProvider(),
        original.orderHash(),
        original.signature(),
        "0".repeat(64),
        LimitOrderPayloadIntegrity.CURRENT_VERSION,
        original.signedPayloadJson(),
        original.expiresAt(),
        original.attempts(),
        original.lockToken());
    LimitOrderResponse rejected = response("rejected");
    when(repository.completeSubmission(
        eq(tampered),
        eq("rejected"),
        eq("The saved signed order failed its integrity check and cannot be submitted."),
        isNull(),
        isNull(),
        eq(tampered.signedPayloadHash()),
        eq(LimitOrderPayloadIntegrity.CURRENT_VERSION)))
        .thenReturn(Optional.of(rejected));

    coordinator.submitClaimed(tampered);

    verify(client, never()).submit(anyLong(), any(), any(), any(), any());
  }

  @Test
  void expiresOldOrdersWithoutCallingProvidersWhileSubmissionIsPaused() {
    properties.setOrderbookSubmissionEnabled(false);

    coordinator.submitDue();

    verify(repository).markExpiredPending();
    verify(repository, never()).claimDue(anyInt(), anyInt(), any());
  }

  @Test
  void leasesEachBatchItemImmediatelyBeforeSubmission() {
    properties.setSubmissionBatchSize(2);
    SubmissionCandidate first = candidate(1);
    SubmissionCandidate second = candidate(1);
    when(repository.claimDue(eq(1), anyInt(), any()))
        .thenReturn(List.of(first), List.of(second));
    when(client.submit(anyLong(), any(), any(), any(), any()))
        .thenReturn(LimitOrderSubmissionResult.success("provider-order"));
    when(repository.completeSubmission(
        any(SubmissionCandidate.class),
        any(String.class),
        nullable(String.class),
        nullable(String.class),
        nullable(Instant.class),
        any(String.class),
        anyInt()))
        .thenReturn(Optional.of(response("submitted")));

    coordinator.submitDue();

    verify(repository, times(2)).claimDue(eq(1), anyInt(), any());
    verify(client, times(2)).submit(anyLong(), any(), any(), any(), any());
  }

  private SubmissionCandidate candidate(int attempts) {
    try {
      String payload = """
          {
            "version": "cow-protocol-order-v1",
            "provider": "cow_protocol",
            "chainId": 1,
            "data": {
              "from": "%s",
              "validTo": 2000000000
            },
            "typedData": {}
          }
          """.formatted(WALLET);
      String payloadHash = LimitOrderPayloadIntegrity.sha256(objectMapper.readTree(payload), objectMapper);
      return new SubmissionCandidate(
          UUID.randomUUID(),
          WALLET,
          1L,
          "cow_protocol",
          "0x" + "a".repeat(64),
          "0x" + "1".repeat(130),
          payloadHash,
          LimitOrderPayloadIntegrity.CURRENT_VERSION,
          payload,
          Instant.now().plusSeconds(3600),
          attempts,
          UUID.randomUUID());
    } catch (Exception exception) {
      throw new IllegalStateException(exception);
    }
  }

  private LimitOrderResponse response(String status) {
    Instant now = Instant.now();
    return new LimitOrderResponse(
        UUID.randomUUID(),
        WALLET,
        1L,
        "0x0000000000000000000000000000000000000002",
        "SELL",
        18,
        "0x0000000000000000000000000000000000000003",
        "BUY",
        6,
        "1000",
        "2000",
        new BigDecimal("2"),
        now.plusSeconds(3600),
        WALLET,
        "cow_protocol",
        "supported",
        status,
        "hash",
        "0x" + "a".repeat(64),
        null,
        null,
        null,
        now,
        LimitOrderTerms.CURRENT_VERSION,
        null,
        "submitted".equals(status) ? now : null,
        null,
        now,
        now);
  }
}
