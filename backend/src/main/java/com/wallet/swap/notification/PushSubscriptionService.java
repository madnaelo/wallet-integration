package com.wallet.swap.notification;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.common.WalletMutationLock;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.NotificationModels.PushSubscriptionDisableRequest;
import com.wallet.swap.notification.NotificationModels.NotificationPreferenceResponse;
import com.wallet.swap.notification.NotificationModels.PushSubscriptionRequest;
import com.wallet.swap.notification.NotificationModels.PushSubscriptionStatusRequest;
import com.wallet.swap.notification.NotificationModels.PushSubscriptionStatusResponse;
import java.net.URI;
import java.util.Base64;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PushSubscriptionService {
  private final NotificationProperties properties;
  private final PushSubscriptionRepository pushSubscriptionRepository;
  private final NotificationPreferenceService preferenceService;
  private final WalletMutationLock walletMutationLock;

  public PushSubscriptionService(
      NotificationProperties properties,
      PushSubscriptionRepository pushSubscriptionRepository,
      NotificationPreferenceService preferenceService,
      WalletMutationLock walletMutationLock) {
    this.properties = properties;
    this.pushSubscriptionRepository = pushSubscriptionRepository;
    this.preferenceService = preferenceService;
    this.walletMutationLock = walletMutationLock;
  }

  public boolean isAvailable() {
    return properties.getPush().isEnabled()
        && hasText(properties.getPush().getVapidPublicKey())
        && hasText(properties.getPush().getVapidPrivateKey())
        && hasText(properties.getPush().getVapidSubject());
  }

  @Transactional
  public NotificationPreferenceResponse subscribe(
      String walletAddress,
      PushSubscriptionRequest request,
      String userAgent) {
    if (!isAvailable()) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Push notifications are not available right now.");
    }
    validate(request);
    walletMutationLock.lock(walletAddress);
    pushSubscriptionRepository.upsert(walletAddress, request, userAgent);
    pushSubscriptionRepository.retainMostRecentForWallet(
        walletAddress,
        Math.max(1, properties.getPush().getMaxDevicesPerWallet()));
    return preferenceService.setPushEnabled(walletAddress, true);
  }

  @Transactional
  public NotificationPreferenceResponse disable(String walletAddress, PushSubscriptionDisableRequest request) {
    walletMutationLock.lock(walletAddress);
    String endpoint = request == null ? null : request.endpoint();
    if (hasText(endpoint)) {
      validateEndpoint(endpoint);
      pushSubscriptionRepository.disableForWalletEndpoint(walletAddress, endpoint);
    } else {
      pushSubscriptionRepository.disableForWallet(walletAddress);
    }
    return preferenceService.setPushEnabled(walletAddress, pushSubscriptionRepository.countActive(walletAddress) > 0);
  }

  public PushSubscriptionStatusResponse status(String walletAddress, PushSubscriptionStatusRequest request) {
    String endpoint = request == null ? null : request.endpoint();
    int walletSubscriptionCount = pushSubscriptionRepository.countActive(walletAddress);
    if (!hasText(endpoint)) {
      return new PushSubscriptionStatusResponse(false, walletSubscriptionCount);
    }
    validateEndpoint(endpoint);
    return new PushSubscriptionStatusResponse(
        pushSubscriptionRepository.isActiveForWalletEndpoint(walletAddress, endpoint),
        walletSubscriptionCount);
  }

  private void validate(PushSubscriptionRequest request) {
    if (request.keys() == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Push notification setup was incomplete. Please try again.");
    }
    validateEndpoint(request.endpoint());
    validateSubscriptionKeys(request.keys().p256dh(), request.keys().auth());
  }

  private void validateSubscriptionKeys(String p256dhValue, String authValue) {
    byte[] p256dh = decodeBase64Url(p256dhValue);
    byte[] auth = decodeBase64Url(authValue);
    if (p256dh.length != 65 || p256dh[0] != 0x04 || auth.length != 16) {
      throw invalidSubscription();
    }
  }

  private byte[] decodeBase64Url(String value) {
    if (!hasText(value)) throw invalidSubscription();
    try {
      return Base64.getUrlDecoder().decode(value.trim());
    } catch (IllegalArgumentException exception) {
      throw invalidSubscription();
    }
  }

  private ApiException invalidSubscription() {
    return new ApiException(
        HttpStatus.BAD_REQUEST,
        "Push notification setup was incomplete. Please try again.");
  }

  private void validateEndpoint(String endpointValue) {
    try {
      URI endpoint = URI.create(endpointValue.trim());
      String host = endpoint.getHost();
      if (!"https".equalsIgnoreCase(endpoint.getScheme())
          || host == null
          || endpoint.getUserInfo() != null
          || endpoint.getFragment() != null
          || (endpoint.getPort() != -1 && endpoint.getPort() != 443)
          || !isAllowedPushServiceHost(host)) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Push notification setup was incomplete. Please try again.");
      }
    } catch (IllegalArgumentException exception) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Push notification setup was incomplete. Please try again.");
    }
  }

  private boolean isAllowedPushServiceHost(String endpointHost) {
    String host = endpointHost.toLowerCase(Locale.ROOT);
    return properties.getPush().getAllowedEndpointHosts().stream()
        .map(value -> value == null ? "" : value.trim().toLowerCase(Locale.ROOT))
        .filter(value -> !value.isBlank())
        .anyMatch(value -> value.startsWith(".")
            ? host.length() > value.length() && host.endsWith(value)
            : host.equals(value));
  }

  private boolean hasText(String value) {
    return value != null && !value.isBlank();
  }
}
