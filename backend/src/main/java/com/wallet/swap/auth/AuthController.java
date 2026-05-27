package com.wallet.swap.auth;

import com.wallet.swap.auth.AuthModels.NonceRequest;
import com.wallet.swap.auth.AuthModels.NonceResponse;
import com.wallet.swap.auth.AuthModels.VerifyRequest;
import com.wallet.swap.auth.AuthModels.VerifyResponse;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final AuthService authService;

  public AuthController(AuthService authService) {
    this.authService = authService;
  }

  @PostMapping("/nonce")
  public NonceResponse nonce(@Valid @RequestBody NonceRequest request) {
    return authService.createNonce(request.walletAddress());
  }

  @PostMapping("/verify")
  public VerifyResponse verify(@Valid @RequestBody VerifyRequest request, HttpServletResponse response) {
    VerifyResponse session = authService.verify(request.walletAddress(), request.signature());
    response.addHeader(HttpHeaders.SET_COOKIE, authService.sessionCookie(session.accessToken(), session.expiresAt()).toString());
    return authService.clientVerifyResponse(session);
  }

  @PostMapping("/logout")
  public void logout(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest request,
      HttpServletResponse response) {
    authService.logout(authorization, request);
    response.addHeader(HttpHeaders.SET_COOKIE, authService.expiredSessionCookie().toString());
  }
}
