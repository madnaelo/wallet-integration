package com.wallet.swap.feature;

import com.wallet.swap.feature.FeatureModels.FeatureFlagResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class FeatureFlagRepository {
  private final JdbcTemplate jdbcTemplate;

  public FeatureFlagRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public Optional<FeatureFlagResponse> find(String featureKey) {
    List<FeatureFlagResponse> rows = jdbcTemplate.query(
        """
        SELECT feature_key, enabled, updated_at
        FROM app_feature_flags
        WHERE feature_key = ?
        """,
        (rs, rowNum) -> mapRow(rs),
        featureKey);
    return rows.stream().findFirst();
  }

  public FeatureFlagResponse upsert(String featureKey, boolean enabled, String updatedBy) {
    return jdbcTemplate.queryForObject(
        """
        INSERT INTO app_feature_flags (feature_key, enabled, updated_by, updated_at)
        VALUES (?, ?, ?, now())
        ON CONFLICT (feature_key)
        DO UPDATE SET enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now()
        RETURNING feature_key, enabled, updated_at
        """,
        (rs, rowNum) -> mapRow(rs),
        featureKey,
        enabled,
        updatedBy);
  }

  private FeatureFlagResponse mapRow(ResultSet rs) throws SQLException {
    return new FeatureFlagResponse(
        rs.getString("feature_key"),
        rs.getBoolean("enabled"),
        timestampToInstant(rs.getTimestamp("updated_at")));
  }

  private Instant timestampToInstant(Timestamp timestamp) {
    return timestamp == null ? null : timestamp.toInstant();
  }
}
