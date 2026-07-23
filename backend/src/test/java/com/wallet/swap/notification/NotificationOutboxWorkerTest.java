package com.wallet.swap.notification;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.NotificationOutboxRepository.NotificationOutboxItem;
import com.wallet.swap.ops.OperationalMetricsService;
import com.wallet.swap.pricealert.PriceAlertDeliveryRepository;
import com.wallet.swap.pricealert.PriceAlertModels.PriceAlertCandidate;
import com.wallet.swap.pricealert.PriceAlertModels.PriceAlertOpportunity;
import java.math.BigDecimal;
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
        mock(PriceAlertDeliveryRepository.class),
        mock(OperationalMetricsService.class),
        new ObjectMapper());

    worker.deliverPending();

    verify(repository, times(2)).claimPending(eq(1), anyInt(), any());
    verify(emailSender).send("user@example.com", "Price alert", "A price alert is ready.");
    verify(repository).markSent(first.id());
  }

  @Test
  void deliversCurrentAndLegacyPriceAlertOutboxRecords() throws Exception {
    NotificationProperties properties = new NotificationProperties();
    properties.setOutboxBatchSize(2);
    NotificationOutboxRepository repository = mock(NotificationOutboxRepository.class);
    EmailNotificationSender emailSender = mock(EmailNotificationSender.class);
    PriceAlertDeliveryRepository deliveryRepository = mock(PriceAlertDeliveryRepository.class);
    ObjectMapper objectMapper = new ObjectMapper();
    String payload = objectMapper.writeValueAsString(priceAlertOpportunity());
    NotificationOutboxItem current = priceAlertItem("price_alert", payload);
    NotificationOutboxItem legacy = priceAlertItem("auto_swap", payload);
    when(repository.claimPending(eq(1), anyInt(), any()))
        .thenReturn(List.of(current))
        .thenReturn(List.of(legacy));

    NotificationOutboxWorker worker = new NotificationOutboxWorker(
        properties,
        repository,
        emailSender,
        mock(TelegramNotificationSender.class),
        mock(PushNotificationSender.class),
        mock(NotificationMessageFormatter.class),
        mock(ReverseProfitAlertRepository.class),
        mock(FavoritePairAlertRepository.class),
        deliveryRepository,
        mock(OperationalMetricsService.class),
        objectMapper);

    worker.deliverPending();

    verify(emailSender, times(2)).send("user@example.com", "Price alert", "Target reached.");
    verify(deliveryRepository, times(2)).saveDelivery(
        any(PriceAlertOpportunity.class),
        eq("email"),
        eq("user@example.com"),
        eq(true),
        isNull());
    verify(repository).markSent(current.id());
    verify(repository).markSent(legacy.id());
  }

  @Test
  void deliversContactEmailWithoutCreatingAlertDeliveryRecord() {
    NotificationProperties properties = new NotificationProperties();
    NotificationOutboxRepository repository = mock(NotificationOutboxRepository.class);
    EmailNotificationSender emailSender = mock(EmailNotificationSender.class);
    ReverseProfitAlertRepository reverseProfitRepository =
        mock(ReverseProfitAlertRepository.class);
    FavoritePairAlertRepository favoritePairRepository =
        mock(FavoritePairAlertRepository.class);
    PriceAlertDeliveryRepository priceAlertRepository =
        mock(PriceAlertDeliveryRepository.class);
    NotificationOutboxItem contact = new NotificationOutboxItem(
        UUID.randomUUID(),
        "contact",
        "email",
        "operator@example.com",
        "New contact message",
        "A visitor submitted the contact form.",
        "{}",
        1);
    when(repository.claimPending(eq(1), anyInt(), any()))
        .thenReturn(List.of(contact))
        .thenReturn(List.of());

    NotificationOutboxWorker worker = new NotificationOutboxWorker(
        properties,
        repository,
        emailSender,
        mock(TelegramNotificationSender.class),
        mock(PushNotificationSender.class),
        mock(NotificationMessageFormatter.class),
        reverseProfitRepository,
        favoritePairRepository,
        priceAlertRepository,
        mock(OperationalMetricsService.class),
        new ObjectMapper());

    worker.deliverPending();

    verify(emailSender).send(
        "operator@example.com",
        "New contact message",
        "A visitor submitted the contact form.");
    verify(repository).markSent(contact.id());
    verify(reverseProfitRepository, times(0))
        .saveDelivery(any(), any(), any(), anyBoolean(), any());
    verify(favoritePairRepository, times(0))
        .saveDelivery(any(), any(), any(), anyBoolean(), any());
    verify(priceAlertRepository, times(0))
        .saveDelivery(any(), any(), any(), anyBoolean(), any());
  }

  private NotificationOutboxItem priceAlertItem(String kind, String payload) {
    return new NotificationOutboxItem(
        UUID.randomUUID(),
        kind,
        "email",
        "user@example.com",
        "Price alert",
        "Target reached.",
        payload,
        1);
  }

  private PriceAlertOpportunity priceAlertOpportunity() {
    PriceAlertCandidate candidate = new PriceAlertCandidate(
        UUID.randomUUID(),
        "0x1111111111111111111111111111111111111111",
        1L,
        "0x2222222222222222222222222222222222222222",
        "ETH",
        18,
        "0x3333333333333333333333333333333333333333",
        "USDT",
        6,
        "1000000000000000000",
        new BigDecimal("2000"),
        "above",
        50,
        "0x1111111111111111111111111111111111111111",
        "notify_to_confirm",
        "confirmation_required",
        "user@example.com",
        true,
        null,
        "",
        false,
        null,
        false,
        null,
        60);
    return new PriceAlertOpportunity(
        candidate,
        new BigDecimal("2100"),
        new BigDecimal("2100"),
        BigDecimal.ONE);
  }
}
