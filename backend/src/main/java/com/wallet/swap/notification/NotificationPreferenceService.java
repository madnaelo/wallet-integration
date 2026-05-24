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
  private final NotificationProperties properties;

  public NotificationPreferenceService(NotificationPreferenceRepository repository, NotificationProperties properties) {
    this.repository = repository;
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
            properties.getDefaultProfitThresholdBps(),
            properties.getDefaultCooldownMinutes()));
  }

  public NotificationPreferenceResponse save(String walletAddress, NotificationPreferenceRequest request) {
    validate(request);
    return repository.upsert(
        walletAddress,
        request,
        properties.getDefaultProfitThresholdBps(),
        properties.getDefaultCooldownMinutes());
  }

  private void validate(NotificationPreferenceRequest request) {
    String email = trim(request.emailAddress());
    String telegramChatId = trim(request.telegramChatId());

    if (email != null && !BASIC_EMAIL_PATTERN.matcher(email).matches()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a valid email address.");
    }
    if (Boolean.TRUE.equals(request.emailEnabled()) && email == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Email address is required when email alerts are enabled.");
    }
    if (Boolean.TRUE.equals(request.telegramEnabled()) && telegramChatId == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Telegram chat ID is required when Telegram alerts are enabled.");
    }
  }

  private String trim(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }
}
