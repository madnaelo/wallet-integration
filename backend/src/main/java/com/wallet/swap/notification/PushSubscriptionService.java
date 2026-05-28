package com.wallet.swap.notification;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.NotificationModels.NotificationPreferenceResponse;
import com.wallet.swap.notification.NotificationModels.PushSubscriptionRequest;
import java.net.URI;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class PushSubscriptionService {
  private final NotificationProperties properties;
  private final PushSubscriptionRepository pushSubscriptionRepository;
  private final NotificationPreferenceService preferenceService;

  public PushSubscriptionService(
      NotificationProperties properties,
      PushSubscriptionRepository pushSubscriptionRepository,
      NotificationPreferenceService preferenceService) {
    this.properties = properties;
    this.pushSubscriptionRepository = pushSubscriptionRepository;
    this.preferenceService = preferenceService;
  }

  public boolean isAvailable() {
    return properties.getPush().isEnabled()
        && hasText(properties.getPush().getVapidPublicKey())
        && hasText(properties.getPush().getVapidPrivateKey())
        && hasText(properties.getPush().getVapidSubject());
  }

  public NotificationPreferenceResponse subscribe(
      String walletAddress,
      PushSubscriptionRequest request,
      String userAgent) {
    if (!isAvailable()) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Browser notifications are not available right now.");
    }
    validate(request);
    pushSubscriptionRepository.upsert(walletAddress, request, userAgent);
    return preferenceService.setPushEnabled(walletAddress, true);
  }

  public NotificationPreferenceResponse disable(String walletAddress) {
    pushSubscriptionRepository.disableForWallet(walletAddress);
    return preferenceService.setPushEnabled(walletAddress, false);
  }

  private void validate(PushSubscriptionRequest request) {
    if (request.keys() == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Browser notification setup was incomplete. Please try again.");
    }
    try {
      URI endpoint = URI.create(request.endpoint().trim());
      if (!"https".equalsIgnoreCase(endpoint.getScheme())) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Browser notification setup was incomplete. Please try again.");
      }
    } catch (IllegalArgumentException exception) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Browser notification setup was incomplete. Please try again.");
    }
  }

  private boolean hasText(String value) {
    return value != null && !value.isBlank();
  }
}
