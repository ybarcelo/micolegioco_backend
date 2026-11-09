-- ── 041: Segundo nombre/apellido y municipio de expedición (estudiantes y docentes) ────

ALTER TABLE students ADD COLUMN second_name VARCHAR(100);
ALTER TABLE students ADD COLUMN second_last_name VARCHAR(100);

ALTER TABLE teachers ADD COLUMN second_name VARCHAR(100);
ALTER TABLE teachers ADD COLUMN second_last_name VARCHAR(100);
ALTER TABLE teachers ADD COLUMN exp_city VARCHAR(100);
