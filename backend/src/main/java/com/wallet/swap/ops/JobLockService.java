package com.wallet.swap.ops;

import java.lang.management.ManagementFactory;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class JobLockService {
  private final JdbcTemplate jdbcTemplate;
  private final String ownerId;

  public JobLockService(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
    this.ownerId = ManagementFactory.getRuntimeMXBean().getName() + ":" + UUID.randomUUID();
  }

  public boolean runIfAcquired(String lockName, Duration ttl, Runnable action) {
    if (!tryAcquire(lockName, ttl)) return false;
    try {
      action.run();
      return true;
    } finally {
      release(lockName);
    }
  }

  boolean tryAcquire(String lockName, Duration ttl) {
    long ttlMs = Math.max(1_000, ttl.toMillis());
    List<String> rows = jdbcTemplate.query(
        """
        INSERT INTO job_locks (lock_name, owner_id, locked_until, updated_at)
        VALUES (?, ?, now() + (? * interval '1 millisecond'), now())
        ON CONFLICT (lock_name)
        DO UPDATE SET
          owner_id = excluded.owner_id,
          locked_until = excluded.locked_until,
          updated_at = now()
        WHERE job_locks.locked_until <= now()
           OR job_locks.owner_id = excluded.owner_id
        RETURNING owner_id
        """,
        (rs, rowNum) -> rs.getString("owner_id"),
        lockName,
        ownerId,
        ttlMs);
    return rows.stream().anyMatch(ownerId::equals);
  }

  void release(String lockName) {
    jdbcTemplate.update(
        """
        UPDATE job_locks
        SET locked_until = now(), updated_at = now()
        WHERE lock_name = ? AND owner_id = ?
        """,
        lockName,
        ownerId);
  }
}
