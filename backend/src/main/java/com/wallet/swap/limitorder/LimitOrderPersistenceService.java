package com.wallet.swap.limitorder;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.common.WalletMutationLock;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderRequest;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LimitOrderPersistenceService {
  private static final int MAX_ACTIVE_ORDERS_PER_WALLET = 100;

  private final LimitOrderRepository repository;
  private final WalletMutationLock walletMutationLock;

  public LimitOrderPersistenceService(
      LimitOrderRepository repository,
      WalletMutationLock walletMutationLock) {
    this.repository = repository;
    this.walletMutationLock = walletMutationLock;
  }

  @Transactional
  public LimitOrderResponse save(
      String walletAddress,
      LimitOrderRequest request,
      String executionSupport,
      String payloadHash) {
    walletMutationLock.lock(walletAddress);
    LimitOrderResponse saved = repository.findByOrderHash(request.orderHash())
        .map(existing -> requireIdempotentMatch(existing, walletAddress, request, payloadHash))
        .orElseGet(() -> insertNew(walletAddress, request, executionSupport, payloadHash));
    if (saved.executionStatus().equals("stored") || saved.executionStatus().equals("failed")) {
      repository.scheduleManualRetry(saved.id());
    }
    return saved;
  }

  private LimitOrderResponse insertNew(
      String walletAddress,
      LimitOrderRequest request,
      String executionSupport,
      String payloadHash) {
    requireAllowanceScopeAvailable(walletAddress, request);
    if (repository.countActiveForWallet(walletAddress) >= MAX_ACTIVE_ORDERS_PER_WALLET) {
      throw new ApiException(HttpStatus.CONFLICT, "This wallet has reached its active limit-order limit.");
    }
    return repository
        .insertIfAbsent(
            walletAddress,
            request,
            executionSupport,
            LimitOrderTerms.CURRENT_VERSION,
            payloadHash)
        .orElseGet(() -> existingIdempotentOrder(walletAddress, request, payloadHash));
  }

  private LimitOrderResponse existingIdempotentOrder(
      String walletAddress,
      LimitOrderRequest request,
      String payloadHash) {
    return repository.findByOrderHash(request.orderHash())
        .map(existing -> requireIdempotentMatch(existing, walletAddress, request, payloadHash))
        .orElseGet(() -> {
          requireAllowanceScopeAvailable(walletAddress, request);
          throw new IllegalStateException("Limit order conflict could not be resolved.");
        });
  }

  private void requireAllowanceScopeAvailable(
      String walletAddress,
      LimitOrderRequest request) {
    if (repository.existsActiveInAllowanceScope(
        walletAddress,
        request.chainId(),
        request.sellTokenAddress(),
        request.executionProvider())) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "Cancel the existing active order for this sell token before creating another with the same order service.");
    }
  }

  private LimitOrderResponse requireIdempotentMatch(
      LimitOrderResponse existing,
      String walletAddress,
      LimitOrderRequest request,
      String payloadHash) {
    if (!existing.walletAddress().equalsIgnoreCase(walletAddress)
        || !existing.signedPayloadHash().equalsIgnoreCase(payloadHash)
        || !existing.executionProvider().equals(request.executionProvider().trim())) {
      throw new ApiException(HttpStatus.CONFLICT, "This signed limit order conflicts with an existing order.");
    }
    return existing;
  }
}
