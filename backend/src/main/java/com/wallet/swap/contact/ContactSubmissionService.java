package com.wallet.swap.contact;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.contact.ContactModels.ContactSubmissionRecord;
import com.wallet.swap.contact.ContactModels.ContactSubmissionRequest;
import com.wallet.swap.contact.ContactModels.ContactSubmissionResponse;
import com.wallet.swap.notification.NotificationOutboxRepository;
import com.wallet.swap.config.NotificationProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ContactSubmissionService {
  private static final Set<String> TOPICS = Set.of(
      "general",
      "technical",
      "privacy",
      "partnership",
      "legal");
  private static final Set<String> STATUSES = Set.of("new", "reviewed", "resolved", "spam");
  private static final long DEDUPE_WINDOW_SECONDS = 600;

  private final ContactSubmissionRepository repository;
  private final NotificationOutboxRepository outboxRepository;
  private final NotificationProperties notificationProperties;

  public ContactSubmissionService(
      ContactSubmissionRepository repository,
      NotificationOutboxRepository outboxRepository,
      NotificationProperties notificationProperties) {
    this.repository = repository;
    this.outboxRepository = outboxRepository;
    this.notificationProperties = notificationProperties;
  }

  @Transactional
  public ContactSubmissionResponse submit(ContactSubmissionRequest request) {
    if (request.website() != null && !request.website().isBlank()) {
      return new ContactSubmissionResponse(true);
    }

    String email = singleLine(request.email(), "Enter a valid email address.").toLowerCase(Locale.ROOT);
    String name = optionalSingleLine(request.name(), "Name contains unsupported characters.");
    String topic = normalizeTopic(request.topic());
    String message = multiline(request.message());
    UUID id = UUID.randomUUID();
    String dedupeHash = dedupeHash(email, topic, message, Instant.now());

    if (repository.insert(id, dedupeHash, name, email, topic, message)) {
      enqueueOperatorNotification(id, name, email, topic, message);
    }
    return new ContactSubmissionResponse(true);
  }

  public List<ContactSubmissionRecord> list(String rawStatus, int requestedLimit) {
    String status = normalizeStatus(rawStatus, true);
    int limit = Math.max(1, Math.min(100, requestedLimit));
    return repository.list(status, limit);
  }

  public void updateStatus(UUID id, String rawStatus) {
    String status = normalizeStatus(rawStatus, false);
    if (!repository.updateStatus(id, status)) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Contact message not found.");
    }
  }

  private void enqueueOperatorNotification(
      UUID id,
      String name,
      String email,
      String topic,
      String message) {
    NotificationProperties.Email emailProperties = notificationProperties.getEmail();
    String recipient = text(emailProperties.getContactRecipient());
    if (!emailProperties.isEnabled() || recipient.isBlank()) return;

    String displayName = name == null ? "Not provided" : name;
    String subject = "[Swap Assistant] New " + topicLabel(topic) + " message";
    String body = String.join(
        System.lineSeparator(),
        "A new message was received through the Swap Assistant contact form.",
        "",
        "Reference: " + id,
        "Topic: " + topicLabel(topic),
        "Name: " + displayName,
        "Reply email: " + email,
        "",
        "Message:",
        message);
    outboxRepository.enqueue(
        "contact:" + id,
        "contact",
        "email",
        recipient,
        subject,
        body,
        Map.of("submissionId", id.toString()));
  }

  private String normalizeTopic(String value) {
    String topic = text(value).toLowerCase(Locale.ROOT);
    if (!TOPICS.contains(topic)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Choose a valid topic.");
    }
    return topic;
  }

  private String normalizeStatus(String value, boolean optional) {
    String status = text(value).toLowerCase(Locale.ROOT);
    if (status.isBlank() && optional) return null;
    if (!STATUSES.contains(status)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Choose a valid contact message status.");
    }
    return status;
  }

  private String optionalSingleLine(String value, String errorMessage) {
    String normalized = text(value);
    if (normalized.isBlank()) return null;
    return singleLine(normalized, errorMessage);
  }

  private String singleLine(String value, String errorMessage) {
    String normalized = text(value);
    if (normalized.isBlank() || containsDisallowedControl(normalized) || normalized.contains("\n")
        || normalized.contains("\r")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, errorMessage);
    }
    return normalized;
  }

  private String multiline(String value) {
    String normalized = text(value).replace("\r\n", "\n").replace('\r', '\n');
    if (normalized.length() < 10 || containsDisallowedControl(normalized)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a message of at least 10 characters.");
    }
    return normalized;
  }

  private boolean containsDisallowedControl(String value) {
    return value.chars().anyMatch(character ->
        Character.isISOControl(character) && character != '\n' && character != '\t');
  }

  private String dedupeHash(String email, String topic, String message, Instant now) {
    long timeBucket = now.getEpochSecond() / DEDUPE_WINDOW_SECONDS;
    String source = email + "\u0000" + topic + "\u0000" + message + "\u0000" + timeBucket;
    try {
      byte[] hash = MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(hash);
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("SHA-256 is not available.", exception);
    }
  }

  private String topicLabel(String topic) {
    return switch (topic) {
      case "technical" -> "technical support";
      case "privacy" -> "privacy";
      case "partnership" -> "partnership";
      case "legal" -> "legal";
      default -> "general";
    };
  }

  private String text(String value) {
    return value == null ? "" : value.trim();
  }
}
