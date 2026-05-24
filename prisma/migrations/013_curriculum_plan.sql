-- ── Módulo Plan de Estudios ─────────────────────────────────────────────────

-- 1. subject_areas — Áreas académicas configurables por colegio
CREATE TABLE subject_areas (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name       VARCHAR(150) NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_subject_areas_school_name UNIQUE (school_id, name)
);
CREATE INDEX idx_subject_areas_school ON subject_areas(school_id);

-- 2. subjects — Asignaturas que pertenecen a un área
CREATE TABLE subjects (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  area_id    UUID NOT NULL REFERENCES subject_areas(id) ON DELETE CASCADE,
  name       VARCHAR(150) NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_subjects_area_name UNIQUE (area_id, name)
);
CREATE INDEX idx_subjects_school ON subjects(school_id);
CREATE INDEX idx_subjects_area   ON subjects(area_id);

-- 3. grade_subjects — Asignatura asignada a un grado con docente opcional
CREATE TABLE grade_subjects (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  grade_id   UUID NOT NULL REFERENCES grades(id)   ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id)  ON DELETE CASCADE,
  teacher_id UUID REFERENCES teachers(id)            ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_grade_subjects_grade_subject UNIQUE (grade_id, subject_id)
);
CREATE INDEX idx_grade_subjects_school ON grade_subjects(school_id);
CREATE INDEX idx_grade_subjects_grade  ON grade_subjects(grade_id);
