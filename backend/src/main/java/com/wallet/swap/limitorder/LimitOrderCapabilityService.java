package com.wallet.swap.limitorder;

import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCapabilityRequest;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCapabilityResponse;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class LimitOrderCapabilityService {
  private static final Set<Long> ONEINCH_ORDERBOOK_CHAINS = Set.of(1L, 56L, 137L, 10L, 42161L, 43114L, 8453L);
  private static final String ONEINCH_PROVIDER = "1inch_orderbook";

  public LimitOrderCapabilityResponse check(LimitOrderCapabilityRequest request) {
    if (request == null || request.chainId() == null) return unsupported("Choose a network.");
    if (!ONEINCH_ORDERBOOK_CHAINS.contains(request.chainId())) {
      return unsupported("Automatic execution is not available on this network yet.");
    }
    if (!isEvmContract(request.sellTokenAddress()) || !isEvmContract(request.buyTokenAddress())) {
      return unsupported("Automatic execution currently requires EVM contract tokens. Native assets and native BTC stay on alerts until a safe signed-intent adapter is available.");
    }
    if (sameToken(request.sellTokenAddress(), request.buyTokenAddress())) {
      return unsupported("Choose two different tokens.");
    }
    return new LimitOrderCapabilityResponse(
        true,
        ONEINCH_PROVIDER,
        "supported",
        "This pair can use a protocol-verifiable signed EVM limit order when the wallet supports EIP-712 typed-data signing.",
        "EIP-712 limit order signature",
        "High");
  }

  private LimitOrderCapabilityResponse unsupported(String reason) {
    return new LimitOrderCapabilityResponse(
        false,
        "none",
        "unsupported",
        reason,
        "Unavailable for this pair",
        "High");
  }

  private boolean isEvmContract(String value) {
    return value != null && value.matches("(?i)^0x[0-9a-f]{40}$");
  }

  private boolean sameToken(String first, String second) {
    return first != null && second != null && first.trim().equalsIgnoreCase(second.trim());
  }
}
