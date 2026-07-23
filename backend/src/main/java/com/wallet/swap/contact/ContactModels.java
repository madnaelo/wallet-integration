package com.wallet.swap.contact;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class ContactModels {
  private ContactModels() {}

  public record ContactSubmissionRequest(
      @Size(max = 80) String name,
      @NotBlank @Email @Size(max = 254) String email,
      @NotBlank @Size(max = 32) String topic,
      @NotBlank @Size(min = 10, max = 3_000) String message,
      @Size(max = 200) String website) {}

  public record ContactSubmissionResponse(boolean accepted) {}

  public record ContactSubmissionRecord(
      UUID id,
      String name,
      String email,
      String topic,
      String message,
      String status,
      Instant createdAt,
      Instant updatedAt) {}

  public record ContactStatusUpdateRequest(
      @NotBlank
      @Pattern(regexp = "new|reviewed|resolved|spam")
      String status) {}
}
