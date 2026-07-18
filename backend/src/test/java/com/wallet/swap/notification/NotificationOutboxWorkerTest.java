package com.wallet.swap.notification;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.autoswap.AutoSwapAlertRepository;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.NotificationOutboxRepository.NotificationOutboxItem;
import com.wallet.swap.ops.OperationalMetricsService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class NotificationOutboxWorkerTest {
  @Test
  void leasesEachItemImmediatelyBeforeDelivery() {
    NotificationProperties properties = new NotificationProperties();
    properties.setOutboxBatchSize(2);
    NotificationOutboxRepository repository = mock(NotificationOutboxRepository.class);
    EmailNotificationSender emailSender = mock(EmailNotificationSender.class);
    NotificationOutboxItem first = new NotificationOutboxItem(
        UUID.randomUUID(),
        "reverse_profit",
        "email",
        "user@example.com",
        "Price alert",
        "A price alert is ready.",
        "{}",
        1);
    when(repository.claimPending(eq(1), anyInt(), any()))
        .thenReturn(List.of(first))
        .thenReturn(List.of());

    NotificationOutboxWorker worker = new NotificationOutboxWorker(
        properties,
        repository,
        emailSender,
        mock(TelegramNotificationSender.class),
        mock(PushNotificationSender.class),
        mock(NotificationMessageFormatter.class),
        mock(ReverseProfitAlertRepository.class),
        mock(FavoritePairAlertRepository.class),
        mock(AutoSwapAlertRepository.class),
        mock(OperationalMetricsService.class),
        new ObjectMapper());

    worker.deliverPending();

    verify(repository, times(2)).claimPending(eq(1), anyInt(), any());
    verify(emailSender).send("user@example.com", "Price alert", "A price alert is ready.");
    verify(repository).markSent(first.id());
  }
}
