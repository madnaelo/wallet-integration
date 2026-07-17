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
import java.util.List;
import java.util.Optional;
import java.util.UUID;
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
    UUID nonceId = UUID.randomUUID();
    Instant expiresAt = Instant.now().plusSeconds(300);
    AuthRepository.StoredNonce nonce = new AuthRepository.StoredNonce(nonceId, "nonce", "message", expiresAt);
    when(repository.findNonceForUpdate(nonceId, WALLET)).thenReturn(Optional.of(nonce));
    when(signatureVerifier.verifySignedMessage(WALLET, nonce.message(), "signature")).thenReturn(true);
    when(tokenHasher.sha256(any())).thenReturn("token-hash");

    VerifyResponse response = service.verify(nonceId, WALLET, "signature");

    assertThat(response.walletAddress()).isEqualTo(WALLET);
    verify(repository).findNonceForUpdate(nonceId, WALLET);
    verify(repository).saveSession(any(), eq(WALLET), eq("token-hash"), any());
    verify(repository).deleteNonce(nonceId, WALLET);
    verify(repository).markLastLogin(WALLET);
    assertThat(AuthService.class.getMethod("verify", UUID.class, String.class, String.class)
        .isAnnotationPresent(Transactional.class)).isTrue();
  }

  @Test
  void expiredNonceIsDeletedWithoutCreatingSession() {
    UUID nonceId = UUID.randomUUID();
    AuthRepository.StoredNonce nonce = new AuthRepository.StoredNonce(
        nonceId,
        "nonce",
        "message",
        Instant.now().minusSeconds(1));
    when(repository.findNonceForUpdate(nonceId, WALLET)).thenReturn(Optional.of(nonce));

    org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.verify(nonceId, WALLET, "signature"))
        .hasMessageContaining("expired");

    verify(repository).deleteNonce(nonceId, WALLET);
    verify(repository, never()).saveSession(any(), any(), any(), any());
  }

  @Test
  void createsIndependentBoundedNonceRequests() throws Exception {
    var response = service.createNonce(WALLET);

    assertThat(response.nonceId()).isNotNull();
    verify(repository).lockUserForNonce(WALLET);
    verify(repository).saveNonce(eq(response.nonceId()), eq(WALLET), any(), eq(response.message()), eq(response.expiresAt()));
    verify(repository).pruneWalletNonces(WALLET, 5);
    assertThat(AuthService.class.getMethod("createNonce", String.class)
        .isAnnotationPresent(Transactional.class)).isTrue();
  }

  @Test
  void supportsSignedMessagesCreatedByAnAlreadyOpenClient() {
    UUID nonceId = UUID.randomUUID();
    AuthRepository.StoredNonce nonce = new AuthRepository.StoredNonce(
        nonceId,
        "nonce",
        "message",
        Instant.now().plusSeconds(300));
    when(repository.findWalletNoncesForUpdate(WALLET)).thenReturn(List.of(nonce));
    when(signatureVerifier.verifySignedMessage(WALLET, nonce.message(), "signature")).thenReturn(true);
    when(tokenHasher.sha256(any())).thenReturn("token-hash");

    VerifyResponse response = service.verify(null, WALLET, "signature");

    assertThat(response.walletAddress()).isEqualTo(WALLET);
    verify(repository).deleteNonce(nonceId, WALLET);
  }

  @Test
  void usesUserFriendlyMessageWhenSessionIsMissing() {
    org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.authenticateBearerToken(null))
        .isInstanceOf(com.wallet.swap.common.ApiException.class)
        .hasMessage("Please sign in with your wallet to continue.");
  }
}
