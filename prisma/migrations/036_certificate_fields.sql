-- ── 036: Subtipos de certificado, segunda firma y estado del estudiante ──────

ALTER TABLE schools
  ADD COLUMN secretary_name      VARCHAR(150),
  ADD COLUMN secretary_signature TEXT;

ALTER TABLE service_fees
  ADD COLUMN certificate_subtype      VARCHAR(30),
  ADD COLUMN include_second_signature BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN default_student_status   VARCHAR(30);
