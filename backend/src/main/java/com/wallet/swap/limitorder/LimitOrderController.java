package com.wallet.swap.limitorder;

import com.wallet.swap.auth.AuthService;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCapabilityRequest;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCapabilityResponse;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCancellationPlanResponse;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCancellationRequest;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderRequest;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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
  private final LimitOrderCancellationService cancellationService;

  public LimitOrderController(
      AuthService authService,
      LimitOrderService limitOrderService,
      LimitOrderCancellationService cancellationService) {
    this.authService = authService;
    this.limitOrderService = limitOrderService;
    this.cancellationService = cancellationService;
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

  @GetMapping("/{id}/cancellation-plan")
  public LimitOrderCancellationPlanResponse cancellationPlan(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest,
      @PathVariable UUID id) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return cancellationService.plan(walletAddress, id);
  }

  @PostMapping("/{id}/cancel")
  public LimitOrderResponse cancel(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest,
      @PathVariable UUID id,
      @Valid @RequestBody LimitOrderCancellationRequest request) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return cancellationService.cancel(walletAddress, id, request);
  }
}
