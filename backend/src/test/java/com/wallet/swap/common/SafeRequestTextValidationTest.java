package com.wallet.swap.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.wallet.swap.history.SwapHistoryModels.SaveSwapHistoryRequest;
import com.wallet.swap.notification.FavoritePairModels.FavoritePairRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class SafeRequestTextValidationTest {
  private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

  @Test
  void rejectsControlAndBidirectionalCharactersInPersistedTokenMetadata() {
    SaveSwapHistoryRequest history = new SaveSwapHistoryRequest(
        1L,
        null,
        "dry_run",
        "ETH",
        "E\nTH",
        18,
        "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USDT",
        6,
        "1000000000000000000",
        "2000000000",
        null,
        "Provider",
        null);
    FavoritePairRequest favorite = new FavoritePairRequest(
        1L,
        "ETH",
        "ETH",
        18,
        "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USD\u202eT",
        6,
        BigDecimal.valueOf(2_000),
        "above",
        true);

    assertThat(validator.validate(history)).anyMatch(
        violation -> violation.getPropertyPath().toString().equals("sellTokenSymbol"));
    assertThat(validator.validate(favorite)).anyMatch(
        violation -> violation.getPropertyPath().toString().equals("buyTokenSymbol"));
  }

  @Test
  void acceptsNormalTokenMetadata() {
    FavoritePairRequest favorite = new FavoritePairRequest(
        1L,
        "ETH",
        "ETH",
        18,
        "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USDT",
        6,
        BigDecimal.valueOf(2_000),
        "above",
        true);

    assertThat(validator.validate(favorite)).isEmpty();
  }
}
