package com.wallet.swap.notification;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.NotificationModels.NotificationPreferenceRequest;
import com.wallet.swap.notification.NotificationModels.NotificationPreferenceResponse;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class NotificationPreferenceService {
  private static final Pattern BASIC_EMAIL_PATTERN = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

  private final NotificationPreferenceRepository repository;
  private final PushSubscriptionRepository pushSubscriptionRepository;
  private final NotificationProperties properties;

  public NotificationPreferenceService(
      NotificationPreferenceRepository repository,
      PushSubscriptionRepository pushSubscriptionRepository,
      NotificationProperties properties) {
    this.repository = repository;
    this.pushSubscriptionRepository = pushSubscriptionRepository;
    this.properties = properties;
  }

  public NotificationPreferenceResponse get(String walletAddress) {
    return repository.find(walletAddress)
        .orElseGet(() -> new NotificationPreferenceResponse(
            walletAddress,
            null,
            false,
            null,
            false,
            false,
            0,
            properties.getDefaultProfitThresholdBps(),
            false,
            properties.getDefaultLossThresholdBps(),
            properties.getDefaultCooldownMinutes()));
  }

  public NotificationPreferenceResponse save(String walletAddress, NotificationPreferenceRequest request) {
    NotificationPreferenceResponse current = get(walletAddress);
    validate(request, current.telegramChatId());
    boolean pushEnabled = Boolean.TRUE.equals(request.pushEnabled())
        && pushSubscriptionRepository.countActive(walletAddress) > 0;
    return repository.upsert(
        walletAddress,
        request,
        current.telegramChatId(),
        Boolean.TRUE.equals(request.telegramEnabled()),
        pushEnabled,
        properties.getDefaultProfitThresholdBps(),
        properties.getDefaultLossThresholdBps(),
        properties.getDefaultCooldownMinutes());
  }

  public NotificationPreferenceResponse connectTelegram(String walletAddress, String telegramChatId) {
    NotificationPreferenceResponse current = get(walletAddress);
    NotificationPreferenceRequest request = new NotificationPreferenceRequest(
        current.emailAddress(),
        current.emailEnabled(),
        true,
        current.pushEnabled(),
        current.reverseProfitThresholdBps(),
        current.reverseLossEnabled(),
        current.reverseLossThresholdBps(),
        current.cooldownMinutes());
    validate(request, telegramChatId);
    return repository.upsert(
        walletAddress,
        request,
        telegramChatId,
        true,
        current.pushEnabled(),
        properties.getDefaultProfitThresholdBps(),
        properties.getDefaultLossThresholdBps(),
        properties.getDefaultCooldownMinutes());
  }

  public NotificationPreferenceResponse setPushEnabled(String walletAddress, boolean pushEnabled) {
    return repository.setPushEnabled(
        walletAddress,
        pushEnabled,
        properties.getDefaultProfitThresholdBps(),
        properties.getDefaultLossThresholdBps(),
        properties.getDefaultCooldownMinutes());
  }

  private void validate(NotificationPreferenceRequest request, String linkedTelegramChatId) {
    String email = trim(request.emailAddress());
    String telegramChatId = trim(linkedTelegramChatId);

    if (email != null && !BASIC_EMAIL_PATTERN.matcher(email).matches()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a valid email address.");
    }
    if (Boolean.TRUE.equals(request.emailEnabled()) && email == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Email address is required when email alerts are enabled.");
    }
    if (Boolean.TRUE.equals(request.telegramEnabled()) && telegramChatId == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Connect Telegram before enabling Telegram alerts.");
    }
  }

  private String trim(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }
}
