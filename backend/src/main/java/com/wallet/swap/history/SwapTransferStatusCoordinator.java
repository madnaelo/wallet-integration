package com.wallet.swap.history;

import com.wallet.swap.config.LifiProperties;
import com.wallet.swap.history.LifiTransferStatusClient.StatusResult;
import com.wallet.swap.history.SwapHistoryRepository.TransferStatusCandidate;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class SwapTransferStatusCoordinator {
  private static final Logger log = LoggerFactory.getLogger(SwapTransferStatusCoordinator.class);
  private static final long EXPIRY_SWEEP_INTERVAL_MS = Duration.ofHours(1).toMillis();

  private final SwapHistoryRepository repository;
  private final LifiTransferStatusClient statusClient;
  private final LifiProperties properties;
  private final AtomicLong nextExpirySweepAtMs = new AtomicLong(0);

  public SwapTransferStatusCoordinator(
      SwapHistoryRepository repository,
      LifiTransferStatusClient statusClient,
      LifiProperties properties) {
    this.repository = repository;
    this.statusClient = statusClient;
    this.properties = properties;
  }

  public void reconcileDue() {
    if (!properties.isTrackingEnabled()) return;
    stopExpiredTrackingIfDue();
    long minimumLockSeconds = Math.max(15L, properties.getRequestTimeoutSeconds() * 3L + 5L);
    Duration lockTtl = Duration.ofSeconds(Math.max(minimumLockSeconds, properties.getStatusCheckLockTtlSeconds()));
    int batchSize = Math.max(1, properties.getStatusCheckBatchSize());
    for (int processed = 0; processed < batchSize; processed++) {
      var candidates = repository.claimDueStatusChecks(1, lockTtl);
      if (candidates.isEmpty()) return;
      reconcile(candidates.get(0));
    }
  }

  private void stopExpiredTrackingIfDue() {
    long now = System.currentTimeMillis();
    long dueAt = nextExpirySweepAtMs.get();
    if (now < dueAt || !nextExpirySweepAtMs.compareAndSet(dueAt, now + EXPIRY_SWEEP_INTERVAL_MS)) return;
    try {
      repository.stopExpiredTracking(Duration.ofHours(Math.max(1, properties.getMaximumTrackingHours())));
    } catch (RuntimeException exception) {
      nextExpirySweepAtMs.set(0);
      log.warn("Expired swap delivery tracking cleanup failed; reconciliation will continue.", exception);
    }
  }

  void reconcile(TransferStatusCandidate candidate) {
    StatusResult result;
    try {
      result = statusClient.check(candidate);
    } catch (RuntimeException exception) {
      log.warn("Swap delivery reconciliation failed for {}.", candidate.id(), exception);
      result = StatusResult.failure("Swap delivery status is temporarily unavailable.");
    }

    String status = result.checked() ? result.status() : "submitted";
    Instant nextCheckAt = isTerminal(status)
        ? null
        : Instant.now().plus(result.checked()
            ? providerPollingInterval(candidate.attempts())
            : failureBackoff(candidate.attempts()));
    boolean updated = repository.completeStatusCheck(
        candidate,
        status,
        result.providerStatus(),
        result.providerSubstatus(),
        result.destinationTransactionHash(),
        result.error(),
        nextCheckAt);
    if (!updated) log.debug("Swap delivery status lease was lost for {}.", candidate.id());
  }

  private Duration providerPollingInterval(int attempts) {
    if (attempts <= 6) return Duration.ofSeconds(10);
    if (attempts <= 12) return Duration.ofSeconds(30);
    return Duration.ofSeconds(60);
  }

  private Duration failureBackoff(int attempts) {
    int exponent = Math.min(6, Math.max(0, attempts - 1));
    long seconds = 30L * (1L << exponent);
    return Duration.ofSeconds(Math.min(Math.max(60, properties.getStatusCheckMaxBackoffSeconds()), seconds));
  }

  private boolean isTerminal(String status) {
    return "confirmed".equals(status) || "failed".equals(status) || "refunded".equals(status);
  }
}
