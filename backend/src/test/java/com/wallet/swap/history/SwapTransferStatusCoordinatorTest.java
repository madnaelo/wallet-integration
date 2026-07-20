package com.wallet.swap.history;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.wallet.swap.config.LifiProperties;
import com.wallet.swap.history.LifiTransferStatusClient.StatusResult;
import com.wallet.swap.history.SwapHistoryRepository.TransferStatusCandidate;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SwapTransferStatusCoordinatorTest {
  private final SwapHistoryRepository repository = mock(SwapHistoryRepository.class);
  private final LifiTransferStatusClient statusClient = mock(LifiTransferStatusClient.class);
  private final LifiProperties properties = new LifiProperties();
  private final SwapTransferStatusCoordinator coordinator = new SwapTransferStatusCoordinator(
      repository,
      statusClient,
      properties);

  @Test
  void sweepsExpiredTrackingAtMostOncePerHourPerWorker() {
    coordinator.reconcileDue();
    coordinator.reconcileDue();

    verify(repository, times(1)).stopExpiredTracking(Duration.ofHours(168));
  }

  @Test
  void keepsReconcilingWhenExpiryCleanupTemporarilyFails() {
    doThrow(new IllegalStateException("database unavailable"))
        .when(repository).stopExpiredTracking(Duration.ofHours(168));

    assertDoesNotThrow(coordinator::reconcileDue);

    verify(repository).claimDueStatusChecks(eq(1), any(Duration.class));
  }

  @Test
  void completesConfirmedTransfersWithoutAnotherPoll() {
    TransferStatusCandidate candidate = candidate(2);
    when(statusClient.check(candidate)).thenReturn(StatusResult.checked(
        "confirmed",
        "DONE",
        "COMPLETED",
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));

    coordinator.reconcile(candidate);

    verify(repository).completeStatusCheck(
        eq(candidate),
        eq("confirmed"),
        eq("DONE"),
        eq("COMPLETED"),
        eq("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
        isNull(),
        isNull());
  }

  @Test
  void retriesTemporaryProviderFailuresWithoutChangingSwapStatus() {
    TransferStatusCandidate candidate = candidate(3);
    when(statusClient.check(candidate)).thenReturn(StatusResult.failure("temporarily unavailable"));

    coordinator.reconcile(candidate);

    verify(repository).completeStatusCheck(
        eq(candidate),
        eq("submitted"),
        isNull(),
        isNull(),
        isNull(),
        eq("temporarily unavailable"),
        any(Instant.class));
  }

  private TransferStatusCandidate candidate(int attempts) {
    return new TransferStatusCandidate(
        UUID.randomUUID(),
        1,
        8453,
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "across",
        attempts,
        UUID.randomUUID());
  }
}
