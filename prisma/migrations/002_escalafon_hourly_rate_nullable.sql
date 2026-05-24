-- hourly_rate es opcional para colegios del sector PÚBLICO
ALTER TABLE escalafon_types
  ALTER COLUMN hourly_rate DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS chk_hourly_rate_positive,
  ADD  CONSTRAINT chk_hourly_rate_positive CHECK (hourly_rate IS NULL OR hourly_rate > 0);
