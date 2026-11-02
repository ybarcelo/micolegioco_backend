-- ── 040: Número de matrícula ────

ALTER TABLE enrollments ADD COLUMN enrollment_number VARCHAR(20);

CREATE TABLE enrollment_sequences (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id  UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  last_number       INT NOT NULL DEFAULT 0,
  UNIQUE (school_id, academic_year_id)
);

-- Backfill: asigna número a las matrículas existentes (las que sí tienen sección),
-- en orden de fecha de matrícula, por colegio + año académico
WITH numbered AS (
  SELECT e.id,
         g.school_id,
         sec.academic_year_id,
         ay.label AS year_label,
         ROW_NUMBER() OVER (PARTITION BY g.school_id, sec.academic_year_id ORDER BY e.enrollment_date, e.id) AS rn
  FROM enrollments e
  JOIN sections sec        ON sec.id = e.section_id
  JOIN grades g            ON g.id = sec.grade_id
  JOIN academic_years ay   ON ay.id = sec.academic_year_id
)
UPDATE enrollments e
SET enrollment_number = numbered.year_label || '-' || LPAD(numbered.rn::text, 4, '0')
FROM numbered
WHERE numbered.id = e.id;

-- Deja el contador de cada colegio+año en el máximo ya asignado, para que el próximo sea correcto
INSERT INTO enrollment_sequences (school_id, academic_year_id, last_number)
SELECT g.school_id, sec.academic_year_id, COUNT(*)
FROM enrollments e
JOIN sections sec ON sec.id = e.section_id
JOIN grades g      ON g.id = sec.grade_id
WHERE e.enrollment_number IS NOT NULL
GROUP BY g.school_id, sec.academic_year_id;
