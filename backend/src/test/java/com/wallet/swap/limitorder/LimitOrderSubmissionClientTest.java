package com.wallet.swap.limitorder;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.config.LimitOrderProperties;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class LimitOrderSubmissionClientTest {
  @Test
  void doesNotSubmitOneInchWhenProviderIsDisabled() {
    var objectMapper = new ObjectMapper();
    var client = new LimitOrderSubmissionClient(
        new LimitOrderProperties(),
        RestClient.builder(),
        objectMapper);

    var result = client.submit(
        10L,
        LimitOrderCapabilityService.ONEINCH_PROVIDER,
        "0x" + "ab".repeat(32),
        "0x" + "cd".repeat(65),
        objectMapper.createObjectNode());

    assertThat(result.submitted()).isFalse();
    assertThat(result.skipped()).isTrue();
  }
}
