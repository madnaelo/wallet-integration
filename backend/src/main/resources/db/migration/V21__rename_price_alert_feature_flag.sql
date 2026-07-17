INSERT INTO app_feature_flags (feature_key, enabled, updated_by, updated_at)
SELECT 'price_alerts', enabled, updated_by, updated_at
FROM app_feature_flags
WHERE feature_key = 'auto_swap'
ON CONFLICT (feature_key) DO NOTHING;

DELETE FROM app_feature_flags
WHERE feature_key = 'auto_swap';
