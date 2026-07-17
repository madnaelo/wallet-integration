package com.wallet.swap.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class AuthModels {
  private AuthModels() {}

  public record NonceRequest(@NotBlank @Size(max = 128) String walletAddress) {}

  public record NonceResponse(UUID nonceId, String walletAddress, String nonce, String message, Instant expiresAt) {}

  public record VerifyRequest(
      UUID nonceId,
      @NotBlank @Size(max = 128) String walletAddress,
      @NotBlank @Size(max = 512) String signature) {}

  public record VerifyResponse(String walletAddress, String accessToken, Instant expiresAt) {}

  public record AuthenticatedWallet(String walletAddress) {}
}
