package com.wallet.swap.limitorder;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.config.LimitOrderProperties;
import com.wallet.swap.limitorder.LimitOrderRepository.StatusCheckCandidate;
import com.wallet.swap.limitorder.LimitOrderStatusClient.StatusResult;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class LimitOrderStatusClientTest {
  private static final String TX_HASH = "0x" + "ab".repeat(32);
  private final ObjectMapper objectMapper = new ObjectMapper();
  private final LimitOrderStatusClient client =
      new LimitOrderStatusClient(new LimitOrderProperties(), RestClient.builder());

  @Test
  void mapsOneInchTemporaryInvalidOrderToOpenWithActionableWarning() throws Exception {
    StatusResult result = client.parseOneInch(json("""
        {
          "orderStatus": 2,
          "remainingMakerAmount": "100",
          "events": []
        }
        """), Instant.parse("2030-01-02T00:00:00Z"), Instant.parse("2030-01-01T00:00:00Z"));

    assertThat(result.checked()).isTrue();
    assertThat(result.executionStatus()).isEqualTo("open");
    assertThat(result.warning()).contains("balance or approval");
  }

  @Test
  void mapsOneInchPartialAndFullFillsFromRemainingAmountAndEvents() throws Exception {
    String event = """
        {"action":"fill","transactionHash":"%s"}
        """.formatted(TX_HASH);
    StatusResult partial = client.parseOneInch(json("""
        {"orderStatus":1,"remainingMakerAmount":"50","events":[%s]}
        """.formatted(event)), Instant.parse("2030-01-02T00:00:00Z"), Instant.parse("2030-01-01T00:00:00Z"));
    StatusResult filled = client.parseOneInch(json("""
        {"orderStatus":1,"remainingMakerAmount":"0","events":[%s]}
        """.formatted(event)), Instant.parse("2030-01-02T00:00:00Z"), Instant.parse("2030-01-01T00:00:00Z"));

    assertThat(partial.executionStatus()).isEqualTo("partially_filled");
    assertThat(filled.executionStatus()).isEqualTo("filled");
    assertThat(filled.transactionHash()).isEqualTo(TX_HASH);
  }

  @Test
  void givesOneInchCancellationPrecedenceOverEarlierFills() throws Exception {
    StatusResult result = client.parseOneInch(json("""
        {
          "orderStatus": 3,
          "remainingMakerAmount": "25",
          "events": [
            {"action":"fill","transactionHash":"%s"},
            {"action":"cancel","transactionHash":"%s"}
          ]
        }
        """.formatted(TX_HASH, TX_HASH)), Instant.parse("2030-01-02T00:00:00Z"), Instant.parse("2030-01-01T00:00:00Z"));

    assertThat(result.executionStatus()).isEqualTo("cancelled");
  }

  @Test
  void mapsExpiredAndPermanentlyInvalidOneInchOrders() throws Exception {
    JsonNode response = json("""
        {"orderStatus":1,"remainingMakerAmount":"100","events":[]}
        """);
    StatusResult expired = client.parseOneInch(
        response, Instant.parse("2030-01-01T00:00:00Z"), Instant.parse("2030-01-01T00:00:01Z"));
    StatusResult invalid = client.parseOneInch(json("""
        {"orderStatus":3,"remainingMakerAmount":"100","events":[]}
        """), Instant.parse("2030-01-02T00:00:00Z"), Instant.parse("2030-01-01T00:00:00Z"));

    assertThat(expired.executionStatus()).isEqualTo("expired");
    assertThat(invalid.executionStatus()).isEqualTo("failed");
  }

  @Test
  void mapsCowLifecycleIncludingPartialFills() throws Exception {
    assertThat(client.parseCow(json("{\"status\":\"open\",\"executedSellAmount\":\"0\"}")).executionStatus())
        .isEqualTo("open");
    assertThat(client.parseCow(json("{\"status\":\"open\",\"executedSellAmount\":\"1\"}")).executionStatus())
        .isEqualTo("partially_filled");
    assertThat(client.parseCow(json("{\"status\":\"fulfilled\",\"executedSellAmount\":\"100\"}")).executionStatus())
        .isEqualTo("filled");
    assertThat(client.parseCow(json("{\"status\":\"cancelled\",\"executedSellAmount\":\"0\"}")).executionStatus())
        .isEqualTo("cancelled");
    assertThat(client.parseCow(json("{\"status\":\"expired\",\"executedSellAmount\":\"0\"}")).executionStatus())
        .isEqualTo("expired");
  }

  @Test
  void rejectsMalformedProviderAmounts() throws Exception {
    assertThat(client.parseOneInch(
        json("{\"orderStatus\":1,\"remainingMakerAmount\":\"-1\",\"events\":[]}"),
        Instant.parse("2030-01-02T00:00:00Z"),
        Instant.parse("2030-01-01T00:00:00Z")).checked()).isFalse();
    assertThat(client.parseCow(json("{\"status\":\"open\",\"executedSellAmount\":\"bad\"}")).checked()).isFalse();
  }

  @Test
  void doesNotPollOneInchWhenProviderIsDisabled() {
    StatusCheckCandidate candidate = new StatusCheckCandidate(
        UUID.randomUUID(),
        10L,
        LimitOrderCapabilityService.ONEINCH_PROVIDER,
        "0x" + "ab".repeat(32),
        "0x" + "ab".repeat(32),
        "open",
        Instant.now().plusSeconds(3_600),
        0,
        UUID.randomUUID());

    StatusResult result = client.check(candidate);

    assertThat(result.checked()).isFalse();
    assertThat(result.error()).contains("unavailable");
  }

  private JsonNode json(String value) throws Exception {
    return objectMapper.readTree(value);
  }
}
