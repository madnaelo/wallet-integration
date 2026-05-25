package com.wallet.swap.autoswap;

import com.wallet.swap.auth.AuthService;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleRequest;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auto-swap/rules")
public class AutoSwapRuleController {
  private final AuthService authService;
  private final AutoSwapRuleService autoSwapRuleService;

  public AutoSwapRuleController(AuthService authService, AutoSwapRuleService autoSwapRuleService) {
    this.authService = authService;
    this.autoSwapRuleService = autoSwapRuleService;
  }

  @GetMapping
  public List<AutoSwapRuleResponse> list(
      @RequestHeader(name = "Authorization", required = false) String authorization) {
    String walletAddress = authService.authenticateBearerToken(authorization);
    return autoSwapRuleService.list(walletAddress);
  }

  @PostMapping
  public AutoSwapRuleResponse save(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      @Valid @RequestBody AutoSwapRuleRequest request) {
    String walletAddress = authService.authenticateBearerToken(authorization);
    return autoSwapRuleService.save(walletAddress, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      @PathVariable UUID id) {
    String walletAddress = authService.authenticateBearerToken(authorization);
    autoSwapRuleService.delete(walletAddress, id);
  }
}
