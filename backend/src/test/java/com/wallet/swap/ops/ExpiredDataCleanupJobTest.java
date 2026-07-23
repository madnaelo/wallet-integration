package com.wallet.swap.ops;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
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
    when(authRepository.deleteExpiredNonces(any(Instant.class), anyInt())).thenReturn(1);
    when(authRepository.deleteExpiredSessions(any(Instant.class), anyInt())).thenReturn(2);
    when(telegramLinkCodeRepository.deleteExpired(any(Instant.class), anyInt())).thenReturn(3);
    when(apiRateLimiter.deleteExpiredBuckets(any(Instant.class), anyInt())).thenReturn(4);
    when(expiredDataRepository.deleteOldDryRunSwapHistory(any(Instant.class), anyInt())).thenReturn(5);
    when(expiredDataRepository.deleteOldReverseProfitAlerts(any(Instant.class), anyInt())).thenReturn(6);
    when(expiredDataRepository.deleteOldFavoritePairAlerts(any(Instant.class), anyInt())).thenReturn(7);
    when(expiredDataRepository.deleteOldPriceAlertDeliveries(any(Instant.class), anyInt())).thenReturn(8);
    when(expiredDataRepository.deleteOldNotificationOutbox(any(Instant.class), anyInt())).thenReturn(9);
    when(expiredDataRepository.deleteOldContactSubmissions(any(Instant.class), anyInt())).thenReturn(10);
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

    verify(authRepository).deleteExpiredNonces(any(Instant.class), eq(2000));
    verify(authRepository).deleteExpiredSessions(any(Instant.class), eq(2000));
    verify(telegramLinkCodeRepository).deleteExpired(any(Instant.class), eq(2000));
    verify(apiRateLimiter).deleteExpiredBuckets(any(Instant.class), eq(2000));
    verify(expiredDataRepository).deleteOldDryRunSwapHistory(any(Instant.class), eq(2000));
    verify(expiredDataRepository).deleteOldReverseProfitAlerts(any(Instant.class), eq(2000));
    verify(expiredDataRepository).deleteOldFavoritePairAlerts(any(Instant.class), eq(2000));
    verify(expiredDataRepository).deleteOldPriceAlertDeliveries(any(Instant.class), eq(2000));
    verify(expiredDataRepository).deleteOldNotificationOutbox(any(Instant.class), eq(2000));
    verify(expiredDataRepository).deleteOldContactSubmissions(any(Instant.class), eq(2000));
  }

  @Test
  void drainsFullBatchesWithoutExceedingPerRunLimit() {
    when(authRepository.deleteExpiredNonces(any(Instant.class), eq(100)))
        .thenReturn(100)
        .thenReturn(100)
        .thenReturn(50);
    when(jobLockService.runIfAcquired(eq("expired-data-cleanup"), any(), any())).thenAnswer(invocation -> {
      invocation.getArgument(2, Runnable.class).run();
      return true;
    });
    MaintenanceProperties maintenanceProperties = new MaintenanceProperties();
    maintenanceProperties.setDeleteBatchSize(100);
    maintenanceProperties.setMaxDeleteBatchesPerRun(3);

    ExpiredDataCleanupJob job = new ExpiredDataCleanupJob(
        authRepository,
        telegramLinkCodeRepository,
        apiRateLimiter,
        expiredDataRepository,
        maintenanceProperties,
        jobLockService);
    job.cleanupExpiredRows();

    verify(authRepository, times(3)).deleteExpiredNonces(any(Instant.class), eq(100));
  }
}
