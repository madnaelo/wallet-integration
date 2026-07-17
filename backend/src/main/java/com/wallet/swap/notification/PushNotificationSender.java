package com.wallet.swap.notification;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.common.SafeErrorDetails;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.NotificationMessageFormatter.PushNotificationPayload;
import com.wallet.swap.notification.PushSubscriptionRepository.PushSubscriptionRecord;
import java.security.Security;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import nl.martijndwars.webpush.Encoding;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import org.apache.http.HttpResponse;
import org.apache.http.util.EntityUtils;
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
    if (!isEnabled()) throw new IllegalStateException("Push notifications are disabled.");

    List<PushSubscriptionRecord> subscriptions = pushSubscriptionRepository.findActiveForWallet(walletAddress);
    if (subscriptions.isEmpty()) throw new IllegalStateException("No push notification subscription is active.");

    PushService pushService = buildPushService();
    String payloadJson = toJson(payload);
    List<String> failures = new ArrayList<>();

    for (PushSubscriptionRecord subscription : subscriptions) {
      try {
        HttpResponse response = pushService.send(
            new Notification(
                subscription.endpoint(),
                subscription.p256dh(),
                subscription.authSecret(),
                payloadJson),
            Encoding.AES128GCM);
        int status = response.getStatusLine().getStatusCode();
        if (status == 404 || status == 410) {
          pushSubscriptionRepository.disableEndpoint(subscription.endpoint());
        }
        if (status >= 400) {
          String failure = pushFailure(response);
          log.warn(
              "Push notification delivery failed for wallet {} subscription {}: {}.",
              maskWallet(walletAddress),
              subscription.id(),
              failure);
          failures.add(failure);
        }
      } catch (Exception exception) {
        String failure = safeFailure(exception);
        log.warn(
            "Push notification delivery failed for wallet {} subscription {}: {}.",
            maskWallet(walletAddress),
            subscription.id(),
            failure,
            exception);
        failures.add(failure);
      }
    }

    if (failures.size() == subscriptions.size()) {
      throw new IllegalStateException("Push notification could not be delivered: " + summarizeFailures(failures));
    }
    if (!failures.isEmpty()) {
      log.warn(
          "Push notification reached at least one device for wallet {}, but {} of {} device(s) failed: {}.",
          maskWallet(walletAddress),
          failures.size(),
          subscriptions.size(),
          summarizeFailures(failures));
    }
  }

  private PushService buildPushService() {
    try {
      return new PushService(
          properties.getPush().getVapidPublicKey().trim(),
          properties.getPush().getVapidPrivateKey().trim(),
          properties.getPush().getVapidSubject().trim());
    } catch (Exception exception) {
      throw new IllegalStateException("Push notifications are not configured correctly.", exception);
    }
  }

  private String toJson(PushNotificationPayload payload) {
    try {
      return objectMapper.writeValueAsString(payload);
    } catch (JsonProcessingException exception) {
      throw new IllegalArgumentException("Push notification could not be prepared.", exception);
    }
  }

  private boolean hasText(String value) {
    return value != null && !value.isBlank();
  }

  private String safeFailure(Exception exception) {
    return SafeErrorDetails.summarize(exception);
  }

  private String pushFailure(HttpResponse response) {
    String failure = "push service returned HTTP " + response.getStatusLine().getStatusCode();
    EntityUtils.consumeQuietly(response.getEntity());
    return failure;
  }

  private String summarizeFailures(List<String> failures) {
    Set<String> uniqueFailures = new LinkedHashSet<>(failures);
    List<String> summary = new ArrayList<>();
    int remaining = 0;
    for (String failure : uniqueFailures) {
      if (summary.size() < 3) {
        summary.add(failure);
      } else {
        remaining++;
      }
    }
    String joined = String.join("; ", summary);
    return remaining > 0 ? joined + "; +" + remaining + " more" : joined;
  }

  private String maskWallet(String walletAddress) {
    if (walletAddress == null || walletAddress.length() <= 12) return "unknown";
    return walletAddress.substring(0, 6) + "..." + walletAddress.substring(walletAddress.length() - 4);
  }
}
