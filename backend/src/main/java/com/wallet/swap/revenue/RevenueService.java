package com.wallet.swap.revenue;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.history.SwapHistoryModels.*;
import com.wallet.swap.revenue.RevenueModels.*;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class RevenueService {
  private final RevenueProperties properties;
  private final RevenueRepository repository;
  private final RevenueIntegrity integrity;

  public RevenueService(RevenueProperties properties, RevenueRepository repository, RevenueIntegrity integrity) {
    this.properties = properties;
    this.repository = repository;
    this.integrity = integrity;
  }
  public void ingest(Envelope envelope) { repository.ingest(envelope, integrity.verify(envelope, true)); }

  public void review(String wallet, UUID quoteId) {
    Snapshot quote = repository.loadQuote(quoteId).snapshot();
    requireOwner(wallet, quote);
    repository.review(quoteId, wallet);
  }

  public void bind(String wallet, SaveSwapHistoryRequest request, SwapHistoryResponse saved) {
    if (!properties.enabled() || "dry_run".equals(request.status())) return;
    String id = request.quote() == null ? "" : request.quote().path("revenueQuoteId").asText("");
    UUID quoteId = null;
    if (!id.isBlank()) {
      try { quoteId = UUID.fromString(id); }
      catch (IllegalArgumentException exception) { throw mismatch(); }
      Snapshot q = repository.loadQuote(quoteId).snapshot();
      requireOwner(wallet, q);
      validateBinding(q, request);
    }
    String tx = request.txHash();
    if (tx.matches("(?i)(0x)?[0-9a-f]{64}")) tx = tx.toLowerCase(Locale.ROOT);
    repository.bind(saved.id(), quoteId, wallet, request.chainId(), tx);
  }

  static void validateBinding(Snapshot q, SaveSwapHistoryRequest r) {
    if (q.sourceChain() != r.chainId() || q.destinationChain() != r.buyChainId()
        || !RevenueIntegrity.sameAsset(q.sellToken().address(), r.sellTokenAddress())
        || !RevenueIntegrity.sameAsset(q.buyToken().address(), r.buyTokenAddress())
        || q.sellToken().decimals() != r.sellTokenDecimals() || q.buyToken().decimals() != r.buyTokenDecimals()
        || !q.sellAmount().equals(r.sellAmountRaw()) || !q.buyAmount().equals(r.buyAmountRaw())
        || !q.minimumAmount().equals(r.minBuyAmountRaw() == null || r.minBuyAmountRaw().isBlank() ? "0" : r.minBuyAmountRaw())
        || !q.provider().equals(r.aggregator())
        || !RevenueIntegrity.sameAsset(q.transactionTo(), r.quote().path("to").asText())
        || !q.transactionValue().equals(r.quote().path("value").asText("0"))
        || !q.dataHash().equals(RevenueIntegrity.hash(canonicalData(r.quote().path("data").asText())))
        || q.feeBps() != r.quote().path("platformFeeBps").asInt(-1)) throw mismatch();
  }

  private static String canonicalData(String value) {
    return value.matches("(?i)0x[0-9a-f]*") ? value.toLowerCase(Locale.ROOT) : value;
  }

  private void requireOwner(String wallet, Snapshot quote) {
    if (!wallet.equalsIgnoreCase(quote.owner())
        || (quote.taker().matches("0x[0-9a-fA-F]{40}") && !wallet.equalsIgnoreCase(quote.taker()))) {
      throw new ApiException(HttpStatus.FORBIDDEN, "This quote belongs to a different wallet.");
    }
  }
  private static ApiException mismatch() { return new ApiException(HttpStatus.BAD_REQUEST, "Saved swap does not match its server quote."); }
}
