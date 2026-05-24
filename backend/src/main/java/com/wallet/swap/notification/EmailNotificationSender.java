package com.wallet.swap.notification;

import com.wallet.swap.config.NotificationProperties;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
public class EmailNotificationSender {
  private final NotificationProperties properties;
  private final ObjectProvider<JavaMailSender> mailSenderProvider;

  public EmailNotificationSender(NotificationProperties properties, ObjectProvider<JavaMailSender> mailSenderProvider) {
    this.properties = properties;
    this.mailSenderProvider = mailSenderProvider;
  }

  public boolean isEnabled() {
    return properties.getEmail().isEnabled();
  }

  public void send(String to, String subject, String body) {
    if (!isEnabled()) throw new IllegalStateException("Email notifications are disabled.");
    if (to == null || to.isBlank()) throw new IllegalArgumentException("Email recipient is missing.");

    JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
    if (mailSender == null) throw new IllegalStateException("Email sender is not configured.");

    SimpleMailMessage message = new SimpleMailMessage();
    if (properties.getEmail().getFrom() != null && !properties.getEmail().getFrom().isBlank()) {
      message.setFrom(properties.getEmail().getFrom().trim());
    }
    message.setTo(to.trim());
    message.setSubject(subject);
    message.setText(body);
    mailSender.send(message);
  }
}
