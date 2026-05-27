package com.wallet.swap.ops;

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

  public void recordMonitorCompleted(int reverseCandidates, int favoriteCandidates, int opportunities) {
    reverseCandidatesChecked.addAndGet(Math.max(0, reverseCandidates));
    favoriteCandidatesChecked.addAndGet(Math.max(0, favoriteCandidates));
    opportunitiesFound.addAndGet(Math.max(0, opportunities));
    lastMonitorCompletedAt.set(Instant.now());
    lastMonitorError.set("");
  }

  public void recordMonitorFailure(Exception exception) {
    monitorFailures.incrementAndGet();
    lastMonitorCompletedAt.set(Instant.now());
    lastMonitorError.set(sanitizeError(exception));
  }

  public void recordDelivery(boolean sent, Exception exception) {
    if (sent) {
      notificationDeliveriesSucceeded.incrementAndGet();
      return;
    }
    notificationDeliveriesFailed.incrementAndGet();
    lastDeliveryError.set(sanitizeError(exception));
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
        opportunitiesFound.get(),
        notificationDeliveriesSucceeded.get(),
        notificationDeliveriesFailed.get(),
        lastMonitorStartedAt.get(),
        lastMonitorCompletedAt.get(),
        lastMonitorError.get(),
        lastDeliveryError.get());
  }

  private String sanitizeError(Exception exception) {
    if (exception == null) return "";
    String message = exception.getMessage();
    if (message == null || message.isBlank()) return exception.getClass().getSimpleName();
    return message.length() <= 500 ? message : message.substring(0, 500);
  }

  public record OpsSnapshot(
      Instant startedAt,
      long uptimeSeconds,
      long monitorRuns,
      long monitorFailures,
      long reverseCandidatesChecked,
      long favoriteCandidatesChecked,
      long opportunitiesFound,
      long notificationDeliveriesSucceeded,
      long notificationDeliveriesFailed,
      Instant lastMonitorStartedAt,
      Instant lastMonitorCompletedAt,
      String lastMonitorError,
      String lastDeliveryError) {}
}
