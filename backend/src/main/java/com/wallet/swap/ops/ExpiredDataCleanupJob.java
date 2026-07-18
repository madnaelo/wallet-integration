package com.wallet.swap.ops;

import com.wallet.swap.auth.AuthRepository;
import com.wallet.swap.config.DatabaseApiRateLimiter;
import com.wallet.swap.config.MaintenanceProperties;
import com.wallet.swap.notification.TelegramLinkCodeRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ExpiredDataCleanupJob {
  private static final Logger log = LoggerFactory.getLogger(ExpiredDataCleanupJob.class);

  private final AuthRepository authRepository;
  private final TelegramLinkCodeRepository telegramLinkCodeRepository;
  private final DatabaseApiRateLimiter apiRateLimiter;
  private final ExpiredDataRepository expiredDataRepository;
  private final MaintenanceProperties maintenanceProperties;
  private final JobLockService jobLockService;
  private final AtomicBoolean running = new AtomicBoolean(false);

  public ExpiredDataCleanupJob(
      AuthRepository authRepository,
      TelegramLinkCodeRepository telegramLinkCodeRepository,
      DatabaseApiRateLimiter apiRateLimiter,
      ExpiredDataRepository expiredDataRepository,
      MaintenanceProperties maintenanceProperties,
      JobLockService jobLockService) {
    this.authRepository = authRepository;
    this.telegramLinkCodeRepository = telegramLinkCodeRepository;
    this.apiRateLimiter = apiRateLimiter;
    this.expiredDataRepository = expiredDataRepository;
    this.maintenanceProperties = maintenanceProperties;
    this.jobLockService = jobLockService;
  }

  @Scheduled(fixedDelayString = "${wallet.maintenance.cleanup-fixed-delay-ms:3600000}")
  public void cleanupExpiredRows() {
    if (!running.compareAndSet(false, true)) return;
    try {
      jobLockService.runIfAcquired("expired-data-cleanup", Duration.ofMinutes(30), this::deleteExpiredRows);
    } finally {
      running.set(false);
    }
  }

  private void deleteExpiredRows() {
    Instant now = Instant.now();
    int nonces = deleteInBatches(limit -> authRepository.deleteExpiredNonces(now, limit));
    int sessions = deleteInBatches(limit -> authRepository.deleteExpiredSessions(now, limit));
    int telegramCodes = deleteInBatches(limit -> telegramLinkCodeRepository.deleteExpired(now, limit));
    int rateLimitBuckets = deleteInBatches(limit -> apiRateLimiter.deleteExpiredBuckets(now, limit));
    int dryRunHistory = deleteOlderThan(maintenanceProperties.getDryRunHistoryRetentionDays(), now,
        expiredDataRepository::deleteOldDryRunSwapHistory);
    int reverseAlerts = deleteOlderThan(maintenanceProperties.getAlertRetentionDays(), now,
        expiredDataRepository::deleteOldReverseProfitAlerts);
    int favoriteAlerts = deleteOlderThan(maintenanceProperties.getAlertRetentionDays(), now,
        expiredDataRepository::deleteOldFavoritePairAlerts);
    int autoSwapAlerts = deleteOlderThan(maintenanceProperties.getAlertRetentionDays(), now,
        expiredDataRepository::deleteOldAutoSwapAlerts);
    int outboxRows = deleteOlderThan(maintenanceProperties.getNotificationOutboxRetentionDays(), now,
        expiredDataRepository::deleteOldNotificationOutbox);
    int total = nonces + sessions + telegramCodes + rateLimitBuckets + dryRunHistory
        + reverseAlerts + favoriteAlerts + autoSwapAlerts + outboxRows;
    if (total > 0) {
      log.info(
          "Cleaned up {} expired rows: {} nonces, {} sessions, {} Telegram link codes, {} rate-limit buckets, "
              + "{} dry-run swaps, {} reverse alerts, {} favorite alerts, {} price-alert deliveries, {} outbox rows.",
          total,
          nonces,
          sessions,
          telegramCodes,
          rateLimitBuckets,
          dryRunHistory,
          reverseAlerts,
          favoriteAlerts,
          autoSwapAlerts,
          outboxRows);
    }
  }

  private int deleteOlderThan(int retentionDays, Instant now, ExpiredRowDeleter deleter) {
    if (retentionDays <= 0) return 0;
    Instant cutoff = now.minus(Duration.ofDays(retentionDays));
    return deleteInBatches(limit -> deleter.delete(cutoff, limit));
  }

  private int deleteInBatches(BatchDeleter deleter) {
    int batchSize = maintenanceProperties.getDeleteBatchSize();
    int maxBatches = maintenanceProperties.getMaxDeleteBatchesPerRun();
    int total = 0;
    for (int batch = 0; batch < maxBatches; batch++) {
      int deleted = deleter.delete(batchSize);
      total += deleted;
      if (deleted < batchSize) break;
    }
    return total;
  }

  @FunctionalInterface
  private interface ExpiredRowDeleter {
    int delete(Instant cutoff, int limit);
  }

  @FunctionalInterface
  private interface BatchDeleter {
    int delete(int limit);
  }
}
