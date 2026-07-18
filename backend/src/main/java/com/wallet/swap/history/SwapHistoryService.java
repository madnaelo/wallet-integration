package com.wallet.swap.history;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.history.SwapHistoryModels.SaveSwapHistoryRequest;
import com.wallet.swap.history.SwapHistoryModels.SwapHistoryResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class SwapHistoryService {
  private static final Set<String> ALLOWED_STATUSES = Set.of("dry_run", "submitted", "confirmed", "failed");
  private static final int MAX_QUOTE_JSON_BYTES = 65_536;

  private final SwapHistoryRepository swapHistoryRepository;

  public SwapHistoryService(SwapHistoryRepository swapHistoryRepository) {
    this.swapHistoryRepository = swapHistoryRepository;
  }

  public SwapHistoryResponse save(String walletAddress, SaveSwapHistoryRequest request) {
    validate(request);
    return swapHistoryRepository.save(walletAddress, request);
  }

  public List<SwapHistoryResponse> list(String walletAddress, int limit) {
    int boundedLimit = Math.max(1, Math.min(limit, 100));
    return swapHistoryRepository.listForWallet(walletAddress, boundedLimit);
  }

  private void validate(SaveSwapHistoryRequest request) {
    if (!ALLOWED_STATUSES.contains(request.status())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid swap status.");
    }
    validateIntegerString(request.sellAmountRaw(), "sellAmountRaw");
    validateIntegerString(request.buyAmountRaw(), "buyAmountRaw");
    if (request.minBuyAmountRaw() != null && !request.minBuyAmountRaw().isBlank()) {
      validateIntegerString(request.minBuyAmountRaw(), "minBuyAmountRaw");
    }
    if (request.quote() != null
        && request.quote().toString().getBytes(StandardCharsets.UTF_8).length > MAX_QUOTE_JSON_BYTES) {
      throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Saved swap details are too large.");
    }
  }

  private void validateIntegerString(String value, String field) {
    if (value == null || !value.matches("^\\d+$")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, field + " must be an integer base-unit amount.");
    }
  }
}
