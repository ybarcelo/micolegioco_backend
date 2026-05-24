-- Ampliar la restricción de escala para admitir el tipo POINTS
ALTER TABLE grading_scale_config DROP CONSTRAINT chk_scale_type;
ALTER TABLE grading_scale_config
  ADD CONSTRAINT chk_scale_type CHECK (scale_type IN ('NUMERIC', 'QUALITATIVE', 'POINTS'));

-- Calificaciones por área (escala por puntos: 0-25 por período, acumulativa hasta 100)
CREATE TABLE student_area_grades (
  id                 UUID     PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id          UUID     NOT NULL REFERENCES schools(id)          ON DELETE CASCADE,
  enrollment_id      UUID     NOT NULL REFERENCES enrollments(id)      ON DELETE CASCADE,
  subject_area_id    UUID     NOT NULL REFERENCES subject_areas(id)    ON DELETE CASCADE,
  academic_period_id UUID     NOT NULL REFERENCES academic_periods(id) ON DELETE CASCADE,
  points             SMALLINT NOT NULL DEFAULT 0
    CONSTRAINT chk_points CHECK (points >= 0 AND points <= 25),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_student_area_grade UNIQUE (enrollment_id, subject_area_id, academic_period_id)
);
CREATE INDEX idx_student_area_grades_school     ON student_area_grades(school_id);
CREATE INDEX idx_student_area_grades_enrollment ON student_area_grades(enrollment_id);
CREATE INDEX idx_student_area_grades_period     ON student_area_grades(academic_period_id);
