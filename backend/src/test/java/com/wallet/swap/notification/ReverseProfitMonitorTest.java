package com.wallet.swap.notification;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.wallet.swap.pricealert.PriceAlertCalculator;
import com.wallet.swap.pricealert.PriceAlertRepository;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.feature.FeatureFlagService;
import com.wallet.swap.ops.JobLockService;
import com.wallet.swap.ops.OperationalMetricsService;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ReverseProfitMonitorTest {
  @Mock private ReverseProfitCandidateRepository candidateRepository;
  @Mock private FavoritePairCandidateRepository favoritePairCandidateRepository;
  @Mock private PriceAlertRepository priceAlertRepository;
  @Mock private CoinGeckoPriceClient priceClient;
  @Mock private ReverseProfitCalculator calculator;
  @Mock private FavoritePairCalculator favoritePairCalculator;
  @Mock private PriceAlertCalculator priceAlertCalculator;
  @Mock private NotificationDeliveryService deliveryService;
  @Mock private OperationalMetricsService metricsService;
  @Mock private JobLockService jobLockService;
  @Mock private FeatureFlagService featureFlagService;

  private NotificationProperties properties;
  private ReverseProfitMonitor monitor;

  @BeforeEach
  void setUp() {
    properties = new NotificationProperties();
    when(candidateRepository.findCandidates(anyList(), anyInt(), anyInt())).thenReturn(List.of());
    when(favoritePairCandidateRepository.findCandidates(anyInt())).thenReturn(List.of());
    when(jobLockService.runIfAcquired(anyString(), any(Duration.class), any(Runnable.class)))
        .thenAnswer(invocation -> {
          invocation.getArgument(2, Runnable.class).run();
          return true;
        });
    monitor = new ReverseProfitMonitor(
        properties,
        candidateRepository,
        favoritePairCandidateRepository,
        priceAlertRepository,
        priceClient,
        calculator,
        favoritePairCalculator,
        priceAlertCalculator,
        deliveryService,
        metricsService,
        jobLockService,
        featureFlagService);
  }

  @Test
  void skipsSavedPriceAlertsWhenTheFeatureIsDisabled() {
    when(featureFlagService.isPriceAlertsEnabled()).thenReturn(false);

    monitor.checkReverseProfitOpportunities();

    verify(priceAlertRepository, never()).findNotificationCandidates(anyInt());
    verify(metricsService).recordMonitorCompleted(0, 0, 0, 0);
  }

  @Test
  void evaluatesSavedPriceAlertsWhenTheFeatureIsEnabled() {
    when(featureFlagService.isPriceAlertsEnabled()).thenReturn(true);
    when(priceAlertRepository.findNotificationCandidates(properties.getCandidateLimit())).thenReturn(List.of());

    monitor.checkReverseProfitOpportunities();

    verify(priceAlertRepository).findNotificationCandidates(properties.getCandidateLimit());
    verify(metricsService).recordMonitorCompleted(0, 0, 0, 0);
  }
}
