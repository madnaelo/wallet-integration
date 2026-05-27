package com.wallet.swap.ops;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.wallet.swap.auth.AuthRepository;
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

  @Test
  void deletesExpiredAuthAndTelegramRows() {
    when(authRepository.deleteExpiredNonces(any(Instant.class))).thenReturn(1);
    when(authRepository.deleteExpiredSessions(any(Instant.class))).thenReturn(2);
    when(telegramLinkCodeRepository.deleteExpired(any(Instant.class))).thenReturn(3);

    ExpiredDataCleanupJob job = new ExpiredDataCleanupJob(authRepository, telegramLinkCodeRepository);
    job.cleanupExpiredRows();

    verify(authRepository).deleteExpiredNonces(any(Instant.class));
    verify(authRepository).deleteExpiredSessions(any(Instant.class));
    verify(telegramLinkCodeRepository).deleteExpired(any(Instant.class));
  }
}
