-- ── 044: Catálogo de motivos de pre-informe (configurable por colegio) ────

CREATE TABLE pre_informe_reasons (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  label      VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pre_informe_reasons_school ON pre_informe_reasons(school_id);
