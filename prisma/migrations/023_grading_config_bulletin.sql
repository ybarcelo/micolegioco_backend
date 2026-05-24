ALTER TABLE grading_scale_config
  ADD COLUMN IF NOT EXISTS bulletin_header      VARCHAR(20) NOT NULL DEFAULT 'LOGO_LEFT',
  ADD COLUMN IF NOT EXISTS include_achievements BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS secondary_logo       TEXT        NULL;

ALTER TABLE grading_scale_config
  ADD CONSTRAINT chk_bulletin_header
  CHECK (bulletin_header IN ('LOGO_LEFT', 'LOGO_RIGHT', 'LOGO_BOTH'));
