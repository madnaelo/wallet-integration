package com.wallet.swap.notification;

import com.wallet.swap.notification.FavoritePairModels.FavoritePairOpportunity;
import com.wallet.swap.notification.ReverseProfitModels.ReverseProfitOpportunity;
import com.wallet.swap.pricealert.PriceAlertModels.PriceAlertOpportunity;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class NotificationDeliveryService {
  private static final Logger log = LoggerFactory.getLogger(NotificationDeliveryService.class);
  private static final String PRICE_ALERT_KIND = "price_alert";

  private final EmailNotificationSender emailSender;
  private final TelegramNotificationSender telegramSender;
  private final PushNotificationSender pushSender;
  private final NotificationMessageFormatter messageFormatter;
  private final NotificationOutboxRepository outboxRepository;

  public NotificationDeliveryService(
      EmailNotificationSender emailSender,
      TelegramNotificationSender telegramSender,
      PushNotificationSender pushSender,
      NotificationMessageFormatter messageFormatter,
      NotificationOutboxRepository outboxRepository) {
    this.emailSender = emailSender;
    this.telegramSender = telegramSender;
    this.pushSender = pushSender;
    this.messageFormatter = messageFormatter;
    this.outboxRepository = outboxRepository;
  }

  public void deliver(ReverseProfitOpportunity opportunity) {
    if (opportunity.candidate().emailEnabled() && emailSender.isEnabled()
        && isCooldownElapsed(opportunity.lastEmailAlertAt(), opportunity.candidate().cooldownMinutes())) {
      deliverEmail(opportunity);
    }

    if (opportunity.candidate().telegramEnabled() && telegramSender.isEnabled()
        && isCooldownElapsed(opportunity.lastTelegramAlertAt(), opportunity.candidate().cooldownMinutes())) {
      deliverTelegram(opportunity);
    }

    if (opportunity.candidate().pushEnabled() && pushSender.isEnabled()
        && isCooldownElapsed(opportunity.lastPushAlertAt(), opportunity.candidate().cooldownMinutes())) {
      deliverPush(opportunity);
    }
  }

  public void deliver(FavoritePairOpportunity opportunity) {
    if (opportunity.candidate().emailEnabled() && emailSender.isEnabled()
        && isCooldownElapsed(opportunity.candidate().lastEmailAlertAt(), opportunity.candidate().cooldownMinutes())) {
      deliverFavoritePairEmail(opportunity);
    }

    if (opportunity.candidate().telegramEnabled() && telegramSender.isEnabled()
        && isCooldownElapsed(opportunity.candidate().lastTelegramAlertAt(), opportunity.candidate().cooldownMinutes())) {
      deliverFavoritePairTelegram(opportunity);
    }

    if (opportunity.candidate().pushEnabled() && pushSender.isEnabled()
        && isCooldownElapsed(opportunity.candidate().lastPushAlertAt(), opportunity.candidate().cooldownMinutes())) {
      deliverFavoritePairPush(opportunity);
    }
  }

  public void deliver(PriceAlertOpportunity opportunity) {
    if (opportunity.candidate().emailEnabled() && emailSender.isEnabled()
        && isCooldownElapsed(opportunity.candidate().lastEmailAlertAt(), opportunity.candidate().cooldownMinutes())) {
      deliverPriceAlertEmail(opportunity);
    }

    if (opportunity.candidate().telegramEnabled() && telegramSender.isEnabled()
        && isCooldownElapsed(opportunity.candidate().lastTelegramAlertAt(), opportunity.candidate().cooldownMinutes())) {
      deliverPriceAlertTelegram(opportunity);
    }

    if (opportunity.candidate().pushEnabled() && pushSender.isEnabled()
        && isCooldownElapsed(opportunity.candidate().lastPushAlertAt(), opportunity.candidate().cooldownMinutes())) {
      deliverPriceAlertPush(opportunity);
    }
  }

  private void deliverEmail(ReverseProfitOpportunity opportunity) {
    String target = opportunity.candidate().emailAddress();
    enqueue(
        "reverse_profit",
        opportunity.candidate().swapHistoryId(),
        opportunity.alertType().value(),
        "email",
        target,
        messageFormatter.subject(opportunity),
        messageFormatter.body(opportunity),
        opportunity,
        opportunity.candidate().cooldownMinutes());
  }

  private void deliverTelegram(ReverseProfitOpportunity opportunity) {
    String target = opportunity.candidate().telegramChatId();
    enqueue(
        "reverse_profit",
        opportunity.candidate().swapHistoryId(),
        opportunity.alertType().value(),
        "telegram",
        target,
        messageFormatter.subject(opportunity),
        messageFormatter.body(opportunity),
        opportunity,
        opportunity.candidate().cooldownMinutes());
  }

  private void deliverPush(ReverseProfitOpportunity opportunity) {
    enqueue(
        "reverse_profit",
        opportunity.candidate().swapHistoryId(),
        opportunity.alertType().value(),
        "push",
        opportunity.candidate().walletAddress(),
        messageFormatter.subject(opportunity),
        messageFormatter.pushPayload(opportunity).body(),
        opportunity,
        opportunity.candidate().cooldownMinutes());
  }

  private void deliverFavoritePairEmail(FavoritePairOpportunity opportunity) {
    String target = opportunity.candidate().emailAddress();
    enqueue(
        "favorite_pair",
        opportunity.candidate().id(),
        opportunity.candidate().alertDirection(),
        "email",
        target,
        messageFormatter.subject(opportunity),
        messageFormatter.body(opportunity),
        opportunity,
        opportunity.candidate().cooldownMinutes());
  }

  private void deliverFavoritePairTelegram(FavoritePairOpportunity opportunity) {
    String target = opportunity.candidate().telegramChatId();
    enqueue(
        "favorite_pair",
        opportunity.candidate().id(),
        opportunity.candidate().alertDirection(),
        "telegram",
        target,
        messageFormatter.subject(opportunity),
        messageFormatter.body(opportunity),
        opportunity,
        opportunity.candidate().cooldownMinutes());
  }

  private void deliverFavoritePairPush(FavoritePairOpportunity opportunity) {
    enqueue(
        "favorite_pair",
        opportunity.candidate().id(),
        opportunity.candidate().alertDirection(),
        "push",
        opportunity.candidate().walletAddress(),
        messageFormatter.subject(opportunity),
        messageFormatter.pushPayload(opportunity).body(),
        opportunity,
        opportunity.candidate().cooldownMinutes());
  }

  private void deliverPriceAlertEmail(PriceAlertOpportunity opportunity) {
    String target = opportunity.candidate().emailAddress();
    enqueue(
        PRICE_ALERT_KIND,
        opportunity.candidate().id(),
        opportunity.candidate().alertDirection(),
        "email",
        target,
        messageFormatter.subject(opportunity),
        messageFormatter.body(opportunity),
        opportunity,
        opportunity.candidate().cooldownMinutes());
  }

  private void deliverPriceAlertTelegram(PriceAlertOpportunity opportunity) {
    String target = opportunity.candidate().telegramChatId();
    enqueue(
        PRICE_ALERT_KIND,
        opportunity.candidate().id(),
        opportunity.candidate().alertDirection(),
        "telegram",
        target,
        messageFormatter.subject(opportunity),
        messageFormatter.body(opportunity),
        opportunity,
        opportunity.candidate().cooldownMinutes());
  }

  private void deliverPriceAlertPush(PriceAlertOpportunity opportunity) {
    enqueue(
        PRICE_ALERT_KIND,
        opportunity.candidate().id(),
        opportunity.candidate().alertDirection(),
        "push",
        opportunity.candidate().walletAddress(),
        messageFormatter.subject(opportunity),
        messageFormatter.pushPayload(opportunity).body(),
        opportunity,
        opportunity.candidate().cooldownMinutes());
  }

  private boolean isCooldownElapsed(Instant lastAlertAt, int cooldownMinutes) {
    return lastAlertAt == null || lastAlertAt.plus(Duration.ofMinutes(cooldownMinutes)).isBefore(Instant.now());
  }

  private void enqueue(
      String notificationKind,
      UUID sourceId,
      String sourceScope,
      String channel,
      String target,
      String subject,
      String body,
      Object payload,
      int cooldownMinutes) {
    boolean enqueued = outboxRepository.enqueue(
        dedupeKey(notificationKind, sourceId, sourceScope, channel, cooldownMinutes),
        notificationKind,
        channel,
        target,
        subject,
        body,
        payload);
    if (!enqueued) {
      log.debug("Skipped duplicate {} {} notification for {}.", notificationKind, channel, sourceId);
    }
  }

  private String dedupeKey(String notificationKind, UUID sourceId, String sourceScope, String channel, int cooldownMinutes) {
    long windowSeconds = Math.max(60, Math.max(1, cooldownMinutes) * 60L);
    long window = Instant.now().getEpochSecond() / windowSeconds;
    return "%s:%s:%s:%s:%d".formatted(notificationKind, sourceId, sourceScope, channel, window);
  }
}
