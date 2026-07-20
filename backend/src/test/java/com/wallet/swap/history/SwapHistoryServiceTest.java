package com.wallet.swap.history;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.common.ApiException;
import com.wallet.swap.common.WalletMutationLock;
import com.wallet.swap.history.SwapHistoryModels.SaveSwapHistoryRequest;
import org.junit.jupiter.api.Test;

class SwapHistoryServiceTest {
  private static final String WALLET = "0x0000000000000000000000000000000000000001";

  private final SwapHistoryRepository repository = mock(SwapHistoryRepository.class);
  private final WalletMutationLock walletMutationLock = mock(WalletMutationLock.class);
  private final SwapHistoryService service = new SwapHistoryService(repository, walletMutationLock);
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
    verify(walletMutationLock).lock(WALLET);
  }

  @Test
  void rejectsNewEntriesWhenWalletHistoryIsFull() {
    SaveSwapHistoryRequest request = requestWithQuote(null);
    org.mockito.Mockito.when(repository.countForWallet(WALLET)).thenReturn(10_000);

    assertThatThrownBy(() -> service.save(WALLET, request))
        .isInstanceOf(ApiException.class)
        .hasMessage("History storage for this wallet is full.");

    verify(repository, never()).save(WALLET, request);
  }

  @Test
  void permitsStatusUpdatesWhenWalletHistoryIsFull() {
    SaveSwapHistoryRequest request = requestWithTransaction("confirmed");
    when(repository.existsTransaction(WALLET, 1L, request.txHash())).thenReturn(true);
    when(repository.countForWallet(WALLET)).thenReturn(10_000);

    service.save(WALLET, request);

    verify(repository).save(WALLET, request);
    verify(repository, never()).countForWallet(WALLET);
  }

  @Test
  void requiresAValidTransactionIdentifierForSubmittedSwaps() {
    SaveSwapHistoryRequest request = requestWithTransaction("submitted");
    request = new SaveSwapHistoryRequest(
        request.chainId(),
        request.buyChainId(),
        "not-a-transaction",
        request.status(),
        request.sellTokenAddress(),
        request.sellTokenSymbol(),
        request.sellTokenDecimals(),
        request.buyTokenAddress(),
        request.buyTokenSymbol(),
        request.buyTokenDecimals(),
        request.sellAmountRaw(),
        request.buyAmountRaw(),
        request.minBuyAmountRaw(),
        request.aggregator(),
        request.quote());

    SaveSwapHistoryRequest invalidRequest = request;
    assertThatThrownBy(() -> service.save(WALLET, invalidRequest))
        .isInstanceOf(ApiException.class)
        .hasMessage("Invalid transaction identifier.");

    verify(repository, never()).save(WALLET, invalidRequest);
  }

  private SaveSwapHistoryRequest requestWithQuote(com.fasterxml.jackson.databind.JsonNode quote) {
    return new SaveSwapHistoryRequest(
        1L,
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

  private SaveSwapHistoryRequest requestWithTransaction(String status) {
    SaveSwapHistoryRequest request = requestWithQuote(null);
    return new SaveSwapHistoryRequest(
        request.chainId(),
        request.buyChainId(),
        "0x" + "a".repeat(64),
        status,
        request.sellTokenAddress(),
        request.sellTokenSymbol(),
        request.sellTokenDecimals(),
        request.buyTokenAddress(),
        request.buyTokenSymbol(),
        request.buyTokenDecimals(),
        request.sellAmountRaw(),
        request.buyAmountRaw(),
        request.minBuyAmountRaw(),
        request.aggregator(),
        request.quote());
  }
}
