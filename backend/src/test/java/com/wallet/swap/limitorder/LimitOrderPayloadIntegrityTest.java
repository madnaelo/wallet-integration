package com.wallet.swap.limitorder;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class LimitOrderPayloadIntegrityTest {
  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void ignoresWhitespaceAndObjectFieldOrder() throws Exception {
    String first = LimitOrderPayloadIntegrity.sha256(
        objectMapper.readTree("{\"provider\":\"cow\",\"data\":{\"amount\":\"10\",\"token\":\"A\"}}"),
        objectMapper);
    String second = LimitOrderPayloadIntegrity.sha256(
        objectMapper.readTree("""
            {
              "data": {"token": "A", "amount": "10"},
              "provider": "cow"
            }
            """),
        objectMapper);

    assertThat(second).isEqualTo(first);
  }

  @Test
  void detectsAChangedSignedValue() throws Exception {
    String original = LimitOrderPayloadIntegrity.sha256(
        objectMapper.readTree("{\"data\":{\"amount\":\"10\"}}"),
        objectMapper);
    String changed = LimitOrderPayloadIntegrity.sha256(
        objectMapper.readTree("{\"data\":{\"amount\":\"11\"}}"),
        objectMapper);

    assertThat(changed).isNotEqualTo(original);
  }
}
