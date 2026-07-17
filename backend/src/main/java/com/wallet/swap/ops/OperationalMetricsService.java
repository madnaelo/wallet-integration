package com.wallet.swap.ops;

import com.wallet.swap.common.SafeErrorDetails;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Service;

@Service
public class OperationalMetricsService {
  private final Instant startedAt = Instant.now();
  private final AtomicLong monitorRuns = new AtomicLong();
  private final AtomicLong monitorFailures = new AtomicLong();
  private final AtomicLong reverseCandidatesChecked = new AtomicLong();
  private final AtomicLong favoriteCandidatesChecked = new AtomicLong();
  private final AtomicLong autoSwapCandidatesChecked = new AtomicLong();
  private final AtomicLong opportunitiesFound = new AtomicLong();
  private final AtomicLong notificationDeliveriesSucceeded = new AtomicLong();
  private final AtomicLong notificationDeliveriesFailed = new AtomicLong();
  private final AtomicReference<Instant> lastMonitorStartedAt = new AtomicReference<>();
  private final AtomicReference<Instant> lastMonitorCompletedAt = new AtomicReference<>();
  private final AtomicReference<String> lastMonitorError = new AtomicReference<>("");
  private final AtomicReference<String> lastDeliveryError = new AtomicReference<>("");

  public void recordMonitorStarted() {
    monitorRuns.incrementAndGet();
    lastMonitorStartedAt.set(Instant.now());
  }

  public void recordMonitorCompleted(
      int reverseCandidates,
      int favoriteCandidates,
      int autoSwapCandidates,
      int opportunities) {
    reverseCandidatesChecked.addAndGet(Math.max(0, reverseCandidates));
    favoriteCandidatesChecked.addAndGet(Math.max(0, favoriteCandidates));
    autoSwapCandidatesChecked.addAndGet(Math.max(0, autoSwapCandidates));
    opportunitiesFound.addAndGet(Math.max(0, opportunities));
    lastMonitorCompletedAt.set(Instant.now());
    lastMonitorError.set("");
  }

  public void recordMonitorFailure(Exception exception) {
    monitorFailures.incrementAndGet();
    lastMonitorCompletedAt.set(Instant.now());
    lastMonitorError.set(SafeErrorDetails.summarize(exception));
  }

  public void recordDelivery(boolean sent, Exception exception) {
    if (sent) {
      notificationDeliveriesSucceeded.incrementAndGet();
      return;
    }
    notificationDeliveriesFailed.incrementAndGet();
    lastDeliveryError.set(SafeErrorDetails.summarize(exception));
  }

  public OpsSnapshot snapshot() {
    Instant now = Instant.now();
    return new OpsSnapshot(
        startedAt,
        Duration.between(startedAt, now).toSeconds(),
        monitorRuns.get(),
        monitorFailures.get(),
        reverseCandidatesChecked.get(),
        favoriteCandidatesChecked.get(),
        autoSwapCandidatesChecked.get(),
        opportunitiesFound.get(),
        notificationDeliveriesSucceeded.get(),
        notificationDeliveriesFailed.get(),
        lastMonitorStartedAt.get(),
        lastMonitorCompletedAt.get(),
        lastMonitorError.get(),
        lastDeliveryError.get());
  }

  public record OpsSnapshot(
      Instant startedAt,
      long uptimeSeconds,
      long monitorRuns,
      long monitorFailures,
      long reverseCandidatesChecked,
      long favoriteCandidatesChecked,
      long autoSwapCandidatesChecked,
      long opportunitiesFound,
      long notificationDeliveriesSucceeded,
      long notificationDeliveriesFailed,
      Instant lastMonitorStartedAt,
      Instant lastMonitorCompletedAt,
      String lastMonitorError,
      String lastDeliveryError) {}
}
