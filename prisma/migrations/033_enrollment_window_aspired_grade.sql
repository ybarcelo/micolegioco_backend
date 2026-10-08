-- ── 033: Rango de fechas de inscripción + grado al que aspira ───────────────

ALTER TABLE schools
  ADD COLUMN enrollment_opens_at DATE,
  ADD COLUMN enrollment_closes_at DATE;

ALTER TABLE students
  ADD COLUMN aspired_grade_id UUID REFERENCES grades(id) ON DELETE SET NULL;
