package com.wallet.swap.ops;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.wallet.swap.auth.AuthRepository;
import com.wallet.swap.config.DatabaseApiRateLimiter;
import com.wallet.swap.config.MaintenanceProperties;
import com.wallet.swap.notification.TelegramLinkCodeRepository;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ExpiredDataCleanupJobTest {
  @Mock
  private AuthRepository authRepository;

  @Mock
  private TelegramLinkCodeRepository telegramLinkCodeRepository;

  @Mock
  private DatabaseApiRateLimiter apiRateLimiter;

  @Mock
  private ExpiredDataRepository expiredDataRepository;

  @Mock
  private JobLockService jobLockService;

  @Test
  void deletesExpiredAuthAndTelegramRows() {
    when(authRepository.deleteExpiredNonces(any(Instant.class))).thenReturn(1);
    when(authRepository.deleteExpiredSessions(any(Instant.class))).thenReturn(2);
    when(telegramLinkCodeRepository.deleteExpired(any(Instant.class))).thenReturn(3);
    when(apiRateLimiter.deleteExpiredBuckets(any(Instant.class))).thenReturn(4);
    when(expiredDataRepository.deleteOldDryRunSwapHistory(any(Instant.class))).thenReturn(5);
    when(expiredDataRepository.deleteOldReverseProfitAlerts(any(Instant.class))).thenReturn(6);
    when(expiredDataRepository.deleteOldFavoritePairAlerts(any(Instant.class))).thenReturn(7);
    when(expiredDataRepository.deleteOldAutoSwapAlerts(any(Instant.class))).thenReturn(8);
    when(expiredDataRepository.deleteOldNotificationOutbox(any(Instant.class))).thenReturn(9);
    when(jobLockService.runIfAcquired(eq("expired-data-cleanup"), any(), any())).thenAnswer(invocation -> {
      invocation.getArgument(2, Runnable.class).run();
      return true;
    });
    MaintenanceProperties maintenanceProperties = new MaintenanceProperties();

    ExpiredDataCleanupJob job = new ExpiredDataCleanupJob(
        authRepository,
        telegramLinkCodeRepository,
        apiRateLimiter,
        expiredDataRepository,
        maintenanceProperties,
        jobLockService);
    job.cleanupExpiredRows();

    verify(authRepository).deleteExpiredNonces(any(Instant.class));
    verify(authRepository).deleteExpiredSessions(any(Instant.class));
    verify(telegramLinkCodeRepository).deleteExpired(any(Instant.class));
    verify(apiRateLimiter).deleteExpiredBuckets(any(Instant.class));
    verify(expiredDataRepository).deleteOldDryRunSwapHistory(any(Instant.class));
    verify(expiredDataRepository).deleteOldReverseProfitAlerts(any(Instant.class));
    verify(expiredDataRepository).deleteOldFavoritePairAlerts(any(Instant.class));
    verify(expiredDataRepository).deleteOldAutoSwapAlerts(any(Instant.class));
    verify(expiredDataRepository).deleteOldNotificationOutbox(any(Instant.class));
  }
}
