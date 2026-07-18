package com.wallet.swap.history;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.common.ApiException;
import com.wallet.swap.history.SwapHistoryModels.SaveSwapHistoryRequest;
import org.junit.jupiter.api.Test;

class SwapHistoryServiceTest {
  private static final String WALLET = "0x0000000000000000000000000000000000000001";

  private final SwapHistoryRepository repository = mock(SwapHistoryRepository.class);
  private final SwapHistoryService service = new SwapHistoryService(repository);
  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void rejectsOversizedQuoteSnapshotsBeforeDatabaseStorage() {
    SaveSwapHistoryRequest request = requestWithQuote(objectMapper.createObjectNode()
        .put("providerPayload", "x".repeat(65_536)));

    assertThatThrownBy(() -> service.save(WALLET, request))
        .isInstanceOf(ApiException.class)
        .hasMessage("Saved swap details are too large.");

    verify(repository, never()).save(WALLET, request);
  }

  @Test
  void acceptsCompactQuoteSnapshots() {
    SaveSwapHistoryRequest request = requestWithQuote(objectMapper.createObjectNode()
        .put("provider", "0x")
        .put("buyAmount", "2000"));

    service.save(WALLET, request);

    verify(repository).save(WALLET, request);
  }

  private SaveSwapHistoryRequest requestWithQuote(com.fasterxml.jackson.databind.JsonNode quote) {
    return new SaveSwapHistoryRequest(
        1L,
        null,
        "dry_run",
        "0x0000000000000000000000000000000000000002",
        "SELL",
        18,
        "0x0000000000000000000000000000000000000003",
        "BUY",
        6,
        "1000",
        "2000",
        "1900",
        "0x",
        quote);
  }
}
