-- ── 031: Slug público del colegio (usado en el enlace de pre-inscripción) ───

ALTER TABLE schools
  ADD COLUMN slug VARCHAR(100);

-- Backfill de colegios existentes: ver script scripts/backfill-school-slugs.js

ALTER TABLE schools
  ADD CONSTRAINT schools_slug_unique UNIQUE (slug);
