-- ── 043: Código único de certificado ────

CREATE TABLE certificates (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id            UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id           UUID REFERENCES students(id) ON DELETE SET NULL,
  enrollment_id        UUID REFERENCES enrollments(id) ON DELETE SET NULL,
  service_fee_id       UUID REFERENCES service_fees(id) ON DELETE SET NULL,
  certificate_code     VARCHAR(30) NOT NULL UNIQUE,
  certificate_subtype  VARCHAR(30),
  student_status       VARCHAR(30),
  issued_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  issued_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_certificates_school ON certificates(school_id);
