-- Caché de los KPIs académicos pesados del dashboard (top 10 mejores / en riesgo),
-- recalculado bajo demanda (ver DashboardController/AcademicSnapshotService), nunca
-- en cada carga de página. school.id es PK, así que una columna JSON + un timestamp
-- es suficiente (mismo patrón que students.metadata), sin necesidad de tabla nueva.
ALTER TABLE schools ADD COLUMN academic_snapshot JSONB DEFAULT '{}'::jsonb;
ALTER TABLE schools ADD COLUMN academic_snapshot_computed_at TIMESTAMPTZ;
