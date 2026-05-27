package com.wallet.swap.history;

import com.wallet.swap.auth.AuthService;
import com.wallet.swap.history.SwapHistoryModels.SaveSwapHistoryRequest;
import com.wallet.swap.history.SwapHistoryModels.SwapHistoryResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/swap-history")
public class SwapHistoryController {
  private final AuthService authService;
  private final SwapHistoryService swapHistoryService;

  public SwapHistoryController(AuthService authService, SwapHistoryService swapHistoryService) {
    this.authService = authService;
    this.swapHistoryService = swapHistoryService;
  }

  @PostMapping
  public SwapHistoryResponse save(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest,
      @Valid @RequestBody SaveSwapHistoryRequest request) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return swapHistoryService.save(walletAddress, request);
  }

  @GetMapping
  public List<SwapHistoryResponse> list(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest,
      @RequestParam(defaultValue = "25") int limit) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return swapHistoryService.list(walletAddress, limit);
  }
}
