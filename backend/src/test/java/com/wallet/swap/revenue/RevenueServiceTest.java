package com.wallet.swap.revenue;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.wallet.swap.revenue.RevenueFixtures.*;
import com.wallet.swap.history.SwapHistoryModels.*;
import com.wallet.swap.revenue.RevenueModels.*;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RevenueServiceTest {
  private final RevenueRepository repository = mock(RevenueRepository.class);
  private final RevenueService service = new RevenueService(properties(),repository,mock(RevenueIntegrity.class));

  @Test void browserConfirmedCannotPromoteRevenueAndDuplicateHistoryUsesSameBinding() {
    Snapshot q = quote();
    var request = request(q,"confirmed");
    SwapHistoryResponse saved = mock(SwapHistoryResponse.class);
    UUID historyId = UUID.randomUUID();
    when(saved.id()).thenReturn(historyId);
    when(repository.loadQuote(q.id())).thenReturn(new RevenueRepository.SignedQuote(q,Instant.now()));
    service.bind(OWNER,request,saved);
    verify(repository).loadQuote(q.id());
    verify(repository).bind(historyId,q.id(),OWNER,1,TX);
    verifyNoMoreInteractions(repository);
  }
  @Test void wrongOwnerCannotClaimQuoteOrReview() {
    Snapshot q = quote();
    when(repository.loadQuote(q.id())).thenReturn(new RevenueRepository.SignedQuote(q,Instant.now()));
    assertThatThrownBy(() -> service.review(TREASURY,q.id())).hasMessageContaining("different wallet");
    assertThatThrownBy(() -> service.bind(TREASURY,request(q,"confirmed"),mock(SwapHistoryResponse.class)))
        .hasMessageContaining("different wallet");
  }
  @Test void rejectsChangedQuoteAmountsAndTransactionData() {
    Snapshot q = quote();
    var request = request(q,"submitted");
    assertThatCode(() -> RevenueService.validateBinding(q,request)).doesNotThrowAnyException();
    assertThatThrownBy(() -> RevenueService.validateBinding(change(q,"sellAmount","999"),request)).hasMessageContaining("does not match");
    assertThatThrownBy(() -> RevenueService.validateBinding(change(q,"destinationChain",10),request)).hasMessageContaining("does not match");
    assertThatThrownBy(() -> RevenueService.validateBinding(change(q,"dataHash","a".repeat(64)),request)).hasMessageContaining("does not match");
  }
  @Test void dryRunsNeverBecomeFinancialRecords() {
    service.bind(OWNER,request(quote(),"dry_run"),null);
    verifyNoInteractions(repository);
  }
  static SaveSwapHistoryRequest request(Snapshot q,String status) {
    var json = JSON.createObjectNode().put("revenueQuoteId",q.id().toString()).put("to",ROUTER)
        .put("value","0").put("data","0xabcd").put("platformFeeBps",20);
    return new SaveSwapHistoryRequest(1L,1L,TX,status,SELL,"USDC",6,BUY,"USDT",6,"1000000","5000000","4900000","0x",json);
  }
}
