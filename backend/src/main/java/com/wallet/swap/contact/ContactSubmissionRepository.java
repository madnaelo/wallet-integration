package com.wallet.swap.contact;

import com.wallet.swap.contact.ContactModels.ContactSubmissionRecord;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ContactSubmissionRepository {
  private final JdbcTemplate jdbcTemplate;

  public ContactSubmissionRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public boolean insert(
      UUID id,
      String dedupeHash,
      String name,
      String email,
      String topic,
      String message) {
    return jdbcTemplate.update(
        """
        INSERT INTO contact_submissions (
          id, dedupe_hash, sender_name, sender_email, topic, message
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (dedupe_hash) DO NOTHING
        """,
        id,
        dedupeHash,
        name,
        email,
        topic,
        message) > 0;
  }

  public List<ContactSubmissionRecord> list(String status, int limit) {
    if (status == null) {
      return jdbcTemplate.query(
          """
          SELECT id, sender_name, sender_email, topic, message, status, created_at, updated_at
          FROM contact_submissions
          ORDER BY created_at DESC
          LIMIT ?
          """,
          this::mapRow,
          limit);
    }
    return jdbcTemplate.query(
        """
        SELECT id, sender_name, sender_email, topic, message, status, created_at, updated_at
        FROM contact_submissions
        WHERE status = ?
        ORDER BY created_at DESC
        LIMIT ?
        """,
        this::mapRow,
        status,
        limit);
  }

  public boolean updateStatus(UUID id, String status) {
    return jdbcTemplate.update(
        """
        UPDATE contact_submissions
        SET status = ?, updated_at = now()
        WHERE id = ?
        """,
        status,
        id) > 0;
  }

  private ContactSubmissionRecord mapRow(ResultSet rs, int rowNum) throws SQLException {
    return new ContactSubmissionRecord(
        rs.getObject("id", UUID.class),
        rs.getString("sender_name"),
        rs.getString("sender_email"),
        rs.getString("topic"),
        rs.getString("message"),
        rs.getString("status"),
        rs.getTimestamp("created_at").toInstant(),
        rs.getTimestamp("updated_at").toInstant());
  }
}
