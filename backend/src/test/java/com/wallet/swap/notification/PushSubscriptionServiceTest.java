package com.wallet.swap.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.NotificationModels.PushSubscriptionStatusRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PushSubscriptionServiceTest {
  private static final String WALLET = "0x0000000000000000000000000000000000000001";
  private static final String ENDPOINT = "https://push.example/subscription";

  @Mock
  private PushSubscriptionRepository pushSubscriptionRepository;

  @Mock
  private NotificationPreferenceService preferenceService;

  private PushSubscriptionService service;

  @BeforeEach
  void setUp() {
    service = new PushSubscriptionService(new NotificationProperties(), pushSubscriptionRepository, preferenceService);
  }

  @Test
  void statusReportsWalletCountWithoutDeviceEndpoint() {
    when(pushSubscriptionRepository.countActive(WALLET)).thenReturn(2);

    var response = service.status(WALLET, new PushSubscriptionStatusRequest(null));

    assertThat(response.linked()).isFalse();
    assertThat(response.walletSubscriptionCount()).isEqualTo(2);
    verify(pushSubscriptionRepository, never()).isActiveForWalletEndpoint(WALLET, ENDPOINT);
  }

  @Test
  void statusReportsWhetherCurrentDeviceEndpointIsLinked() {
    when(pushSubscriptionRepository.countActive(WALLET)).thenReturn(2);
    when(pushSubscriptionRepository.isActiveForWalletEndpoint(WALLET, ENDPOINT)).thenReturn(true);

    var response = service.status(WALLET, new PushSubscriptionStatusRequest(ENDPOINT));

    assertThat(response.linked()).isTrue();
    assertThat(response.walletSubscriptionCount()).isEqualTo(2);
  }
}
