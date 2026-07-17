package com.wallet.swap.limitorder;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.common.ApiException;
import java.math.BigInteger;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.web3j.crypto.Keys;
import org.web3j.crypto.Sign;
import org.web3j.crypto.StructuredDataEncoder;
import org.web3j.utils.Numeric;

@Component
public class LimitOrderSignatureVerifier {
  private static final BigInteger SECP256K1_ORDER =
      new BigInteger("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141", 16);

  private final ObjectMapper objectMapper;

  public LimitOrderSignatureVerifier(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public void verify(
      String expectedWalletAddress,
      String expectedOrderHash,
      String signature,
      JsonNode typedData) {
    try {
      byte[] digest = typedDataDigest(typedData, "Order", "Signed order could not be verified.");
      String actualOrderHash = Numeric.toHexString(digest).toLowerCase(Locale.ROOT);
      if (!actualOrderHash.equals(expectedOrderHash.trim().toLowerCase(Locale.ROOT))) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order hash does not match the order terms.");
      }
      verifyDigestSigner(
          expectedWalletAddress,
          signature,
          digest,
          "Signed order owner does not match the signed-in wallet.",
          "Signed order could not be verified.");
    } catch (ApiException exception) {
      throw exception;
    } catch (Exception exception) {
      throw invalidSignature("Signed order could not be verified.");
    }
  }

  public void verifyTypedDataSigner(
      String expectedWalletAddress,
      String expectedPrimaryType,
      String signature,
      JsonNode typedData) {
    try {
      byte[] digest = typedDataDigest(
          typedData,
          expectedPrimaryType,
          "Signed cancellation could not be verified.");
      verifyDigestSigner(
          expectedWalletAddress,
          signature,
          digest,
          "Signed cancellation owner does not match the signed-in wallet.",
          "Signed cancellation could not be verified.");
    } catch (ApiException exception) {
      throw exception;
    } catch (Exception exception) {
      throw invalidSignature("Signed cancellation could not be verified.");
    }
  }

  private byte[] typedDataDigest(JsonNode typedData, String expectedPrimaryType, String invalidMessage)
      throws Exception {
    if (!typedData.isObject()
        || !expectedPrimaryType.equals(typedData.path("primaryType").asText())
        || !typedData.path("types").isObject()
        || !typedData.path("domain").isObject()
        || !typedData.path("message").isObject()) {
      throw invalidSignature(invalidMessage);
    }
    return new StructuredDataEncoder(objectMapper.writeValueAsString(typedData)).hashStructuredData();
  }

  private void verifyDigestSigner(
      String expectedWalletAddress,
      String signature,
      byte[] digest,
      String ownerMismatchMessage,
      String invalidMessage)
      throws Exception {
    Sign.SignatureData signatureData = Sign.signatureDataFromHex(signature.trim());
    BigInteger r = new BigInteger(1, signatureData.getR());
    BigInteger s = new BigInteger(1, signatureData.getS());
    int recoveryId = signatureData.getV()[0] & 0xff;
    if (r.signum() <= 0
        || r.compareTo(SECP256K1_ORDER) >= 0
        || s.signum() <= 0
        || s.compareTo(SECP256K1_ORDER.shiftRight(1)) > 0
        || (recoveryId != 27 && recoveryId != 28)) {
      throw invalidSignature(invalidMessage);
    }
    BigInteger publicKey = Sign.signedMessageHashToKey(digest, signatureData);
    String recoveredAddress = "0x" + Keys.getAddress(publicKey);
    if (!recoveredAddress.equalsIgnoreCase(expectedWalletAddress)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ownerMismatchMessage);
    }
  }

  private ApiException invalidSignature(String message) {
    return new ApiException(HttpStatus.BAD_REQUEST, message);
  }
}
