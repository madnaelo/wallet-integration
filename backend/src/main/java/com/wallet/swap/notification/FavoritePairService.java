package com.wallet.swap.notification;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.common.WalletMutationLock;
import com.wallet.swap.notification.FavoritePairModels.FavoritePairRequest;
import com.wallet.swap.notification.FavoritePairModels.FavoritePairResponse;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FavoritePairService {
  private static final Set<String> ALERT_DIRECTIONS = Set.of("above", "below");
  private static final BigDecimal MIN_TARGET_GAP_RATIO = new BigDecimal("0.01");
  private static final BigDecimal MIN_TARGET_GAP_FLOOR = new BigDecimal("0.000000000000000001");
  private static final int MAX_FAVORITES_PER_WALLET = 250;

  private final FavoritePairRepository repository;
  private final WalletMutationLock walletMutationLock;

  public FavoritePairService(FavoritePairRepository repository, WalletMutationLock walletMutationLock) {
    this.repository = repository;
    this.walletMutationLock = walletMutationLock;
  }

  public List<FavoritePairResponse> list(String walletAddress) {
    return repository.listForWallet(walletAddress);
  }

  @Transactional
  public FavoritePairResponse save(String walletAddress, FavoritePairRequest request) {
    validate(request);
    FavoritePairRequest normalized = normalized(request);
    walletMutationLock.lock(walletAddress);
    if (repository.countForWallet(walletAddress) >= MAX_FAVORITES_PER_WALLET) {
      throw new ApiException(HttpStatus.CONFLICT, "This wallet has reached its saved-pair limit.");
    }
    validateTargetSpacing(walletAddress, normalized, null);
    return repository.insert(walletAddress, normalized);
  }

  @Transactional
  public FavoritePairResponse update(String walletAddress, UUID id, FavoritePairRequest request) {
    validate(request);
    FavoritePairRequest normalized = normalized(request);
    walletMutationLock.lock(walletAddress);
    validateTargetSpacing(walletAddress, normalized, id);
    return repository.update(walletAddress, id, normalized)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Favorite pair was not found."));
  }

  public void delete(String walletAddress, UUID id) {
    repository.delete(walletAddress, id);
  }

  private void validate(FavoritePairRequest request) {
    if (request.chainId() == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Network is required.");
    }
    if (request.sellTokenAddress() == null || request.buyTokenAddress() == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Choose two different tokens.");
    }
    if (request.sellTokenDecimals() == null || request.buyTokenDecimals() == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Token decimals are required.");
    }
    if (request.sellTokenAddress().trim().equalsIgnoreCase(request.buyTokenAddress().trim())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Choose two different tokens.");
    }

    String direction = normalizeDirection(request.alertDirection());
    if (!ALERT_DIRECTIONS.contains(direction)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Favorite pair alert direction must be above or below.");
    }

    BigDecimal targetRate = request.targetRate();
    if (targetRate != null && targetRate.signum() <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Favorite pair target rate must be greater than zero.");
    }
    if (Boolean.TRUE.equals(request.alertsEnabled()) && targetRate == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Set a target rate before enabling alerts.");
    }
  }

  private void validateTargetSpacing(String walletAddress, FavoritePairRequest request, UUID excludedId) {
    BigDecimal targetRate = request.targetRate();
    if (targetRate == null) {
      if (repository.existsUntargetedForPair(walletAddress, request, excludedId)) {
        throw new ApiException(HttpStatus.CONFLICT, "This favorite pair is already saved without a target.");
      }
      return;
    }

    for (FavoritePairRepository.FavoritePairTarget existing : repository.listTargetsForPair(walletAddress, request, excludedId)) {
      BigDecimal existingTarget = existing.targetRate();
      BigDecimal minimumGap = existingTarget.min(targetRate)
          .multiply(MIN_TARGET_GAP_RATIO)
          .setScale(18, RoundingMode.HALF_UP)
          .max(MIN_TARGET_GAP_FLOOR);
      BigDecimal actualGap = existingTarget.subtract(targetRate).abs();
      if (actualGap.compareTo(minimumGap) < 0) {
        throw new ApiException(
            HttpStatus.CONFLICT,
            "Use a target at least 1% away from another saved alert for this pair and direction.");
      }
    }
  }

  private FavoritePairRequest normalized(FavoritePairRequest request) {
    return new FavoritePairRequest(
        request.chainId(),
        request.sellTokenAddress().trim(),
        request.sellTokenSymbol().trim(),
        request.sellTokenDecimals(),
        request.buyTokenAddress().trim(),
        request.buyTokenSymbol().trim(),
        request.buyTokenDecimals(),
        request.targetRate(),
        normalizeDirection(request.alertDirection()),
        request.alertsEnabled());
  }

  private String normalizeDirection(String direction) {
    return direction == null || direction.isBlank() ? "above" : direction.trim().toLowerCase(Locale.ROOT);
  }
}
