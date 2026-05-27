package com.wallet.swap.notification;

import com.wallet.swap.notification.FavoritePairModels.FavoritePairOpportunity;
import com.wallet.swap.notification.ReverseProfitModels.ReverseProfitOpportunity;
import com.wallet.swap.autoswap.AutoSwapAlertRepository;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapOpportunity;
import com.wallet.swap.ops.OperationalMetricsService;
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
  private final FavoritePairAlertRepository favoritePairAlertRepository;
  private final AutoSwapAlertRepository autoSwapAlertRepository;
  private final OperationalMetricsService metricsService;

  public NotificationDeliveryService(
      EmailNotificationSender emailSender,
      TelegramNotificationSender telegramSender,
      NotificationMessageFormatter messageFormatter,
      ReverseProfitAlertRepository alertRepository,
      FavoritePairAlertRepository favoritePairAlertRepository,
      AutoSwapAlertRepository autoSwapAlertRepository,
      OperationalMetricsService metricsService) {
    this.emailSender = emailSender;
    this.telegramSender = telegramSender;
    this.messageFormatter = messageFormatter;
    this.alertRepository = alertRepository;
    this.favoritePairAlertRepository = favoritePairAlertRepository;
    this.autoSwapAlertRepository = autoSwapAlertRepository;
    this.metricsService = metricsService;
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
    try {
      emailSender.send(target, messageFormatter.subject(opportunity), messageFormatter.body(opportunity));
      alertRepository.saveDelivery(opportunity, "email", target, true, null);
      metricsService.recordDelivery(true, null);
    } catch (Exception exception) {
      log.warn("Reverse profit email delivery failed for swap {}", opportunity.candidate().swapHistoryId(), exception);
      alertRepository.saveDelivery(opportunity, "email", target, false, exception.getMessage());
      metricsService.recordDelivery(false, exception);
    }
  }

  private void deliverTelegram(ReverseProfitOpportunity opportunity) {
    String target = opportunity.candidate().telegramChatId();
    try {
      telegramSender.send(target, messageFormatter.body(opportunity));
      alertRepository.saveDelivery(opportunity, "telegram", target, true, null);
      metricsService.recordDelivery(true, null);
    } catch (Exception exception) {
      log.warn("Reverse profit Telegram delivery failed for swap {}", opportunity.candidate().swapHistoryId(), exception);
      alertRepository.saveDelivery(opportunity, "telegram", target, false, exception.getMessage());
      metricsService.recordDelivery(false, exception);
    }
  }

  private void deliverFavoritePairEmail(FavoritePairOpportunity opportunity) {
    String target = opportunity.candidate().emailAddress();
    try {
      emailSender.send(target, messageFormatter.subject(opportunity), messageFormatter.body(opportunity));
      favoritePairAlertRepository.saveDelivery(opportunity, "email", target, true, null);
      metricsService.recordDelivery(true, null);
    } catch (Exception exception) {
      log.warn("Favorite pair email delivery failed for pair {}", opportunity.candidate().id(), exception);
      favoritePairAlertRepository.saveDelivery(opportunity, "email", target, false, exception.getMessage());
      metricsService.recordDelivery(false, exception);
    }
  }

  private void deliverFavoritePairTelegram(FavoritePairOpportunity opportunity) {
    String target = opportunity.candidate().telegramChatId();
    try {
      telegramSender.send(target, messageFormatter.body(opportunity));
      favoritePairAlertRepository.saveDelivery(opportunity, "telegram", target, true, null);
      metricsService.recordDelivery(true, null);
    } catch (Exception exception) {
      log.warn("Favorite pair Telegram delivery failed for pair {}", opportunity.candidate().id(), exception);
      favoritePairAlertRepository.saveDelivery(opportunity, "telegram", target, false, exception.getMessage());
      metricsService.recordDelivery(false, exception);
    }
  }

  private void deliverAutoSwapEmail(AutoSwapOpportunity opportunity) {
    String target = opportunity.candidate().emailAddress();
    try {
      emailSender.send(target, messageFormatter.subject(opportunity), messageFormatter.body(opportunity));
      autoSwapAlertRepository.saveDelivery(opportunity, "email", target, true, null);
      metricsService.recordDelivery(true, null);
    } catch (Exception exception) {
      log.warn("Auto Swap email delivery failed for rule {}", opportunity.candidate().id(), exception);
      autoSwapAlertRepository.saveDelivery(opportunity, "email", target, false, exception.getMessage());
      metricsService.recordDelivery(false, exception);
    }
  }

  private void deliverAutoSwapTelegram(AutoSwapOpportunity opportunity) {
    String target = opportunity.candidate().telegramChatId();
    try {
      telegramSender.send(target, messageFormatter.body(opportunity));
      autoSwapAlertRepository.saveDelivery(opportunity, "telegram", target, true, null);
      metricsService.recordDelivery(true, null);
    } catch (Exception exception) {
      log.warn("Auto Swap Telegram delivery failed for rule {}", opportunity.candidate().id(), exception);
      autoSwapAlertRepository.saveDelivery(opportunity, "telegram", target, false, exception.getMessage());
      metricsService.recordDelivery(false, exception);
    }
  }

  private boolean isCooldownElapsed(Instant lastAlertAt, int cooldownMinutes) {
    return lastAlertAt == null || lastAlertAt.plus(Duration.ofMinutes(cooldownMinutes)).isBefore(Instant.now());
  }
}
