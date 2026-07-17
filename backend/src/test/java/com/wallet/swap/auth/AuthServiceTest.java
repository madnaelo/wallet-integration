package com.wallet.swap.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.wallet.swap.auth.AuthModels.VerifyResponse;
import com.wallet.swap.config.AuthProperties;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;

class AuthServiceTest {
  private static final String WALLET = "0x0000000000000000000000000000000000000001";

  private final AuthRepository repository = mock(AuthRepository.class);
  private final EthereumSignatureVerifier signatureVerifier = mock(EthereumSignatureVerifier.class);
  private final TokenHasher tokenHasher = mock(TokenHasher.class);
  private final AuthProperties properties = new AuthProperties();
  private final AuthService service = new AuthService(properties, repository, signatureVerifier, tokenHasher);

  @Test
  void locksAndConsumesNonceInsideTransactionalVerification() throws Exception {
    Instant expiresAt = Instant.now().plusSeconds(300);
    AuthRepository.StoredNonce nonce = new AuthRepository.StoredNonce("nonce", "message", expiresAt);
    when(repository.findNonceForUpdate(WALLET)).thenReturn(Optional.of(nonce));
    when(signatureVerifier.verifySignedMessage(WALLET, nonce.message(), "signature")).thenReturn(true);
    when(tokenHasher.sha256(any())).thenReturn("token-hash");

    VerifyResponse response = service.verify(WALLET, "signature");

    assertThat(response.walletAddress()).isEqualTo(WALLET);
    verify(repository).findNonceForUpdate(WALLET);
    verify(repository).saveSession(any(), eq(WALLET), eq("token-hash"), any());
    verify(repository).deleteNonce(WALLET);
    verify(repository).markLastLogin(WALLET);
    assertThat(AuthService.class.getMethod("verify", String.class, String.class)
        .isAnnotationPresent(Transactional.class)).isTrue();
  }

  @Test
  void expiredNonceIsDeletedWithoutCreatingSession() {
    AuthRepository.StoredNonce nonce = new AuthRepository.StoredNonce(
        "nonce",
        "message",
        Instant.now().minusSeconds(1));
    when(repository.findNonceForUpdate(WALLET)).thenReturn(Optional.of(nonce));

    org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.verify(WALLET, "signature"))
        .hasMessageContaining("expired");

    verify(repository).deleteNonce(WALLET);
    verify(repository, never()).saveSession(any(), any(), any(), any());
  }
}
