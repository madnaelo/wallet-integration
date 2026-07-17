package com.wallet.swap.auth;

import com.wallet.swap.auth.AuthModels.NonceResponse;
import com.wallet.swap.auth.AuthModels.VerifyResponse;
import com.wallet.swap.common.ApiException;
import com.wallet.swap.config.AuthProperties;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.ResponseCookie;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
  public static final String SESSION_COOKIE_NAME = "wallet_session";
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

  @Transactional
  public VerifyResponse verify(String rawWalletAddress, String signature) {
    String walletAddress = normalizeOrBadRequest(rawWalletAddress);
    AuthRepository.StoredNonce storedNonce = authRepository.findNonceForUpdate(walletAddress)
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

  public VerifyResponse clientVerifyResponse(VerifyResponse session) {
    return authProperties.isExposeAccessToken()
        ? session
        : new VerifyResponse(session.walletAddress(), null, session.expiresAt());
  }

  public ResponseCookie sessionCookie(String accessToken, Instant expiresAt) {
    long maxAgeSeconds = Math.max(1, Duration.between(Instant.now(), expiresAt).toSeconds());
    return ResponseCookie.from(SESSION_COOKIE_NAME, accessToken)
        .httpOnly(true)
        .secure(authProperties.isSessionCookieSecure())
        .sameSite(sameSite())
        .path("/")
        .maxAge(Duration.ofSeconds(maxAgeSeconds))
        .build();
  }

  public ResponseCookie expiredSessionCookie() {
    return ResponseCookie.from(SESSION_COOKIE_NAME, "")
        .httpOnly(true)
        .secure(authProperties.isSessionCookieSecure())
        .sameSite(sameSite())
        .path("/")
        .maxAge(Duration.ZERO)
        .build();
  }

  public String authenticateBearerToken(String authorizationHeader) {
    return authenticateToken(extractBearerToken(authorizationHeader));
  }

  public String authenticateRequest(String authorizationHeader, HttpServletRequest request) {
    String cookieToken = sessionCookieValue(request);
    if (cookieToken != null && !cookieToken.isBlank()) return authenticateToken(cookieToken);
    return authenticateBearerToken(authorizationHeader);
  }

  public void logout(String authorizationHeader, HttpServletRequest request) {
    String token = sessionCookieValue(request);
    if (token == null || token.isBlank()) token = extractBearerTokenOrNull(authorizationHeader);
    if (token == null || token.isBlank()) return;
    authRepository.deleteSessionByTokenHash(tokenHasher.sha256(token));
  }

  private String authenticateToken(String token) {
    return authRepository.findWalletBySessionTokenHash(tokenHasher.sha256(token), Instant.now())
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Session expired or invalid."));
  }

  private String extractBearerToken(String authorizationHeader) {
    String token = extractBearerTokenOrNull(authorizationHeader);
    if (token == null || token.isBlank()) throw new ApiException(HttpStatus.UNAUTHORIZED, "Missing bearer token.");
    return token;
  }

  private String extractBearerTokenOrNull(String authorizationHeader) {
    if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) return null;
    String token = authorizationHeader.substring("Bearer ".length()).trim();
    return token.isBlank() ? null : token;
  }

  private String sessionCookieValue(HttpServletRequest request) {
    if (request == null || request.getCookies() == null) return null;
    for (Cookie cookie : request.getCookies()) {
      if (SESSION_COOKIE_NAME.equals(cookie.getName())) return cookie.getValue();
    }
    return null;
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
        Sign in to Swap Assistant.

        This proves ownership of wallet %s.
        It does not grant custody or permission to move funds.

        Domain: %s
        URI: %s
        Nonce: %s
        Expires: %s
        """.formatted(
        walletAddress,
        nonBlank(authProperties.getSigningDomain(), "localhost:3000"),
        nonBlank(authProperties.getSigningUri(), "http://localhost:3000"),
        nonce,
        expiresAt);
  }

  private String secureToken(int bytes) {
    byte[] tokenBytes = new byte[bytes];
    SECURE_RANDOM.nextBytes(tokenBytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
  }

  private String nonBlank(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value.trim();
  }

  private String sameSite() {
    String configured = nonBlank(authProperties.getSessionCookieSameSite(), "Lax");
    String normalized = configured.substring(0, 1).toUpperCase(Locale.ROOT)
        + configured.substring(1).toLowerCase(Locale.ROOT);
    return switch (normalized) {
      case "Strict", "Lax", "None" -> normalized;
      default -> "Lax";
    };
  }
}
