package com.wallet.swap.pricealert;

import com.wallet.swap.auth.AuthService;
import com.wallet.swap.pricealert.PriceAlertModels.PriceAlertRequest;
import com.wallet.swap.pricealert.PriceAlertModels.PriceAlertResponse;
import jakarta.servlet.http.HttpServletRequest;
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
@RequestMapping("/api/price-alerts/rules")
public class PriceAlertController {
  private final AuthService authService;
  private final PriceAlertService priceAlertService;

  public PriceAlertController(AuthService authService, PriceAlertService priceAlertService) {
    this.authService = authService;
    this.priceAlertService = priceAlertService;
  }

  @GetMapping
  public List<PriceAlertResponse> list(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return priceAlertService.list(walletAddress);
  }

  @PostMapping
  public PriceAlertResponse save(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest,
      @Valid @RequestBody PriceAlertRequest request) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return priceAlertService.save(walletAddress, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest,
      @PathVariable UUID id) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    priceAlertService.delete(walletAddress, id);
  }
}
