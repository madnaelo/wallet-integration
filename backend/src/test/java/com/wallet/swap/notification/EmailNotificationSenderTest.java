package com.wallet.swap.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.wallet.swap.config.NotificationProperties;
import jakarta.mail.internet.InternetAddress;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

class EmailNotificationSenderTest {
  private final NotificationProperties properties = new NotificationProperties();
  private final DefaultListableBeanFactory beans = new DefaultListableBeanFactory();
  private final JavaMailSender mailSender = mock(JavaMailSender.class);
  private final EmailNotificationSender sender = new EmailNotificationSender(
      properties, beans.getBeanProvider(JavaMailSender.class));

  @Test
  void preservesBrandedSenderAndPrivateRecipient() throws Exception {
    beans.registerSingleton("mailSender", mailSender);
    properties.getEmail().setEnabled(true);
    properties.getEmail().setFrom(" Swap Assistant <sender@example.com> ");

    sender.send(" operator@example.com ", "New enquiry", "Reply to the visitor.");

    var sent = ArgumentCaptor.forClass(SimpleMailMessage.class);
    verify(mailSender).send(sent.capture());
    var message = sent.getValue();
    var from = new InternetAddress(message.getFrom(), true);
    assertThat(from.getPersonal()).isEqualTo("Swap Assistant");
    assertThat(from.getAddress()).isEqualTo("sender@example.com");
    assertThat(message.getTo()).containsExactly("operator@example.com");
    assertThat(message.getSubject()).isEqualTo("New enquiry");
    assertThat(message.getText()).isEqualTo("Reply to the visitor.");
  }

  @Test
  void doesNotSendWhenDisabled() {
    beans.registerSingleton("mailSender", mailSender);
    assertThatThrownBy(() -> sender.send("operator@example.com", "Subject", "Body"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Email notifications are disabled.");
    verifyNoInteractions(mailSender);
  }

  @Test
  void reportsMissingTransportForOutboxRetry() {
    properties.getEmail().setEnabled(true);
    assertThatThrownBy(() -> sender.send("operator@example.com", "Subject", "Body"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Email sender is not configured.");
  }
}
