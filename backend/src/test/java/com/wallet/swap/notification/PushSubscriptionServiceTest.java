package com.wallet.swap.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.common.ApiException;
import com.wallet.swap.common.WalletMutationLock;
import com.wallet.swap.notification.NotificationModels.PushSubscriptionStatusRequest;
import com.wallet.swap.notification.NotificationModels.PushSubscriptionKeys;
import com.wallet.swap.notification.NotificationModels.PushSubscriptionRequest;
import java.util.Base64;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PushSubscriptionServiceTest {
  private static final String WALLET = "0x0000000000000000000000000000000000000001";
  private static final String ENDPOINT = "https://fcm.googleapis.com/fcm/send/subscription";

  @Mock
  private PushSubscriptionRepository pushSubscriptionRepository;

  @Mock
  private NotificationPreferenceService preferenceService;

  private PushSubscriptionService service;
  private NotificationProperties properties;

  @Mock
  private WalletMutationLock walletMutationLock;

  @BeforeEach
  void setUp() {
    properties = new NotificationProperties();
    service = new PushSubscriptionService(
        properties,
        pushSubscriptionRepository,
        preferenceService,
        walletMutationLock);
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

  @Test
  void rejectsUntrustedPushEndpointHosts() {
    assertThatThrownBy(() -> service.status(
        WALLET,
        new PushSubscriptionStatusRequest("https://127.0.0.1/internal")))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("incomplete");
  }

  @Test
  void acceptsMicrosoftPushServiceSubdomains() {
    String endpoint = "https://db3.notify.windows.com/w/?token=test";
    when(pushSubscriptionRepository.countActive(WALLET)).thenReturn(1);
    when(pushSubscriptionRepository.isActiveForWalletEndpoint(WALLET, endpoint)).thenReturn(true);

    var response = service.status(WALLET, new PushSubscriptionStatusRequest(endpoint));

    assertThat(response.linked()).isTrue();
  }

  @Test
  void keepsOnlyTheConfiguredNumberOfRecentDevicesAfterSubscribe() {
    properties.getPush().setEnabled(true);
    properties.getPush().setVapidPublicKey("A".repeat(87));
    properties.getPush().setVapidPrivateKey("B".repeat(43));
    properties.getPush().setMaxDevicesPerWallet(10);
    PushSubscriptionRequest request = new PushSubscriptionRequest(
        ENDPOINT,
        validKeys(),
        null);

    service.subscribe(WALLET, request, "Chrome");

    verify(walletMutationLock).lock(WALLET);
    verify(pushSubscriptionRepository).upsert(WALLET, request, "Chrome");
    verify(pushSubscriptionRepository).retainMostRecentForWallet(WALLET, 10);
    verify(preferenceService).setPushEnabled(WALLET, true);
  }

  @Test
  void rejectsMalformedSubscriptionKeyMaterialBeforePersistence() {
    properties.getPush().setEnabled(true);
    properties.getPush().setVapidPublicKey("A".repeat(87));
    properties.getPush().setVapidPrivateKey("B".repeat(43));
    PushSubscriptionRequest request = new PushSubscriptionRequest(
        ENDPOINT,
        new PushSubscriptionKeys("not-base64!", "also-not-base64!"),
        null);

    assertThatThrownBy(() -> service.subscribe(WALLET, request, "Chrome"))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("incomplete");

    verify(pushSubscriptionRepository, never()).upsert(WALLET, request, "Chrome");
  }

  @Test
  void rejectsCompressedOrWrongLengthSubscriptionKeys() {
    properties.getPush().setEnabled(true);
    properties.getPush().setVapidPublicKey("A".repeat(87));
    properties.getPush().setVapidPrivateKey("B".repeat(43));
    byte[] compressedKey = new byte[33];
    compressedKey[0] = 0x02;
    PushSubscriptionRequest request = new PushSubscriptionRequest(
        ENDPOINT,
        new PushSubscriptionKeys(encode(compressedKey), encode(new byte[16])),
        null);

    assertThatThrownBy(() -> service.subscribe(WALLET, request, "Chrome"))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("incomplete");

    verify(pushSubscriptionRepository, never()).upsert(WALLET, request, "Chrome");
  }

  private PushSubscriptionKeys validKeys() {
    byte[] publicKey = new byte[65];
    publicKey[0] = 0x04;
    return new PushSubscriptionKeys(encode(publicKey), encode(new byte[16]));
  }

  private String encode(byte[] value) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
  }
}
