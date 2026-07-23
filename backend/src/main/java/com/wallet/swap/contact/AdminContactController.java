package com.wallet.swap.contact;

import com.wallet.swap.contact.ContactModels.ContactStatusUpdateRequest;
import com.wallet.swap.contact.ContactModels.ContactSubmissionRecord;
import com.wallet.swap.feature.AdminAuthService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/contact-submissions")
public class AdminContactController {
  private final AdminAuthService adminAuthService;
  private final ContactSubmissionService service;

  public AdminContactController(AdminAuthService adminAuthService, ContactSubmissionService service) {
    this.adminAuthService = adminAuthService;
    this.service = service;
  }

  @GetMapping
  public List<ContactSubmissionRecord> list(
      @RequestHeader(name = "X-Admin-Key", required = false) String adminApiKey,
      @RequestParam(required = false) String status,
      @RequestParam(defaultValue = "50") int limit) {
    adminAuthService.requireAdminApiKey(adminApiKey);
    return service.list(status, limit);
  }

  @PatchMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void updateStatus(
      @RequestHeader(name = "X-Admin-Key", required = false) String adminApiKey,
      @PathVariable UUID id,
      @Valid @RequestBody ContactStatusUpdateRequest request) {
    adminAuthService.requireAdminApiKey(adminApiKey);
    service.updateStatus(id, request.status());
  }
}
