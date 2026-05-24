package com.wallet.swap.notification;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.notification.FavoritePairModels.FavoritePairRequest;
import com.wallet.swap.notification.FavoritePairModels.FavoritePairResponse;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class FavoritePairService {
  private static final Set<String> ALERT_DIRECTIONS = Set.of("above", "below");

  private final FavoritePairRepository repository;

  public FavoritePairService(FavoritePairRepository repository) {
    this.repository = repository;
  }

  public List<FavoritePairResponse> list(String walletAddress) {
    return repository.listForWallet(walletAddress);
  }

  public FavoritePairResponse save(String walletAddress, FavoritePairRequest request) {
    validate(request);
    return repository.upsert(walletAddress, normalized(request));
  }

  public FavoritePairResponse update(String walletAddress, UUID id, FavoritePairRequest request) {
    validate(request);
    return repository.update(walletAddress, id, normalized(request));
  }

  public void delete(String walletAddress, UUID id) {
    repository.delete(walletAddress, id);
  }

  private void validate(FavoritePairRequest request) {
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
    return direction == null || direction.isBlank() ? "above" : direction.trim().toLowerCase();
  }
}
