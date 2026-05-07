package com.wallet.swap.auth;

import com.wallet.swap.auth.AuthModels.NonceRequest;
import com.wallet.swap.auth.AuthModels.NonceResponse;
import com.wallet.swap.auth.AuthModels.VerifyRequest;
import com.wallet.swap.auth.AuthModels.VerifyResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
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
  public VerifyResponse verify(@Valid @RequestBody VerifyRequest request) {
    return authService.verify(request.walletAddress(), request.signature());
  }
}
