package com.wallet.swap.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.NotificationMessageFormatter.PushNotificationPayload;
import com.wallet.swap.notification.PushSubscriptionRepository.PushSubscriptionRecord;
import java.net.InetSocketAddress;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Security;
import java.security.spec.ECGenParameterSpec;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.bouncycastle.jce.interfaces.ECPrivateKey;
import org.bouncycastle.jce.interfaces.ECPublicKey;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.util.BigIntegers;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PushNotificationSenderTest {
  @ParameterizedTest
  @ValueSource(ints = {201, 410})
  void encryptsAndDeliversThroughApacheWithoutUnusedNettyClient(int status) throws Exception {
    if (Security.getProvider("BC") == null) Security.addProvider(new BouncyCastleProvider());
    KeyPair vapid = keyPair();
    KeyPair device = keyPair();
    var properties = new NotificationProperties();
    properties.getPush().setEnabled(true);
    properties.getPush().setVapidPublicKey(publicKey(vapid));
    properties.getPush().setVapidPrivateKey(encode(BigIntegers.asUnsignedByteArray(32, ((ECPrivateKey) vapid.getPrivate()).getD())));
    properties.getPush().setVapidSubject("mailto:test@example.invalid");
    properties.getPush().setRequestTimeoutSeconds(5);
    var repository = mock(PushSubscriptionRepository.class);
    var payload = new PushNotificationPayload("Test", "Synthetic notification", "/swap", "fixture");
    var received = new AtomicReference<byte[]>();
    var encoding = new AtomicReference<String>();
    var authorization = new AtomicReference<String>();
    var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/push", exchange -> {
      received.set(exchange.getRequestBody().readAllBytes());
      encoding.set(exchange.getRequestHeaders().getFirst("Content-Encoding"));
      authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
      exchange.sendResponseHeaders(status, -1);
      exchange.close();
    });
    server.start();
    try {
      String endpoint = "http://127.0.0.1:" + server.getAddress().getPort() + "/push";
      String wallet = "0x" + "1".repeat(40);
      Instant now = Instant.now();
      when(repository.findActiveForWalletEndpoint(wallet, endpoint)).thenReturn(List.of(
          new PushSubscriptionRecord(UUID.randomUUID(), wallet, endpoint, publicKey(device),
              encode(new byte[16]), now, now, now)));
      var sender = new PushNotificationSender(properties, repository, new ObjectMapper());
      if (status == 201) {
        sender.sendToDevice(wallet, endpoint, payload);
        verify(repository, never()).disableEndpoint(anyString());
      } else {
        assertThatThrownBy(() -> sender.sendToDevice(wallet, endpoint, payload)).hasMessageContaining("HTTP 410");
        verify(repository).disableEndpoint(endpoint);
      }
      assertThat(received.get()).isNotEmpty();
      assertThat(encoding.get()).isEqualTo("aes128gcm");
      assertThat(authorization.get()).startsWith("vapid ");
      assertThatThrownBy(() -> Class.forName("org.asynchttpclient.AsyncHttpClient"))
          .isInstanceOf(ClassNotFoundException.class);
    } finally {
      server.stop(0);
    }
  }

  private static KeyPair keyPair() throws Exception {
    var generator = KeyPairGenerator.getInstance("EC", "BC");
    generator.initialize(new ECGenParameterSpec("secp256r1"));
    return generator.generateKeyPair();
  }

  private static String publicKey(KeyPair key) {
    return encode(((ECPublicKey) key.getPublic()).getQ().getEncoded(false));
  }

  private static String encode(byte[] bytes) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }
}
