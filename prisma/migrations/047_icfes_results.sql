-- Resultados anuales de las pruebas Saber 11 (ICFES) por colegio: puntaje global
-- (0-500) y clasificación del plantel (A+ a D). Publicado por el ICFES meses
-- después de terminado el año lectivo, de ahí el FK a academic_years en vez de
-- un año en texto libre: el dato simplemente apunta al año-cohorte.
CREATE TABLE icfes_results (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id  UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  global_score      INT NOT NULL CHECK (global_score BETWEEN 0 AND 500),
  classification    VARCHAR(5) NOT NULL CHECK (classification IN ('A+','A','B','C','D')),
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (school_id, academic_year_id)
);
CREATE INDEX idx_icfes_results_school ON icfes_results(school_id);
