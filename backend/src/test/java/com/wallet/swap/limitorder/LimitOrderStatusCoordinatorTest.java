package com.wallet.swap.limitorder;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.wallet.swap.config.LimitOrderProperties;
import com.wallet.swap.limitorder.LimitOrderRepository.StatusCheckCandidate;
import com.wallet.swap.limitorder.LimitOrderStatusClient.StatusResult;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class LimitOrderStatusCoordinatorTest {
  private final LimitOrderRepository repository = mock(LimitOrderRepository.class);
  private final LimitOrderStatusClient statusClient = mock(LimitOrderStatusClient.class);
  private final LimitOrderProperties properties = new LimitOrderProperties();
  private final LimitOrderStatusCoordinator coordinator =
      new LimitOrderStatusCoordinator(repository, statusClient, properties);

  @Test
  void terminalProviderStateStopsFutureChecks() {
    StatusCheckCandidate candidate = candidate("open", 1);
    String transactionHash = "0x" + "12".repeat(32);
    when(statusClient.check(candidate)).thenReturn(StatusResult.success("filled", transactionHash, null));

    coordinator.reconcile(candidate);

    verify(repository).completeStatusCheck(
        candidate, "filled", null, transactionHash, null, true);
  }

  @Test
  void transientFailurePreservesPartialFillStateAndSchedulesBackoff() {
    StatusCheckCandidate candidate = candidate("partially_filled", 3);
    when(statusClient.check(candidate)).thenReturn(StatusResult.failure("Temporarily unavailable."));

    coordinator.reconcile(candidate);

    verify(repository).completeStatusCheck(
        eq(candidate),
        eq("partially_filled"),
        eq("Temporarily unavailable."),
        eq(null),
        any(Instant.class),
        eq(false));
  }

  @Test
  void leasesEachBatchItemImmediatelyBeforeStatusCheck() {
    properties.setStatusCheckBatchSize(2);
    StatusCheckCandidate first = candidate("open", 1);
    StatusCheckCandidate second = candidate("open", 1);
    when(repository.claimDueStatusChecks(eq(1), any()))
        .thenReturn(List.of(first), List.of(second));
    when(statusClient.check(any())).thenReturn(StatusResult.success("open", null, null));

    coordinator.reconcileDue();

    verify(repository, times(2)).claimDueStatusChecks(eq(1), any());
    verify(statusClient, times(2)).check(any());
  }

  private StatusCheckCandidate candidate(String status, int attempts) {
    return new StatusCheckCandidate(
        UUID.randomUUID(),
        1,
        LimitOrderCapabilityService.ONEINCH_PROVIDER,
        "0x" + "34".repeat(32),
        "0x" + "34".repeat(32),
        status,
        Instant.now().plusSeconds(3_600),
        attempts,
        UUID.randomUUID());
  }
}
