package com.wallet.swap.notification;

import com.wallet.swap.auth.AuthService;
import com.wallet.swap.notification.FavoritePairModels.FavoritePairRequest;
import com.wallet.swap.notification.FavoritePairModels.FavoritePairResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/favorite-pairs")
public class FavoritePairController {
  private final AuthService authService;
  private final FavoritePairService favoritePairService;

  public FavoritePairController(AuthService authService, FavoritePairService favoritePairService) {
    this.authService = authService;
    this.favoritePairService = favoritePairService;
  }

  @GetMapping
  public List<FavoritePairResponse> list(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return favoritePairService.list(walletAddress);
  }

  @PostMapping
  public FavoritePairResponse save(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest,
      @Valid @RequestBody FavoritePairRequest request) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return favoritePairService.save(walletAddress, request);
  }

  @PutMapping("/{id}")
  public FavoritePairResponse update(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest,
      @PathVariable UUID id,
      @Valid @RequestBody FavoritePairRequest request) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    return favoritePairService.update(walletAddress, id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest httpRequest,
      @PathVariable UUID id) {
    String walletAddress = authService.authenticateRequest(authorization, httpRequest);
    favoritePairService.delete(walletAddress, id);
  }
}
