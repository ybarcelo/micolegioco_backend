-- ── Módulo Calificación Preescolar ──────────────────────────────────────────
-- Valoración cualitativa por dimensión e indicador, por período académico.
-- La valoración definitiva de cada dimensión es la ponderación de sus indicadores.

-- Valoración definitiva por dimensión por período
CREATE TABLE preschool_dimension_grades (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id          UUID        NOT NULL REFERENCES schools(id)          ON DELETE CASCADE,
  enrollment_id      UUID        NOT NULL REFERENCES enrollments(id)      ON DELETE CASCADE,
  academic_period_id UUID        NOT NULL REFERENCES academic_periods(id) ON DELETE CASCADE,
  dimension          VARCHAR(20) NOT NULL
                     CHECK (dimension IN ('COGNITIVA','COMUNICATIVA','RELIGIOSA','ESTETICA')),
  rating             VARCHAR(20) NOT NULL
                     CHECK (rating    IN ('EXCELENTE','SOBRESALIENTE','ACEPTABLE','BAJO')),
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_preschool_dim_grade
    UNIQUE (enrollment_id, academic_period_id, dimension)
);

CREATE INDEX idx_preschool_dim_grades_school  ON preschool_dimension_grades(school_id);
CREATE INDEX idx_preschool_dim_grades_enroll  ON preschool_dimension_grades(enrollment_id);
CREATE INDEX idx_preschool_dim_grades_period  ON preschool_dimension_grades(academic_period_id);


-- Valoraciones individuales por indicador dentro de cada dimensión y período
-- indicator_key válidos por dimensión:
--   COGNITIVA:    nociones_logico_matematicas
--   COMUNICATIVA: comprension_palabras | expresion_escrita | produccion_oral | conciencia_fonologica
--   RELIGIOSA:    construccion_identidad | pertenencia_cultural
--   ESTETICA:     expresion_habilidades
CREATE TABLE preschool_indicator_grades (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id          UUID        NOT NULL REFERENCES schools(id)          ON DELETE CASCADE,
  enrollment_id      UUID        NOT NULL REFERENCES enrollments(id)      ON DELETE CASCADE,
  academic_period_id UUID        NOT NULL REFERENCES academic_periods(id) ON DELETE CASCADE,
  dimension          VARCHAR(20) NOT NULL
                     CHECK (dimension IN ('COGNITIVA','COMUNICATIVA','RELIGIOSA','ESTETICA')),
  indicator_key      VARCHAR(60) NOT NULL,
  rating             VARCHAR(20) NOT NULL
                     CHECK (rating IN ('EXCELENTE','SOBRESALIENTE','ACEPTABLE','BAJO')),
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_preschool_ind_grade
    UNIQUE (enrollment_id, academic_period_id, dimension, indicator_key)
);

CREATE INDEX idx_preschool_ind_grades_school  ON preschool_indicator_grades(school_id);
CREATE INDEX idx_preschool_ind_grades_enroll  ON preschool_indicator_grades(enrollment_id);
CREATE INDEX idx_preschool_ind_grades_period  ON preschool_indicator_grades(academic_period_id);
