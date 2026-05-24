-- Inasistencias por estudiante por período (no por asignatura)
CREATE TABLE student_period_absences (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id          UUID NOT NULL REFERENCES schools(id)          ON DELETE CASCADE,
  enrollment_id      UUID NOT NULL REFERENCES enrollments(id)      ON DELETE CASCADE,
  academic_period_id UUID NOT NULL REFERENCES academic_periods(id) ON DELETE CASCADE,
  absences           INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_student_period_absence   UNIQUE (enrollment_id, academic_period_id),
  CONSTRAINT chk_absences_non_negative   CHECK  (absences >= 0)
);

CREATE INDEX idx_spa_school     ON student_period_absences(school_id);
CREATE INDEX idx_spa_enrollment ON student_period_absences(enrollment_id);
CREATE INDEX idx_spa_period     ON student_period_absences(academic_period_id);
