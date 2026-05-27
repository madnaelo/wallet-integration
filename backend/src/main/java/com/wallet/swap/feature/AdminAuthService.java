package com.wallet.swap.feature;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.config.FeatureProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class AdminAuthService {
  private final FeatureProperties featureProperties;

  public AdminAuthService(FeatureProperties featureProperties) {
    this.featureProperties = featureProperties;
  }

  public void requireAdminApiKey(String providedKey) {
    String expectedKey = featureProperties.getAdminApiKey() == null ? "" : featureProperties.getAdminApiKey().trim();
    if (expectedKey.isBlank()) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Admin API key is not configured.");
    }
    if (providedKey == null || providedKey.isBlank()) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Missing admin API key.");
    }
    byte[] expected = sha256(expectedKey);
    byte[] provided = sha256(providedKey.trim());
    if (!MessageDigest.isEqual(expected, provided)) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid admin API key.");
    }
  }

  private byte[] sha256(String value) {
    try {
      return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("SHA-256 is not available.", exception);
    }
  }
}
