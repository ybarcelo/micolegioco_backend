-- Agregar año académico e intensidad horaria al plan por grado
ALTER TABLE grade_subjects
  ADD COLUMN IF NOT EXISTS academic_year_id UUID NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS weekly_hours     SMALLINT NULL;

-- Reemplazar el unique anterior (solo grade_id + subject_id) por uno que incluye el año
ALTER TABLE grade_subjects DROP CONSTRAINT IF EXISTS uq_grade_subjects_grade_subject;

-- Índice único para registros con año (nuevo patrón)
CREATE UNIQUE INDEX uq_grade_subjects_with_year
  ON grade_subjects(grade_id, subject_id, academic_year_id)
  WHERE academic_year_id IS NOT NULL;

-- Índice único para registros sin año (retrocompatibilidad con datos existentes)
CREATE UNIQUE INDEX uq_grade_subjects_no_year
  ON grade_subjects(grade_id, subject_id)
  WHERE academic_year_id IS NULL;

CREATE INDEX idx_grade_subjects_academic_year ON grade_subjects(academic_year_id);
