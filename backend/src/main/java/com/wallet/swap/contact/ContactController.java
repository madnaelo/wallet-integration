package com.wallet.swap.contact;

import com.wallet.swap.contact.ContactModels.ContactSubmissionRequest;
import com.wallet.swap.contact.ContactModels.ContactSubmissionResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/contact")
public class ContactController {
  private final ContactSubmissionService service;

  public ContactController(ContactSubmissionService service) {
    this.service = service;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.ACCEPTED)
  public ContactSubmissionResponse submit(@Valid @RequestBody ContactSubmissionRequest request) {
    return service.submit(request);
  }
}
