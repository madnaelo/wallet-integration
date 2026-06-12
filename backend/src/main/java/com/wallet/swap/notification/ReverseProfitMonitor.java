package com.wallet.swap.notification;

import com.wallet.swap.autoswap.AutoSwapCalculator;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleCandidate;
import com.wallet.swap.autoswap.AutoSwapRuleRepository;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.FavoritePairModels.FavoritePairCandidate;
import com.wallet.swap.notification.ReverseProfitModels.ReverseProfitCandidate;
import com.wallet.swap.notification.ReverseProfitModels.TokenRef;
import com.wallet.swap.ops.OperationalMetricsService;
import com.wallet.swap.ops.JobLockService;
import java.math.BigDecimal;
import java.time.Duration;
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
  private final FavoritePairCandidateRepository favoritePairCandidateRepository;
  private final AutoSwapRuleRepository autoSwapRuleRepository;
  private final CoinGeckoPriceClient priceClient;
  private final ReverseProfitCalculator calculator;
  private final FavoritePairCalculator favoritePairCalculator;
  private final AutoSwapCalculator autoSwapCalculator;
  private final NotificationDeliveryService deliveryService;
  private final OperationalMetricsService metricsService;
  private final JobLockService jobLockService;
  private final AtomicBoolean running = new AtomicBoolean(false);

  public ReverseProfitMonitor(
      NotificationProperties properties,
      ReverseProfitCandidateRepository candidateRepository,
      FavoritePairCandidateRepository favoritePairCandidateRepository,
      AutoSwapRuleRepository autoSwapRuleRepository,
      CoinGeckoPriceClient priceClient,
      ReverseProfitCalculator calculator,
      FavoritePairCalculator favoritePairCalculator,
      AutoSwapCalculator autoSwapCalculator,
      NotificationDeliveryService deliveryService,
      OperationalMetricsService metricsService,
      JobLockService jobLockService) {
    this.properties = properties;
    this.candidateRepository = candidateRepository;
    this.favoritePairCandidateRepository = favoritePairCandidateRepository;
    this.autoSwapRuleRepository = autoSwapRuleRepository;
    this.priceClient = priceClient;
    this.calculator = calculator;
    this.favoritePairCalculator = favoritePairCalculator;
    this.autoSwapCalculator = autoSwapCalculator;
    this.deliveryService = deliveryService;
    this.metricsService = metricsService;
    this.jobLockService = jobLockService;
  }

  @Scheduled(fixedDelayString = "${wallet.notifications.monitor-fixed-delay-ms:900000}")
  public void checkReverseProfitOpportunities() {
    if (!properties.isMonitorEnabled()) return;
    if (!running.compareAndSet(false, true)) return;

    try {
      jobLockService.runIfAcquired(
          "notification-monitor",
          Duration.ofMillis(Math.max(60_000, properties.getMonitorFixedDelayMs() * 2)),
          this::runMonitorCycle);
    } finally {
      running.set(false);
    }
  }

  private void runMonitorCycle() {
    int reverseCandidateCount = 0;
    int favoritePairCandidateCount = 0;
    int autoSwapCandidateCount = 0;
    int totalOpportunities = 0;
    try {
      metricsService.recordMonitorStarted();
      List<ReverseProfitCandidate> candidates = candidateRepository.findCandidates(
          properties.getEligibleStatuses(),
          properties.getLookbackDays(),
          properties.getCandidateLimit());
      List<FavoritePairCandidate> favoritePairCandidates = favoritePairCandidateRepository.findCandidates(
          properties.getCandidateLimit());
      List<AutoSwapRuleCandidate> autoSwapCandidates = autoSwapRuleRepository.findNotificationCandidates(
          properties.getCandidateLimit());
      reverseCandidateCount = candidates.size();
      favoritePairCandidateCount = favoritePairCandidates.size();
      autoSwapCandidateCount = autoSwapCandidates.size();
      if (candidates.isEmpty() && favoritePairCandidates.isEmpty() && autoSwapCandidates.isEmpty()) {
        metricsService.recordMonitorCompleted(0, 0, 0, 0);
        return;
      }

      Set<TokenRef> tokenRefs = new HashSet<>();
      for (ReverseProfitCandidate candidate : candidates) {
        tokenRefs.add(candidate.sellToken());
        tokenRefs.add(candidate.buyToken());
      }
      for (FavoritePairCandidate candidate : favoritePairCandidates) {
        tokenRefs.add(candidate.sellToken());
        tokenRefs.add(candidate.buyToken());
      }
      for (AutoSwapRuleCandidate candidate : autoSwapCandidates) {
        tokenRefs.add(candidate.sellToken());
        tokenRefs.add(candidate.buyToken());
      }

      Map<TokenRef, BigDecimal> prices = priceClient.fetchUsdPrices(tokenRefs);
      int reverseOpportunities = 0;
      for (ReverseProfitCandidate candidate : candidates) {
        reverseOpportunities += calculator.evaluate(candidate, prices)
            .map(opportunity -> {
              deliveryService.deliver(opportunity);
              return 1;
            })
            .orElse(0);
      }

      int favoritePairOpportunities = 0;
      for (FavoritePairCandidate candidate : favoritePairCandidates) {
        favoritePairOpportunities += favoritePairCalculator.evaluate(candidate, prices)
            .map(opportunity -> {
              deliveryService.deliver(opportunity);
              return 1;
            })
            .orElse(0);
      }

      int autoSwapOpportunities = 0;
      for (AutoSwapRuleCandidate candidate : autoSwapCandidates) {
        autoSwapOpportunities += autoSwapCalculator.evaluate(candidate, prices)
            .map(opportunity -> {
              deliveryService.deliver(opportunity);
              return 1;
            })
            .orElse(0);
      }

      totalOpportunities = reverseOpportunities + favoritePairOpportunities + autoSwapOpportunities;
      metricsService.recordMonitorCompleted(
          reverseCandidateCount,
          favoritePairCandidateCount,
          autoSwapCandidateCount,
          totalOpportunities);
      if (totalOpportunities > 0) {
        log.info(
            "Notification monitor processed {} reverse candidates, {} favorite pairs, and {} price-alert rules; found {} opportunities.",
            candidates.size(),
            favoritePairCandidates.size(),
            autoSwapCandidates.size(),
            totalOpportunities);
      }
    } catch (Exception exception) {
      metricsService.recordMonitorFailure(exception);
      log.warn("Reverse profit monitor failed.", exception);
    }
  }
}
