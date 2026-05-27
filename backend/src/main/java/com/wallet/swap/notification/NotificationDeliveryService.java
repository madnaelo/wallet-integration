package com.wallet.swap.notification;

import com.wallet.swap.notification.FavoritePairModels.FavoritePairOpportunity;
import com.wallet.swap.notification.ReverseProfitModels.ReverseProfitOpportunity;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapOpportunity;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class NotificationDeliveryService {
  private static final Logger log = LoggerFactory.getLogger(NotificationDeliveryService.class);

  private final EmailNotificationSender emailSender;
  private final TelegramNotificationSender telegramSender;
  private final NotificationMessageFormatter messageFormatter;
  private final NotificationOutboxRepository outboxRepository;

  public NotificationDeliveryService(
      EmailNotificationSender emailSender,
      TelegramNotificationSender telegramSender,
      NotificationMessageFormatter messageFormatter,
      NotificationOutboxRepository outboxRepository) {
    this.emailSender = emailSender;
    this.telegramSender = telegramSender;
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
  }

  public void deliver(AutoSwapOpportunity opportunity) {
    if (opportunity.candidate().emailEnabled() && emailSender.isEnabled()
        && isCooldownElapsed(opportunity.candidate().lastEmailAlertAt(), opportunity.candidate().cooldownMinutes())) {
      deliverAutoSwapEmail(opportunity);
    }

    if (opportunity.candidate().telegramEnabled() && telegramSender.isEnabled()
        && isCooldownElapsed(opportunity.candidate().lastTelegramAlertAt(), opportunity.candidate().cooldownMinutes())) {
      deliverAutoSwapTelegram(opportunity);
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

  private void deliverAutoSwapEmail(AutoSwapOpportunity opportunity) {
    String target = opportunity.candidate().emailAddress();
    enqueue(
        "auto_swap",
        opportunity.candidate().id(),
        opportunity.candidate().alertDirection(),
        "email",
        target,
        messageFormatter.subject(opportunity),
        messageFormatter.body(opportunity),
        opportunity,
        opportunity.candidate().cooldownMinutes());
  }

  private void deliverAutoSwapTelegram(AutoSwapOpportunity opportunity) {
    String target = opportunity.candidate().telegramChatId();
    enqueue(
        "auto_swap",
        opportunity.candidate().id(),
        opportunity.candidate().alertDirection(),
        "telegram",
        target,
        messageFormatter.subject(opportunity),
        messageFormatter.body(opportunity),
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
