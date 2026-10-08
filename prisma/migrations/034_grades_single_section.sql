-- ── 034: Grado con sección única (ej. Párvulo: un solo curso, sin A/B/C) ────

ALTER TABLE grades
  ADD COLUMN single_section BOOLEAN NOT NULL DEFAULT false;
