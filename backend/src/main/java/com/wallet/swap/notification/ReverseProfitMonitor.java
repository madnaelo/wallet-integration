package com.wallet.swap.notification;

import com.wallet.swap.pricealert.PriceAlertCalculator;
import com.wallet.swap.pricealert.PriceAlertModels.PriceAlertCandidate;
import com.wallet.swap.pricealert.PriceAlertRepository;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.feature.FeatureFlagService;
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
  private final PriceAlertRepository priceAlertRepository;
  private final CoinGeckoPriceClient priceClient;
  private final ReverseProfitCalculator calculator;
  private final FavoritePairCalculator favoritePairCalculator;
  private final PriceAlertCalculator priceAlertCalculator;
  private final NotificationDeliveryService deliveryService;
  private final OperationalMetricsService metricsService;
  private final JobLockService jobLockService;
  private final FeatureFlagService featureFlagService;
  private final AtomicBoolean running = new AtomicBoolean(false);

  public ReverseProfitMonitor(
      NotificationProperties properties,
      ReverseProfitCandidateRepository candidateRepository,
      FavoritePairCandidateRepository favoritePairCandidateRepository,
      PriceAlertRepository priceAlertRepository,
      CoinGeckoPriceClient priceClient,
      ReverseProfitCalculator calculator,
      FavoritePairCalculator favoritePairCalculator,
      PriceAlertCalculator priceAlertCalculator,
      NotificationDeliveryService deliveryService,
      OperationalMetricsService metricsService,
      JobLockService jobLockService,
      FeatureFlagService featureFlagService) {
    this.properties = properties;
    this.candidateRepository = candidateRepository;
    this.favoritePairCandidateRepository = favoritePairCandidateRepository;
    this.priceAlertRepository = priceAlertRepository;
    this.priceClient = priceClient;
    this.calculator = calculator;
    this.favoritePairCalculator = favoritePairCalculator;
    this.priceAlertCalculator = priceAlertCalculator;
    this.deliveryService = deliveryService;
    this.metricsService = metricsService;
    this.jobLockService = jobLockService;
    this.featureFlagService = featureFlagService;
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
    int priceAlertCandidateCount = 0;
    int totalOpportunities = 0;
    try {
      metricsService.recordMonitorStarted();
      List<ReverseProfitCandidate> candidates = candidateRepository.findCandidates(
          properties.getEligibleStatuses(),
          properties.getLookbackDays(),
          properties.getCandidateLimit());
      List<FavoritePairCandidate> favoritePairCandidates = favoritePairCandidateRepository.findCandidates(
          properties.getCandidateLimit());
      List<PriceAlertCandidate> priceAlertCandidates = featureFlagService.isPriceAlertsEnabled()
          ? priceAlertRepository.findNotificationCandidates(properties.getCandidateLimit())
          : List.of();
      reverseCandidateCount = candidates.size();
      favoritePairCandidateCount = favoritePairCandidates.size();
      priceAlertCandidateCount = priceAlertCandidates.size();
      if (candidates.isEmpty() && favoritePairCandidates.isEmpty() && priceAlertCandidates.isEmpty()) {
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
      for (PriceAlertCandidate candidate : priceAlertCandidates) {
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

      int priceAlertOpportunities = 0;
      for (PriceAlertCandidate candidate : priceAlertCandidates) {
        priceAlertOpportunities += priceAlertCalculator.evaluate(candidate, prices)
            .map(opportunity -> {
              deliveryService.deliver(opportunity);
              return 1;
            })
            .orElse(0);
      }

      totalOpportunities = reverseOpportunities + favoritePairOpportunities + priceAlertOpportunities;
      metricsService.recordMonitorCompleted(
          reverseCandidateCount,
          favoritePairCandidateCount,
          priceAlertCandidateCount,
          totalOpportunities);
      if (totalOpportunities > 0) {
        log.info(
            "Notification monitor processed {} reverse candidates, {} favorite pairs, and {} price-alert rules; found {} opportunities.",
            candidates.size(),
            favoritePairCandidates.size(),
            priceAlertCandidates.size(),
            totalOpportunities);
      }
    } catch (RuntimeException exception) {
      metricsService.recordMonitorFailure(exception);
      log.warn("Reverse profit monitor failed.", exception);
    }
  }
}
