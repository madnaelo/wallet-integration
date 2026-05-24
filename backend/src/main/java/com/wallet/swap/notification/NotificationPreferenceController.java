package com.wallet.swap.notification;

import com.wallet.swap.auth.AuthService;
import com.wallet.swap.notification.NotificationModels.NotificationPreferenceRequest;
import com.wallet.swap.notification.NotificationModels.NotificationPreferenceResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications/preferences")
public class NotificationPreferenceController {
  private final AuthService authService;
  private final NotificationPreferenceService preferenceService;

  public NotificationPreferenceController(AuthService authService, NotificationPreferenceService preferenceService) {
    this.authService = authService;
    this.preferenceService = preferenceService;
  }

  @GetMapping
  public NotificationPreferenceResponse get(
      @RequestHeader(name = "Authorization", required = false) String authorization) {
    String walletAddress = authService.authenticateBearerToken(authorization);
    return preferenceService.get(walletAddress);
  }

  @PutMapping
  public NotificationPreferenceResponse save(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      @Valid @RequestBody NotificationPreferenceRequest request) {
    String walletAddress = authService.authenticateBearerToken(authorization);
    return preferenceService.save(walletAddress, request);
  }
}
