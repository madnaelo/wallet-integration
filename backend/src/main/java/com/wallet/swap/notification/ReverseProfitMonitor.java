package com.wallet.swap.notification;

import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.ReverseProfitModels.ReverseProfitCandidate;
import com.wallet.swap.notification.ReverseProfitModels.TokenRef;
import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ReverseProfitMonitor {
  private static final Logger log = LoggerFactory.getLogger(ReverseProfitMonitor.class);

  private final NotificationProperties properties;
  private final ReverseProfitCandidateRepository candidateRepository;
  private final CoinGeckoPriceClient priceClient;
  private final ReverseProfitCalculator calculator;
  private final NotificationDeliveryService deliveryService;
  private final AtomicBoolean running = new AtomicBoolean(false);

  public ReverseProfitMonitor(
      NotificationProperties properties,
      ReverseProfitCandidateRepository candidateRepository,
      CoinGeckoPriceClient priceClient,
      ReverseProfitCalculator calculator,
      NotificationDeliveryService deliveryService) {
    this.properties = properties;
    this.candidateRepository = candidateRepository;
    this.priceClient = priceClient;
    this.calculator = calculator;
    this.deliveryService = deliveryService;
  }

  @Scheduled(fixedDelayString = "${wallet.notifications.monitor-fixed-delay-ms:900000}")
  public void checkReverseProfitOpportunities() {
    if (!properties.isMonitorEnabled()) return;
    if (!running.compareAndSet(false, true)) return;

    try {
      List<ReverseProfitCandidate> candidates = candidateRepository.findCandidates(
          properties.getEligibleStatuses(),
          properties.getLookbackDays(),
          properties.getCandidateLimit());
      if (candidates.isEmpty()) return;

      Set<TokenRef> tokenRefs = new HashSet<>();
      for (ReverseProfitCandidate candidate : candidates) {
        tokenRefs.add(candidate.sellToken());
        tokenRefs.add(candidate.buyToken());
      }

      Map<TokenRef, BigDecimal> prices = priceClient.fetchUsdPrices(tokenRefs);
      int delivered = 0;
      for (ReverseProfitCandidate candidate : candidates) {
        delivered += calculator.evaluate(candidate, prices)
            .map(opportunity -> {
              deliveryService.deliver(opportunity);
              return 1;
            })
            .orElse(0);
      }
      if (delivered > 0) {
        log.info("Reverse profit monitor processed {} candidates and found {} opportunities.", candidates.size(), delivered);
      }
    } catch (Exception exception) {
      log.warn("Reverse profit monitor failed.", exception);
    } finally {
      running.set(false);
    }
  }
}
