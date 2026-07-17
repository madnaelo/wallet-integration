package com.wallet.swap.limitorder;

import com.wallet.swap.config.LimitOrderProperties;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCapabilityRequest;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCapabilityResponse;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class LimitOrderCapabilityService {
  static final String COW_PROTOCOL_PROVIDER = "cow_protocol";
  static final String ONEINCH_PROVIDER = "1inch_orderbook";

  private static final Set<Long> COW_ORDERBOOK_CHAINS =
      Set.of(1L, 56L, 100L, 137L, 8453L, 42161L, 43114L, 57073L, 59144L, 9745L);
  private static final Set<Long> ONEINCH_ORDERBOOK_CHAINS = Set.of(1L, 56L, 137L, 10L, 42161L, 43114L, 8453L);
  private final LimitOrderProperties properties;

  public LimitOrderCapabilityService(LimitOrderProperties properties) {
    this.properties = properties;
  }

  public LimitOrderCapabilityResponse check(LimitOrderCapabilityRequest request) {
    if (request == null || request.chainId() == null) return unsupported("Choose a network.");
    if (!isEvmContract(request.sellTokenAddress()) || !isEvmContract(request.buyTokenAddress())) {
      return unsupported("Automatic execution currently requires EVM contract tokens. Native assets and native BTC stay on alerts until a safe signed-intent adapter is available.");
    }
    if (sameToken(request.sellTokenAddress(), request.buyTokenAddress())) {
      return unsupported("Choose two different tokens.");
    }
    if (COW_ORDERBOOK_CHAINS.contains(request.chainId())) {
      return supported(
          COW_PROTOCOL_PROVIDER,
          "This pair can use a CoW Protocol signed limit order. Solvers can execute only inside the exact terms you sign.",
          "EIP-712 CoW Protocol order signature");
    }
    if (properties.isOneinchOrderbookEnabled()
        && ONEINCH_ORDERBOOK_CHAINS.contains(request.chainId())) {
      return supported(
          ONEINCH_PROVIDER,
          "This pair can use a 1inch signed limit order. The protocol can execute only inside the exact terms you sign.",
          "EIP-712 1inch limit order signature");
    }
    return unsupported("Automatic execution is not available on this network yet.");
  }

  private LimitOrderCapabilityResponse supported(String provider, String reason, String requiredSignature) {
    return new LimitOrderCapabilityResponse(
        true,
        provider,
        "supported",
        reason,
        requiredSignature,
        "High",
        LimitOrderTerms.CURRENT_VERSION);
  }

  private LimitOrderCapabilityResponse unsupported(String reason) {
    return new LimitOrderCapabilityResponse(
        false,
        "none",
        "unsupported",
        reason,
        "Unavailable for this pair",
        "High",
        LimitOrderTerms.CURRENT_VERSION);
  }

  private boolean isEvmContract(String value) {
    return value != null && value.matches("(?i)^0x[0-9a-f]{40}$");
  }

  private boolean sameToken(String first, String second) {
    return first != null && second != null && first.trim().equalsIgnoreCase(second.trim());
  }
}
