-- Peso porcentual por período (usado cuando el colegio configura períodos acumulativos)
ALTER TABLE academic_periods
  ADD COLUMN IF NOT EXISTS weight_percentage NUMERIC(5,2) NULL DEFAULT NULL;

-- Configuración de escala de calificación — una fila por colegio
CREATE TABLE grading_scale_config (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id  UUID        NOT NULL UNIQUE REFERENCES schools(id) ON DELETE CASCADE,
  scale_type VARCHAR(20) NOT NULL DEFAULT 'NUMERIC',
  cumulative BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_scale_type CHECK (scale_type IN ('NUMERIC', 'QUALITATIVE'))
);

-- Calificaciones de estudiantes por asignatura y período
CREATE TABLE student_grades (
  id                 UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id          UUID         NOT NULL REFERENCES schools(id)          ON DELETE CASCADE,
  enrollment_id      UUID         NOT NULL REFERENCES enrollments(id)      ON DELETE CASCADE,
  subject_id         UUID         NOT NULL REFERENCES subjects(id)         ON DELETE CASCADE,
  academic_period_id UUID         NOT NULL REFERENCES academic_periods(id) ON DELETE CASCADE,
  numeric_grade      NUMERIC(4,2) NULL,
  qualitative_grade  VARCHAR(5)   NULL,
  notes              TEXT         NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_student_grade UNIQUE (enrollment_id, subject_id, academic_period_id),
  CONSTRAINT chk_qualitative  CHECK (qualitative_grade IS NULL
                                     OR qualitative_grade IN ('I','A','S','E'))
);

CREATE INDEX idx_student_grades_school     ON student_grades(school_id);
CREATE INDEX idx_student_grades_enrollment ON student_grades(enrollment_id);
CREATE INDEX idx_student_grades_period     ON student_grades(academic_period_id);
