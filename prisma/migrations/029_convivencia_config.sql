-- ── 029: Valoración de Convivencia ──────────────────────────────────────────

-- Configuración por colegio
ALTER TABLE grading_scale_config
  ADD COLUMN include_convivencia BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN convivencia_scale   VARCHAR(20) NOT NULL DEFAULT 'QUALITATIVE'
    CHECK (convivencia_scale IN ('QUALITATIVE', 'NUMERIC'));

-- Nota de convivencia por estudiante y período
CREATE TABLE student_convivencia_grades (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id          UUID        NOT NULL REFERENCES schools(id)          ON DELETE CASCADE,
  enrollment_id      UUID        NOT NULL REFERENCES enrollments(id)      ON DELETE CASCADE,
  academic_period_id UUID        NOT NULL REFERENCES academic_periods(id) ON DELETE CASCADE,
  qualitative_grade  VARCHAR(5),           -- NS | A | S | MS
  numeric_grade      DECIMAL(4,2),         -- 1.0 – 5.0
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_student_convivencia UNIQUE (enrollment_id, academic_period_id)
);

CREATE INDEX idx_student_convivencia_school  ON student_convivencia_grades(school_id);
CREATE INDEX idx_student_convivencia_enroll  ON student_convivencia_grades(enrollment_id);
CREATE INDEX idx_student_convivencia_period  ON student_convivencia_grades(academic_period_id);
