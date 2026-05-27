package com.wallet.swap.notification;

import com.wallet.swap.auth.AuthService;
import com.wallet.swap.notification.NotificationModels.NotificationPreferenceRequest;
import com.wallet.swap.notification.NotificationModels.NotificationPreferenceResponse;
import com.wallet.swap.notification.TelegramLinkModels.TelegramLinkStartResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
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
  private final NotificationPreferenceService preferenceService;
  private final TelegramLinkService telegramLinkService;

  public NotificationPreferenceController(
      AuthService authService,
      NotificationPreferenceService preferenceService,
      TelegramLinkService telegramLinkService) {
    this.authService = authService;
    this.preferenceService = preferenceService;
    this.telegramLinkService = telegramLinkService;
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
}
