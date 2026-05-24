-- Agregar fechas de inicio y fin al año académico (opcionales)
ALTER TABLE academic_years
  ADD COLUMN IF NOT EXISTS start_date DATE NULL,
  ADD COLUMN IF NOT EXISTS end_date   DATE NULL;

-- Tabla de períodos académicos
CREATE TABLE academic_periods (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id        UUID    NOT NULL REFERENCES schools(id)        ON DELETE CASCADE,
  academic_year_id UUID    NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  name             VARCHAR(100) NOT NULL,
  period_number    SMALLINT     NOT NULL,
  start_date       DATE         NOT NULL,
  end_date         DATE         NOT NULL,
  sort_order       SMALLINT     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_academic_periods_year_number UNIQUE (academic_year_id, period_number)
);

CREATE INDEX idx_academic_periods_school ON academic_periods(school_id);
CREATE INDEX idx_academic_periods_year   ON academic_periods(academic_year_id);
