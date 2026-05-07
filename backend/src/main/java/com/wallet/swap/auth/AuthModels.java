package com.wallet.swap.auth;

import jakarta.validation.constraints.NotBlank;
import java.time.Instant;

public final class AuthModels {
  private AuthModels() {}

  public record NonceRequest(@NotBlank String walletAddress) {}

  public record NonceResponse(String walletAddress, String nonce, String message, Instant expiresAt) {}

  public record VerifyRequest(@NotBlank String walletAddress, @NotBlank String signature) {}

  public record VerifyResponse(String walletAddress, String accessToken, Instant expiresAt) {}

  public record AuthenticatedWallet(String walletAddress) {}
}
