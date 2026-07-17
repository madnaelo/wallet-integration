package com.wallet.swap.limitorder;

import com.wallet.swap.common.ApiException;
import java.math.BigInteger;
import java.time.Instant;
import org.springframework.http.HttpStatus;

final class OneInchMakerTraitsValidator {
  private static final BigInteger UINT_40_MASK = BigInteger.ONE.shiftLeft(40).subtract(BigInteger.ONE);
  private static final BigInteger UINT_80_MASK = BigInteger.ONE.shiftLeft(80).subtract(BigInteger.ONE);
  private static final BigInteger UINT_256_MASK = BigInteger.ONE.shiftLeft(256).subtract(BigInteger.ONE);
  private static final BigInteger SAFE_HIGH_BITS = BigInteger.ONE.shiftLeft(255);

  private OneInchMakerTraitsValidator() {}

  static BigInteger validate(String makerTraits, Instant expiresAt) {
    try {
      BigInteger traits = new BigInteger(makerTraits);
      if (traits.signum() < 0 || traits.bitLength() > 256) {
        throw invalidSettings();
      }
      long signedExpiration = traits.shiftRight(80).and(UINT_40_MASK).longValueExact();
      if (expiresAt == null || signedExpiration != expiresAt.getEpochSecond()) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order expiry does not match.");
      }
      if (traits.and(UINT_80_MASK).signum() != 0
          || traits.shiftRight(160).and(UINT_40_MASK).signum() != 0) {
        throw invalidSettings();
      }
      BigInteger lowBits = BigInteger.ONE.shiftLeft(200).subtract(BigInteger.ONE);
      BigInteger highBits = traits.and(UINT_256_MASK.xor(lowBits));
      if (!highBits.equals(SAFE_HIGH_BITS)) {
        throw invalidSettings();
      }
      return traits;
    } catch (ApiException exception) {
      throw exception;
    } catch (Exception exception) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order expiry is invalid.");
    }
  }

  private static ApiException invalidSettings() {
    return new ApiException(HttpStatus.BAD_REQUEST, "Signed order settings are not supported.");
  }
}
