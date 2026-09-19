package com.wallet.swap.revenue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.common.ApiException;
import com.wallet.swap.revenue.RevenueModels.*;
import jakarta.validation.Validator;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.GeneralSecurityException;
import java.time.Instant;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class RevenueIntegrity {
  private static final String PURPOSE = "swap-revenue-v1\n";
  private final RevenueProperties properties;
  private final ObjectMapper mapper;
  private final Validator validator;

  public RevenueIntegrity(RevenueProperties properties, ObjectMapper mapper, Validator validator) {
    this.properties = properties;
    this.mapper = mapper;
    this.validator = validator;
  }

  public Batch verify(Envelope envelope, boolean fresh) {
    if (!properties.enabled()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Revenue evidence is disabled.");
    if (envelope == null || !validator.validate(envelope).isEmpty()) throw invalid();
    String expected = sign(envelope.payload(), properties.ingestSecret());
    if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII),
        envelope.signature().getBytes(StandardCharsets.US_ASCII))) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid evidence signature.");
    }
    try {
      Batch batch = mapper.readValue(envelope.payload(), Batch.class);
      if (!validator.validate(batch).isEmpty()) throw invalid();
      if (fresh && (batch.issuedAt() < Instant.now().minusSeconds(120).toEpochMilli()
          || batch.issuedAt() > Instant.now().plusSeconds(30).toEpochMilli())) throw invalid();
      if (batch.quotes().stream().map(Snapshot::id).distinct().count() != batch.quotes().size()
          || batch.outcomes().stream().map(Outcome::provider).distinct().count() != batch.outcomes().size()) throw invalid();
      for (Snapshot quote : batch.quotes()) validateAmounts(quote);
      return batch;
    } catch (java.io.IOException exception) {
      throw invalid();
    }
  }

  private void validateAmounts(Snapshot quote) {
    java.math.BigInteger sell = new java.math.BigInteger(quote.sellAmount());
    java.math.BigInteger fee = new java.math.BigInteger(quote.expectedFee());
    if (sell.signum() <= 0 || fee.signum() <= 0 || sell.bitLength() > 256 || fee.bitLength() > 256
        || new java.math.BigInteger(quote.buyAmount()).signum() <= 0
        || new java.math.BigInteger(quote.minimumAmount()).compareTo(new java.math.BigInteger(quote.buyAmount())) > 0) throw invalid();
    if (!sameAsset(quote.sellToken().address(), quote.feeToken().address())
        || quote.sellToken().decimals() != quote.feeToken().decimals()) throw invalid();
    if ("0x".equals(quote.provider()) && (!"sell_amount_floor".equals(quote.feeBasis())
        || !fee.equals(sell.multiply(java.math.BigInteger.valueOf(quote.feeBps())).divide(java.math.BigInteger.valueOf(10000)))
        || !quote.beneficiary().matches("0x[0-9a-fA-F]{40}")
        || !quote.taker().equalsIgnoreCase(quote.owner()))) throw invalid();
  }

  public static boolean sameAsset(String first, String second) {
    return assetKey(first).equals(assetKey(second));
  }
  public static String assetKey(String value) {
    if ("ETH".equals(value) || "0x0000000000000000000000000000000000000000".equals(value)
        || "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee".equalsIgnoreCase(value)) return "native";
    return value.matches("0x[0-9a-fA-F]{40}") ? value.toLowerCase(java.util.Locale.ROOT) : value;
  }
  public static String sign(String payload, String secret) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return HexFormat.of().formatHex(mac.doFinal((PURPOSE + payload).getBytes(StandardCharsets.UTF_8)));
    } catch (GeneralSecurityException exception) { throw new IllegalStateException("HMAC unavailable", exception); }
  }
  public static String hash(String value) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (GeneralSecurityException exception) { throw new IllegalStateException("SHA-256 unavailable", exception); }
  }
  private ApiException invalid() { return new ApiException(HttpStatus.BAD_REQUEST, "Invalid revenue evidence."); }
}
