package com.wallet.swap.contact;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.contact.ContactModels.ContactSubmissionRequest;
import com.wallet.swap.notification.NotificationOutboxRepository;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ContactSubmissionServiceTest {
  @Mock private ContactSubmissionRepository repository;
  @Mock private NotificationOutboxRepository outboxRepository;

  private NotificationProperties notificationProperties;
  private ContactSubmissionService service;

  @BeforeEach
  void setUp() {
    notificationProperties = new NotificationProperties();
    service = new ContactSubmissionService(repository, outboxRepository, notificationProperties);
  }

  @Test
  void storesNormalizedSubmissionAndQueuesPrivateEmail() {
    notificationProperties.getEmail().setEnabled(true);
    notificationProperties.getEmail().setContactRecipient("operator@example.com");
    when(repository.insert(any(), any(), eq("Aqeel"), eq("sender@example.com"), eq("technical"), any()))
        .thenReturn(true);

    var response = service.submit(new ContactSubmissionRequest(
        "  Aqeel  ",
        " Sender@Example.com ",
        "technical",
        "  I need help with a wallet connection.  ",
        ""));

    assertThat(response.accepted()).isTrue();
    verify(outboxRepository).enqueue(
        any(),
        eq("contact"),
        eq("email"),
        eq("operator@example.com"),
        eq("[Swap Assistant] New technical support message"),
        any(),
        any());
  }

  @Test
  void acceptsHoneypotWithoutPersistingOrSending() {
    var response = service.submit(new ContactSubmissionRequest(
        "Automated",
        "bot@example.com",
        "general",
        "This looks like a valid message.",
        "https://spam.example"));

    assertThat(response.accepted()).isTrue();
    verifyNoInteractions(repository, outboxRepository);
  }

  @Test
  void doesNotQueueEmailForDeduplicatedSubmission() {
    when(repository.insert(any(), any(), any(), any(), any(), any())).thenReturn(false);

    service.submit(new ContactSubmissionRequest(
        null,
        "sender@example.com",
        "general",
        "This is the same message again.",
        null));

    verify(outboxRepository, never()).enqueue(any(), any(), any(), any(), any(), any(), any());
  }

  @Test
  void rejectsTopicOutsideAllowList() {
    assertThatThrownBy(() -> service.submit(new ContactSubmissionRequest(
        null,
        "sender@example.com",
        "billing-admin",
        "Please process this unexpected topic.",
        null)))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("valid topic");
  }

  @Test
  void rejectsControlCharactersInMessage() {
    assertThatThrownBy(() -> service.submit(new ContactSubmissionRequest(
        null,
        "sender@example.com",
        "general",
        "Hello\u0000unexpected content",
        null)))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("at least 10 characters");
  }

  @Test
  void updatesKnownAdminStatusAndRejectsMissingMessage() {
    UUID id = UUID.randomUUID();
    when(repository.updateStatus(id, "resolved")).thenReturn(true);
    service.updateStatus(id, "resolved");
    verify(repository).updateStatus(id, "resolved");

    UUID missing = UUID.randomUUID();
    when(repository.updateStatus(missing, "spam")).thenReturn(false);
    assertThatThrownBy(() -> service.updateStatus(missing, "spam"))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("not found");
  }
}
