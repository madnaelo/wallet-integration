package com.wallet.swap.revenue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.revenue.RevenueModels.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class RevenueReconciliationWorker {
  private static final Logger log = LoggerFactory.getLogger(RevenueReconciliationWorker.class);
  private final RevenueProperties properties;
  private final RevenueRepository repository;
  private final RevenueSettlementVerifier verifier;
  private final ObjectMapper mapper;

  public RevenueReconciliationWorker(RevenueProperties properties, RevenueRepository repository,
      RevenueSettlementVerifier verifier, ObjectMapper mapper) {
    this.properties = properties;
    this.repository = repository;
    this.verifier = verifier;
    this.mapper = mapper;
  }
  @Scheduled(scheduler = "revenueScheduler", fixedDelayString = "${REVENUE_CHECK_DELAY_MS:30000}", initialDelayString = "${REVENUE_CHECK_DELAY_MS:30000}")
  public void reconcile() {
    if (!properties.enabled()) return;
    for (int i=0; i<5; i++) {
      Claim claim = repository.claim();
      if (claim == null) return;
      Settlement settlement;
      try { settlement = verifier.verify(claim, repository.loadQuote(claim.quoteId())); }
      catch (RuntimeException exception) {
        // Never log RPC URLs, payloads, wallet addresses or provider credentials.
        log.warn("Revenue verification temporarily unavailable for record {}", claim.id());
        settlement = new Settlement(State.NOT_VERIFIED, "verification_unavailable", "reconciler",
            true, null, null, false, mapper.createObjectNode().put("reason","verification_unavailable"));
      }
      repository.finish(claim, settlement);
    }
  }

  @Scheduled(scheduler = "revenueScheduler", fixedDelay = 60000, initialDelay = 60000)
  public void cleanup() {
    if (properties.enabled()) repository.expireUnclaimed();
  }
}
