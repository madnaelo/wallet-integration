package com.wallet.swap.auth;

import com.wallet.swap.auth.AuthModels.NonceResponse;
import com.wallet.swap.auth.AuthModels.VerifyResponse;
import com.wallet.swap.common.ApiException;
import com.wallet.swap.config.AuthProperties;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
  private static final SecureRandom SECURE_RANDOM = new SecureRandom();

  private final AuthProperties authProperties;
  private final AuthRepository authRepository;
  private final EthereumSignatureVerifier signatureVerifier;
  private final TokenHasher tokenHasher;

  public AuthService(
      AuthProperties authProperties,
      AuthRepository authRepository,
      EthereumSignatureVerifier signatureVerifier,
      TokenHasher tokenHasher) {
    this.authProperties = authProperties;
    this.authRepository = authRepository;
    this.signatureVerifier = signatureVerifier;
    this.tokenHasher = tokenHasher;
  }

  public NonceResponse createNonce(String rawWalletAddress) {
    String walletAddress = normalizeOrBadRequest(rawWalletAddress);
    String nonce = secureToken(24);
    Instant expiresAt = Instant.now().plus(authProperties.getNonceTtlMinutes(), ChronoUnit.MINUTES);
    String message = buildSignInMessage(walletAddress, nonce, expiresAt);

    authRepository.upsertUser(walletAddress);
    authRepository.saveNonce(walletAddress, nonce, message, expiresAt);

    return new NonceResponse(walletAddress, nonce, message, expiresAt);
  }

  public VerifyResponse verify(String rawWalletAddress, String signature) {
    String walletAddress = normalizeOrBadRequest(rawWalletAddress);
    AuthRepository.StoredNonce storedNonce = authRepository.findNonce(walletAddress)
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "No active sign-in nonce for this wallet."));

    if (storedNonce.expiresAt().isBefore(Instant.now())) {
      authRepository.deleteNonce(walletAddress);
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Sign-in nonce expired. Request a new one.");
    }

    if (!signatureVerifier.verifySignedMessage(walletAddress, storedNonce.message(), signature)) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Wallet signature could not be verified.");
    }

    String accessToken = secureToken(48);
    Instant sessionExpiresAt = Instant.now().plus(authProperties.getSessionTtlHours(), ChronoUnit.HOURS);
    authRepository.saveSession(UUID.randomUUID(), walletAddress, tokenHasher.sha256(accessToken), sessionExpiresAt);
    authRepository.deleteNonce(walletAddress);
    authRepository.markLastLogin(walletAddress);

    return new VerifyResponse(walletAddress, accessToken, sessionExpiresAt);
  }

  public String authenticateBearerToken(String authorizationHeader) {
    if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Missing bearer token.");
    }

    String token = authorizationHeader.substring("Bearer ".length()).trim();
    if (token.isBlank()) throw new ApiException(HttpStatus.UNAUTHORIZED, "Missing bearer token.");

    return authRepository.findWalletBySessionTokenHash(tokenHasher.sha256(token), Instant.now())
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Session expired or invalid."));
  }

  private String normalizeOrBadRequest(String walletAddress) {
    try {
      return WalletAddress.normalize(walletAddress);
    } catch (IllegalArgumentException exception) {
      throw new ApiException(HttpStatus.BAD_REQUEST, exception.getMessage());
    }
  }

  private String buildSignInMessage(String walletAddress, String nonce, Instant expiresAt) {
    return """
        Sign in to Wallet Swap Assistant.

        This proves ownership of wallet %s.
        It does not grant custody or permission to move funds.

        Nonce: %s
        Expires: %s
        """.formatted(walletAddress, nonce, expiresAt);
  }

  private String secureToken(int bytes) {
    byte[] tokenBytes = new byte[bytes];
    SECURE_RANDOM.nextBytes(tokenBytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
  }
}
