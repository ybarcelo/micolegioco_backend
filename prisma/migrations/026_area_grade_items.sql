-- Tabla de ítems de calificación por área (desglose del puntaje 0-25)
-- Áreas regulares: simulacro(15) + actividades(2) + participacion(1) + parciales(1) + investigacion(1) = 20
-- Áreas electivas/optativas: valores(1) + religion(1) + educacion_fis(1) + coevaluacion(2) = 5

CREATE TABLE student_area_grade_items (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id          UUID        NOT NULL REFERENCES schools(id)          ON DELETE CASCADE,
  enrollment_id      UUID        NOT NULL REFERENCES enrollments(id)      ON DELETE CASCADE,
  subject_area_id    UUID        NOT NULL REFERENCES subject_areas(id)    ON DELETE CASCADE,
  academic_period_id UUID        NOT NULL REFERENCES academic_periods(id) ON DELETE CASCADE,
  item_key           VARCHAR(60) NOT NULL,
  points             SMALLINT    NOT NULL DEFAULT 0
    CONSTRAINT chk_item_pts CHECK (points >= 0 AND points <= 15),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_area_grade_item UNIQUE (enrollment_id, subject_area_id, academic_period_id, item_key)
);

CREATE INDEX idx_area_grade_items_school     ON student_area_grade_items(school_id);
CREATE INDEX idx_area_grade_items_enrollment ON student_area_grade_items(enrollment_id);
CREATE INDEX idx_area_grade_items_period     ON student_area_grade_items(academic_period_id);
