-- ── 032: Política de tratamiento de datos por colegio ────────────────────────

ALTER TABLE schools
  ADD COLUMN privacy_policy_url VARCHAR(500);

ALTER TABLE students
  ADD COLUMN data_policy_accepted_at TIMESTAMPTZ;
