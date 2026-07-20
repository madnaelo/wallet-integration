package com.wallet.swap.history;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.config.LifiProperties;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class LifiTransferStatusClientTest {
  private final ObjectMapper objectMapper = new ObjectMapper();
  private final LifiTransferStatusClient client = new LifiTransferStatusClient(
      new LifiProperties(),
      RestClient.builder());

  @Test
  void mapsCompletedDeliveryAndDestinationTransaction() throws Exception {
    var result = client.parse(objectMapper.readTree("""
        {
          "status": "DONE",
          "substatus": "COMPLETED",
          "receiving": {"txHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
        }
        """));

    assertThat(result.checked()).isTrue();
    assertThat(result.status()).isEqualTo("confirmed");
    assertThat(result.destinationTransactionHash())
        .isEqualTo("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  }

  @Test
  void mapsRefundsSeparatelyFromFailures() throws Exception {
    var refunded = client.parse(objectMapper.readTree("""
        {"status": "FAILED", "substatus": "REFUNDED"}
        """));
    var failed = client.parse(objectMapper.readTree("""
        {"status": "FAILED", "substatus": "UNKNOWN_ERROR"}
        """));
    var doneRefunded = client.parse(objectMapper.readTree("""
        {"status": "DONE", "substatus": "REFUNDED"}
        """));

    assertThat(refunded.status()).isEqualTo("refunded");
    assertThat(failed.status()).isEqualTo("failed");
    assertThat(doneRefunded.status()).isEqualTo("refunded");
  }

  @Test
  void keepsPendingAndNotFoundTransfersOpen() throws Exception {
    assertThat(client.parse(objectMapper.readTree("{\"status\":\"PENDING\"}")).status())
        .isEqualTo("submitted");
    assertThat(client.parse(objectMapper.readTree("{\"status\":\"NOT_FOUND\"}")).status())
        .isEqualTo("submitted");
  }

  @Test
  void rejectsUnknownProviderStatuses() throws Exception {
    var result = client.parse(objectMapper.readTree("{\"status\":\"MYSTERY\"}"));

    assertThat(result.checked()).isFalse();
    assertThat(result.error()).contains("unknown");
  }
}
