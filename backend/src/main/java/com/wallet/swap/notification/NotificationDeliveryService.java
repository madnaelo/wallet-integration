package com.wallet.swap.notification;

import com.wallet.swap.notification.ReverseProfitModels.ReverseProfitOpportunity;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class NotificationDeliveryService {
  private static final Logger log = LoggerFactory.getLogger(NotificationDeliveryService.class);

  private final EmailNotificationSender emailSender;
  private final TelegramNotificationSender telegramSender;
  private final NotificationMessageFormatter messageFormatter;
  private final ReverseProfitAlertRepository alertRepository;

  public NotificationDeliveryService(
      EmailNotificationSender emailSender,
      TelegramNotificationSender telegramSender,
      NotificationMessageFormatter messageFormatter,
      ReverseProfitAlertRepository alertRepository) {
    this.emailSender = emailSender;
    this.telegramSender = telegramSender;
    this.messageFormatter = messageFormatter;
    this.alertRepository = alertRepository;
  }

  public void deliver(ReverseProfitOpportunity opportunity) {
    if (opportunity.candidate().emailEnabled() && emailSender.isEnabled()
        && isCooldownElapsed(opportunity.candidate().lastEmailAlertAt(), opportunity.candidate().cooldownMinutes())) {
      deliverEmail(opportunity);
    }

    if (opportunity.candidate().telegramEnabled() && telegramSender.isEnabled()
        && isCooldownElapsed(opportunity.candidate().lastTelegramAlertAt(), opportunity.candidate().cooldownMinutes())) {
      deliverTelegram(opportunity);
    }
  }

  private void deliverEmail(ReverseProfitOpportunity opportunity) {
    String target = opportunity.candidate().emailAddress();
    try {
      emailSender.send(target, messageFormatter.subject(opportunity), messageFormatter.body(opportunity));
      alertRepository.saveDelivery(opportunity, "email", target, true, null);
    } catch (Exception exception) {
      log.warn("Reverse profit email delivery failed for swap {}", opportunity.candidate().swapHistoryId(), exception);
      alertRepository.saveDelivery(opportunity, "email", target, false, exception.getMessage());
    }
  }

  private void deliverTelegram(ReverseProfitOpportunity opportunity) {
    String target = opportunity.candidate().telegramChatId();
    try {
      telegramSender.send(target, messageFormatter.body(opportunity));
      alertRepository.saveDelivery(opportunity, "telegram", target, true, null);
    } catch (Exception exception) {
      log.warn("Reverse profit Telegram delivery failed for swap {}", opportunity.candidate().swapHistoryId(), exception);
      alertRepository.saveDelivery(opportunity, "telegram", target, false, exception.getMessage());
    }
  }

  private boolean isCooldownElapsed(Instant lastAlertAt, int cooldownMinutes) {
    return lastAlertAt == null || lastAlertAt.plus(Duration.ofMinutes(cooldownMinutes)).isBefore(Instant.now());
  }
}
