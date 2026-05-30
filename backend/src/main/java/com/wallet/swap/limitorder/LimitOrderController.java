package com.wallet.swap.limitorder;

import com.wallet.swap.auth.AuthService;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCapabilityRequest;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCapabilityResponse;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderRequest;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/limit-orders")
public class LimitOrderController {
  private final AuthService authService;
  private final LimitOrderService limitOrderService;

  public LimitOrderController(AuthService authService, LimitOrderService limitOrderService) {
    this.authService = authService;
    this.limitOrderService = limitOrderService;
  }

  @PostMapping("/capability")
  public LimitOrderCapabilityResponse capability(@Valid @RequestBody LimitOrderCapabilityRequest request) {
    return limitOrderService.capability(request);
  }

  @GetMapping
  public List<LimitOrderResponse> list(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return limitOrderService.list(walletAddress);
  }

  @PostMapping
  public LimitOrderResponse save(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest,
      @Valid @RequestBody LimitOrderRequest request) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return limitOrderService.save(walletAddress, request);
  }
}
