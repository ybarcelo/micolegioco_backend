-- Registro de descuentos de horas por docente por mes
CREATE TABLE teacher_hour_deductions (
  id             UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id      UUID         NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id     UUID         NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  year           INT          NOT NULL,
  month          INT          NOT NULL CHECK (month BETWEEN 1 AND 12),
  deduction_date DATE         NOT NULL,
  hours          DECIMAL(5,2) NOT NULL CHECK (hours > 0),
  reason         TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_thr_ded_school_teacher_month
  ON teacher_hour_deductions(school_id, teacher_id, year, month);
