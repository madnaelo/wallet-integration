package com.wallet.swap.notification;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.autoswap.AutoSwapAlertRepository;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapOpportunity;
import com.wallet.swap.common.SafeErrorDetails;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.FavoritePairModels.FavoritePairOpportunity;
import com.wallet.swap.notification.NotificationOutboxRepository.NotificationOutboxItem;
import com.wallet.swap.notification.ReverseProfitModels.ReverseProfitOpportunity;
import com.wallet.swap.ops.OperationalMetricsService;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class NotificationOutboxWorker {
  private static final Logger log = LoggerFactory.getLogger(NotificationOutboxWorker.class);

  private final NotificationProperties properties;
  private final NotificationOutboxRepository outboxRepository;
  private final EmailNotificationSender emailSender;
  private final TelegramNotificationSender telegramSender;
  private final PushNotificationSender pushSender;
  private final NotificationMessageFormatter messageFormatter;
  private final ReverseProfitAlertRepository reverseProfitAlertRepository;
  private final FavoritePairAlertRepository favoritePairAlertRepository;
  private final AutoSwapAlertRepository autoSwapAlertRepository;
  private final OperationalMetricsService metricsService;
  private final ObjectMapper objectMapper;
  private final AtomicBoolean running = new AtomicBoolean(false);

  public NotificationOutboxWorker(
      NotificationProperties properties,
      NotificationOutboxRepository outboxRepository,
      EmailNotificationSender emailSender,
      TelegramNotificationSender telegramSender,
      PushNotificationSender pushSender,
      NotificationMessageFormatter messageFormatter,
      ReverseProfitAlertRepository reverseProfitAlertRepository,
      FavoritePairAlertRepository favoritePairAlertRepository,
      AutoSwapAlertRepository autoSwapAlertRepository,
      OperationalMetricsService metricsService,
      ObjectMapper objectMapper) {
    this.properties = properties;
    this.outboxRepository = outboxRepository;
    this.emailSender = emailSender;
    this.telegramSender = telegramSender;
    this.pushSender = pushSender;
    this.messageFormatter = messageFormatter;
    this.reverseProfitAlertRepository = reverseProfitAlertRepository;
    this.favoritePairAlertRepository = favoritePairAlertRepository;
    this.autoSwapAlertRepository = autoSwapAlertRepository;
    this.metricsService = metricsService;
    this.objectMapper = objectMapper;
  }

  @Scheduled(fixedDelayString = "${wallet.notifications.outbox-fixed-delay-ms:15000}")
  public void deliverPending() {
    if (!running.compareAndSet(false, true)) return;
    try {
      int maxAttempts = Math.max(1, properties.getOutboxMaxAttempts());
      outboxRepository.markExhaustedPending(maxAttempts);
      for (NotificationOutboxItem item : outboxRepository.claimPending(
          Math.max(1, properties.getOutboxBatchSize()),
          maxAttempts,
          Duration.ofSeconds(Math.max(10, properties.getOutboxLockTtlSeconds())))) {
        deliver(item, maxAttempts);
      }
    } finally {
      running.set(false);
    }
  }

  private void deliver(NotificationOutboxItem item, int maxAttempts) {
    try {
      send(item);
      saveDelivery(item, true, null);
      outboxRepository.markSent(item.id());
      metricsService.recordDelivery(true, null);
    } catch (Exception exception) {
      String failureDetails = SafeErrorDetails.summarize(exception);
      log.warn(
          "Notification outbox delivery failed for {} {} item {}.",
          item.notificationKind(),
          item.channel(),
          item.id(),
          exception);
      saveFailureBestEffort(item, failureDetails);
      boolean retry = item.attempts() < maxAttempts;
      outboxRepository.markFailed(item.id(), failureDetails, retry, retryDelay(item.attempts()));
      metricsService.recordDelivery(false, exception);
    }
  }

  private void send(NotificationOutboxItem item) throws Exception {
    switch (item.channel()) {
      case "email" -> emailSender.send(item.target(), item.subject(), item.body());
      case "telegram" -> telegramSender.send(item.target(), item.body());
      case "push" -> sendPush(item);
      default -> throw new IllegalArgumentException("Unsupported notification channel: " + item.channel());
    }
  }

  private void sendPush(NotificationOutboxItem item) throws Exception {
    switch (item.notificationKind()) {
      case "reverse_profit" -> pushSender.send(
          item.target(),
          messageFormatter.pushPayload(objectMapper.readValue(item.payloadJson(), ReverseProfitOpportunity.class)));
      case "favorite_pair" -> pushSender.send(
          item.target(),
          messageFormatter.pushPayload(objectMapper.readValue(item.payloadJson(), FavoritePairOpportunity.class)));
      case "auto_swap" -> pushSender.send(
          item.target(),
          messageFormatter.pushPayload(objectMapper.readValue(item.payloadJson(), AutoSwapOpportunity.class)));
      default -> throw new IllegalArgumentException("Unsupported notification kind: " + item.notificationKind());
    }
  }

  private void saveDelivery(NotificationOutboxItem item, boolean sent, String errorMessage) throws Exception {
    switch (item.notificationKind()) {
      case "reverse_profit" -> reverseProfitAlertRepository.saveDelivery(
          objectMapper.readValue(item.payloadJson(), ReverseProfitOpportunity.class),
          item.channel(),
          item.target(),
          sent,
          errorMessage);
      case "favorite_pair" -> favoritePairAlertRepository.saveDelivery(
          objectMapper.readValue(item.payloadJson(), FavoritePairOpportunity.class),
          item.channel(),
          item.target(),
          sent,
          errorMessage);
      case "auto_swap" -> autoSwapAlertRepository.saveDelivery(
          objectMapper.readValue(item.payloadJson(), AutoSwapOpportunity.class),
          item.channel(),
          item.target(),
          sent,
          errorMessage);
      default -> throw new IllegalArgumentException("Unsupported notification kind: " + item.notificationKind());
    }
  }

  private void saveFailureBestEffort(NotificationOutboxItem item, String failureDetails) {
    try {
      saveDelivery(item, false, failureDetails);
    } catch (Exception persistenceException) {
      log.warn("Could not record failed notification delivery for outbox item {}.", item.id(), persistenceException);
    }
  }

  private Duration retryDelay(int attempts) {
    long multiplier = 1L << Math.min(7, Math.max(0, attempts - 1));
    return Duration.ofSeconds(Math.min(3_600, 30 * multiplier));
  }
}
