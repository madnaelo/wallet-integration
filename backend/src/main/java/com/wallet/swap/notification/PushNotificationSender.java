package com.wallet.swap.notification;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.NotificationMessageFormatter.PushNotificationPayload;
import com.wallet.swap.notification.PushSubscriptionRepository.PushSubscriptionRecord;
import java.security.Security;
import java.util.ArrayList;
import java.util.List;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import org.apache.http.HttpResponse;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class PushNotificationSender {
  private static final Logger log = LoggerFactory.getLogger(PushNotificationSender.class);

  private final NotificationProperties properties;
  private final PushSubscriptionRepository pushSubscriptionRepository;
  private final ObjectMapper objectMapper;

  public PushNotificationSender(
      NotificationProperties properties,
      PushSubscriptionRepository pushSubscriptionRepository,
      ObjectMapper objectMapper) {
    this.properties = properties;
    this.pushSubscriptionRepository = pushSubscriptionRepository;
    this.objectMapper = objectMapper;
    if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
      Security.addProvider(new BouncyCastleProvider());
    }
  }

  public boolean isEnabled() {
    return properties.getPush().isEnabled()
        && hasText(properties.getPush().getVapidPublicKey())
        && hasText(properties.getPush().getVapidPrivateKey())
        && hasText(properties.getPush().getVapidSubject());
  }

  public void send(String walletAddress, PushNotificationPayload payload) {
    if (!isEnabled()) throw new IllegalStateException("Browser notifications are disabled.");

    List<PushSubscriptionRecord> subscriptions = pushSubscriptionRepository.findActiveForWallet(walletAddress);
    if (subscriptions.isEmpty()) throw new IllegalStateException("No browser notification subscription is active.");

    PushService pushService = buildPushService();
    String payloadJson = toJson(payload);
    List<String> failures = new ArrayList<>();

    for (PushSubscriptionRecord subscription : subscriptions) {
      try {
        HttpResponse response = pushService.send(new Notification(
            subscription.endpoint(),
            subscription.p256dh(),
            subscription.authSecret(),
            payloadJson));
        int status = response.getStatusLine().getStatusCode();
        if (status == 404 || status == 410) {
          pushSubscriptionRepository.disableEndpoint(subscription.endpoint());
        }
        if (status >= 400) {
          failures.add("Delivery failed with status " + status);
        }
      } catch (Exception exception) {
        log.warn("Browser notification delivery failed for wallet {}.", walletAddress, exception);
        failures.add(exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage());
      }
    }

    if (failures.size() == subscriptions.size()) {
      throw new IllegalStateException("Browser notification could not be delivered.");
    }
  }

  private PushService buildPushService() {
    try {
      return new PushService(
          properties.getPush().getVapidPublicKey().trim(),
          properties.getPush().getVapidPrivateKey().trim(),
          properties.getPush().getVapidSubject().trim());
    } catch (Exception exception) {
      throw new IllegalStateException("Browser notifications are not configured correctly.", exception);
    }
  }

  private String toJson(PushNotificationPayload payload) {
    try {
      return objectMapper.writeValueAsString(payload);
    } catch (JsonProcessingException exception) {
      throw new IllegalArgumentException("Browser notification could not be prepared.", exception);
    }
  }

  private boolean hasText(String value) {
    return value != null && !value.isBlank();
  }
}
