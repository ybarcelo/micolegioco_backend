-- ── 050: Préstamos activables por colegio + flujo de solicitud/aprobación ──

-- 1. Interruptor por colegio (apagado por defecto: no todos los colegios manejan préstamos)
ALTER TABLE schools ADD COLUMN teacher_loans_enabled BOOLEAN NOT NULL DEFAULT false;

-- 2. teacher_loans pasa a soportar un estado PENDING (solicitado por el docente, aún sin
--    aprobar) y REJECTED. authorized_by/start_year/start_month quedan nulos mientras está
--    pendiente, y se llenan al aprobar. Nombres de constraint confirmados contra la BD real
--    (creados por la migración 048 escrita a mano, sin drift de `prisma db push`).
ALTER TABLE teacher_loans ALTER COLUMN authorized_by DROP NOT NULL;
ALTER TABLE teacher_loans ALTER COLUMN start_year DROP NOT NULL;
ALTER TABLE teacher_loans ALTER COLUMN start_month DROP NOT NULL;

ALTER TABLE teacher_loans ADD COLUMN requested_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE teacher_loans ADD COLUMN rejection_reason TEXT;

ALTER TABLE teacher_loans DROP CONSTRAINT teacher_loans_status_check;
ALTER TABLE teacher_loans ADD CONSTRAINT teacher_loans_status_check
  CHECK (status IN ('PENDING', 'ACTIVE', 'REJECTED', 'CANCELLED'));
