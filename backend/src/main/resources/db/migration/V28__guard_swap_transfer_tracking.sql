UPDATE swap_history
SET provider_status = 'TRACKING_PAUSED',
    provider_substatus = 'INVALID_SOURCE_TRANSACTION',
    status_check_error = 'Automatic delivery tracking requires a valid source transaction identifier.',
    next_status_check_at = NULL,
    updated_at = now()
WHERE next_status_check_at IS NOT NULL
  AND (tx_hash IS NULL OR NOT (
    tx_hash ~* '^(0x)?[0-9a-f]{64}$'
    OR tx_hash ~ '^[1-9A-HJ-NP-Za-km-z]{80,90}$'
  ));
