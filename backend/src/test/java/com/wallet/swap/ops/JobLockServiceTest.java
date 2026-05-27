package com.wallet.swap.ops;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class JobLockServiceTest {
  @Test
  void returnsFalseWhenAnotherOwnerHoldsLock() {
    JdbcTemplate jdbcTemplate = new RecordingJdbcTemplate(List.of("another-owner"));
    JobLockService service = new JobLockService(jdbcTemplate);

    assertThat(service.tryAcquire("notification-monitor", Duration.ofMinutes(5))).isFalse();
  }

  @Test
  void releasesLockAfterSuccessfulRun() {
    RecordingJdbcTemplate jdbcTemplate = new RecordingJdbcTemplate();
    JobLockService service = new JobLockService(jdbcTemplate);
    boolean[] ran = { false };

    boolean acquired = service.runIfAcquired("notification-monitor", Duration.ofMinutes(5), () -> ran[0] = true);

    assertThat(acquired).isTrue();
    assertThat(ran[0]).isTrue();
    assertThat(jdbcTemplate.updateCalls).isEqualTo(1);
  }

  private static final class RecordingJdbcTemplate extends JdbcTemplate {
    private final List<String> queryRows;
    private int updateCalls = 0;

    private RecordingJdbcTemplate() {
      this.queryRows = null;
    }

    private RecordingJdbcTemplate(List<String> queryRows) {
      this.queryRows = queryRows;
    }

    @Override
    public <T> List<T> query(String sql, RowMapper<T> rowMapper, Object... args) {
      if (queryRows != null) {
        @SuppressWarnings("unchecked")
        List<T> rows = (List<T>) queryRows;
        return rows;
      }
      @SuppressWarnings("unchecked")
      T ownerId = (T) args[1];
      return List.of(ownerId);
    }

    @Override
    public int update(String sql, Object... args) {
      updateCalls += 1;
      return 1;
    }
  }
}
