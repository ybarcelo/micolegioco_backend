-- ── 035: Registro de asistencia (switch Sí/No por estudiante, materia y día) ──

CREATE TABLE attendances (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  enrollment_id       UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  grade_subject_id    UUID NOT NULL REFERENCES grade_subjects(id) ON DELETE CASCADE,
  academic_period_id  UUID NOT NULL REFERENCES academic_periods(id) ON DELETE CASCADE,
  date                DATE NOT NULL,
  present             BOOLEAN NOT NULL,
  recorded_by         UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (enrollment_id, grade_subject_id, date)
);

CREATE INDEX idx_attendances_school_id          ON attendances(school_id);
CREATE INDEX idx_attendances_grade_subject_date  ON attendances(grade_subject_id, date);
CREATE INDEX idx_attendances_academic_period_id  ON attendances(academic_period_id);
