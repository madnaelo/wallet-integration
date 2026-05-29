package com.wallet.swap.notification;

import com.wallet.swap.auth.AuthService;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.NotificationModels.NotificationPreferenceRequest;
import com.wallet.swap.notification.NotificationModels.NotificationPreferenceResponse;
import com.wallet.swap.notification.NotificationModels.PushNotificationConfigResponse;
import com.wallet.swap.notification.NotificationModels.PushSubscriptionDisableRequest;
import com.wallet.swap.notification.NotificationModels.PushSubscriptionRequest;
import com.wallet.swap.notification.NotificationModels.PushSubscriptionStatusRequest;
import com.wallet.swap.notification.NotificationModels.PushSubscriptionStatusResponse;
import com.wallet.swap.notification.TelegramLinkModels.TelegramLinkStartResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications/preferences")
public class NotificationPreferenceController {
  private final AuthService authService;
  private final NotificationProperties notificationProperties;
  private final NotificationPreferenceService preferenceService;
  private final TelegramLinkService telegramLinkService;
  private final PushSubscriptionService pushSubscriptionService;

  public NotificationPreferenceController(
      AuthService authService,
      NotificationProperties notificationProperties,
      NotificationPreferenceService preferenceService,
      TelegramLinkService telegramLinkService,
      PushSubscriptionService pushSubscriptionService) {
    this.authService = authService;
    this.notificationProperties = notificationProperties;
    this.preferenceService = preferenceService;
    this.telegramLinkService = telegramLinkService;
    this.pushSubscriptionService = pushSubscriptionService;
  }

  @GetMapping("/push-config")
  public PushNotificationConfigResponse pushConfig() {
    boolean enabled = pushSubscriptionService.isAvailable();
    return new PushNotificationConfigResponse(
        enabled,
        enabled ? notificationProperties.getPush().getVapidPublicKey().trim() : "");
  }

  @GetMapping
  public NotificationPreferenceResponse get(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return preferenceService.get(walletAddress);
  }

  @PutMapping
  public NotificationPreferenceResponse save(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest,
      @Valid @RequestBody NotificationPreferenceRequest request) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return preferenceService.save(walletAddress, request);
  }

  @PostMapping("/telegram-link")
  public TelegramLinkStartResponse startTelegramLink(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return telegramLinkService.start(walletAddress);
  }

  @PostMapping("/telegram-link/complete")
  public NotificationPreferenceResponse completeTelegramLink(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return telegramLinkService.complete(walletAddress);
  }

  @PostMapping("/push-subscriptions")
  public NotificationPreferenceResponse savePushSubscription(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      @RequestHeader(name = "User-Agent", required = false) String userAgent,
      HttpServletRequest httpRequest,
      @Valid @RequestBody PushSubscriptionRequest request) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return pushSubscriptionService.subscribe(walletAddress, request, userAgent);
  }

  @DeleteMapping("/push-subscriptions")
  public NotificationPreferenceResponse disablePushSubscriptions(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest,
      @RequestBody(required = false) PushSubscriptionDisableRequest request) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return pushSubscriptionService.disable(walletAddress, request);
  }

  @PostMapping("/push-subscriptions/status")
  public PushSubscriptionStatusResponse getPushSubscriptionStatus(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest,
      @RequestBody(required = false) PushSubscriptionStatusRequest request) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return pushSubscriptionService.status(walletAddress, request);
  }
}
