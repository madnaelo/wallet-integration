package com.wallet.swap.limitorder;

import com.wallet.swap.config.LimitOrderProperties;
import com.wallet.swap.limitorder.LimitOrderRepository.StatusCheckCandidate;
import com.wallet.swap.limitorder.LimitOrderStatusClient.StatusResult;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class LimitOrderStatusCoordinator {
  private static final Logger log = LoggerFactory.getLogger(LimitOrderStatusCoordinator.class);

  private final LimitOrderRepository repository;
  private final LimitOrderStatusClient statusClient;
  private final LimitOrderProperties properties;

  public LimitOrderStatusCoordinator(
      LimitOrderRepository repository,
      LimitOrderStatusClient statusClient,
      LimitOrderProperties properties) {
    this.repository = repository;
    this.statusClient = statusClient;
    this.properties = properties;
  }

  public void reconcileDue() {
    repository.markExpiredPending();
    Duration lockTtl = Duration.ofSeconds(Math.max(10, properties.getStatusCheckLockTtlSeconds()));
    for (StatusCheckCandidate candidate : repository.claimDueStatusChecks(
        Math.max(1, properties.getStatusCheckBatchSize()), lockTtl)) {
      reconcile(candidate);
    }
  }

  void reconcile(StatusCheckCandidate candidate) {
    StatusResult result;
    try {
      result = statusClient.check(candidate);
    } catch (RuntimeException exception) {
      log.warn("Limit order status reconciliation failed for {}.", candidate.id(), exception);
      result = StatusResult.failure("Order status is temporarily unavailable.");
    }

    Instant nextCheckAt;
    String nextStatus;
    String error;
    boolean resetAttempts;
    if (result.checked()) {
      nextStatus = result.executionStatus();
      error = result.warning();
      resetAttempts = true;
      nextCheckAt = isTerminal(nextStatus) ? null : Instant.now().plus(activeInterval(nextStatus));
    } else {
      nextStatus = candidate.executionStatus();
      error = result.error();
      resetAttempts = false;
      nextCheckAt = Instant.now().plus(failureBackoff(candidate.attempts()));
    }

    boolean updated = repository.completeStatusCheck(
        candidate,
        nextStatus,
        error,
        result.transactionHash(),
        nextCheckAt,
        resetAttempts);
    if (!updated) log.debug("Limit order status lease was lost for {}.", candidate.id());
  }

  private Duration activeInterval(String status) {
    int seconds = "partially_filled".equals(status)
        ? properties.getStatusCheckPartialIntervalSeconds()
        : properties.getStatusCheckOpenIntervalSeconds();
    return Duration.ofSeconds(Math.max(15, seconds));
  }

  private Duration failureBackoff(int attempts) {
    int exponent = Math.min(10, Math.max(0, attempts - 1));
    long seconds = 30L * (1L << exponent);
    return Duration.ofSeconds(Math.min(Math.max(30, properties.getStatusCheckMaxBackoffSeconds()), seconds));
  }

  private boolean isTerminal(String status) {
    return "filled".equals(status)
        || "expired".equals(status)
        || "cancelled".equals(status)
        || "failed".equals(status);
  }
}
