package com.wallet.swap.limitorder;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;
import java.util.HexFormat;

final class LimitOrderPayloadIntegrity {
  static final int CURRENT_VERSION = 2;

  private LimitOrderPayloadIntegrity() {}

  static String sha256(JsonNode payload, ObjectMapper objectMapper) {
    try {
      String canonicalJson = objectMapper.writeValueAsString(canonicalize(payload, objectMapper));
      return HexFormat.of().formatHex(
          MessageDigest.getInstance("SHA-256").digest(canonicalJson.getBytes(StandardCharsets.UTF_8)));
    } catch (JsonProcessingException | NoSuchAlgorithmException exception) {
      throw new IllegalStateException("Signed order payload could not be hashed.", exception);
    }
  }

  private static JsonNode canonicalize(JsonNode node, ObjectMapper objectMapper) {
    if (node.isObject()) {
      ObjectNode result = objectMapper.createObjectNode();
      List<String> fieldNames = new ArrayList<>();
      node.fieldNames().forEachRemaining(fieldNames::add);
      fieldNames.sort(String::compareTo);
      fieldNames.forEach(fieldName -> result.set(fieldName, canonicalize(node.get(fieldName), objectMapper)));
      return result;
    }
    if (node.isArray()) {
      ArrayNode result = objectMapper.createArrayNode();
      node.forEach(item -> result.add(canonicalize(item, objectMapper)));
      return result;
    }
    return node.deepCopy();
  }
}
