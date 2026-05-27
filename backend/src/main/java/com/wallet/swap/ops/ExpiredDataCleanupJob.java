package com.wallet.swap.ops;

import com.wallet.swap.auth.AuthRepository;
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
  private final JobLockService jobLockService;
  private final AtomicBoolean running = new AtomicBoolean(false);

  public ExpiredDataCleanupJob(
      AuthRepository authRepository,
      TelegramLinkCodeRepository telegramLinkCodeRepository,
      JobLockService jobLockService) {
    this.authRepository = authRepository;
    this.telegramLinkCodeRepository = telegramLinkCodeRepository;
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
    int nonces = authRepository.deleteExpiredNonces(now);
    int sessions = authRepository.deleteExpiredSessions(now);
    int telegramCodes = telegramLinkCodeRepository.deleteExpired(now);
    int total = nonces + sessions + telegramCodes;
    if (total > 0) {
      log.info(
          "Cleaned up {} expired rows: {} nonces, {} sessions, {} Telegram link codes.",
          total,
          nonces,
          sessions,
          telegramCodes);
    }
  }
}
