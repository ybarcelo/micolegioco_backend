-- ============================================================
-- Módulo de Docentes
-- Autor: micolegio.co
-- ============================================================

-- 1. Tipos de escalafón (catálogo por colegio)
CREATE TABLE escalafon_types (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id    UUID         NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name         VARCHAR(50)  NOT NULL,
  hourly_rate  DECIMAL(15,2) NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ  DEFAULT now(),

  CONSTRAINT uq_escalafon_school_name UNIQUE (school_id, name),
  CONSTRAINT chk_hourly_rate_positive CHECK (hourly_rate > 0)
);

-- Insertar escalafones base para cada colegio existente
INSERT INTO escalafon_types (school_id, name, hourly_rate, description)
SELECT id, 'Normalista', 10000, 'Docente normalista — $10.000/hora'
FROM   schools;

INSERT INTO escalafon_types (school_id, name, hourly_rate, description)
SELECT id, '7', 15000, 'Escalafón 7 — $15.000/hora'
FROM   schools;


-- 2. Docentes
CREATE TABLE teachers (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id         UUID         NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  document_type     VARCHAR(10)  NOT NULL,
  document_number   VARCHAR(50)  NOT NULL,
  address           TEXT,
  phone_mobile      VARCHAR(20),
  escalafon_type_id UUID         REFERENCES escalafon_types(id) ON DELETE SET NULL,
  profession        VARCHAR(100),
  created_at        TIMESTAMPTZ  DEFAULT now(),
  updated_at        TIMESTAMPTZ  DEFAULT now(),

  CONSTRAINT uq_teacher_school_document UNIQUE (school_id, document_number)
);

CREATE INDEX idx_teachers_school ON teachers(school_id);


-- 3. Contratos de docentes
CREATE TABLE teacher_contracts (
  id                UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id         UUID  NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id        UUID  NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  escalafon_type_id UUID  NOT NULL REFERENCES escalafon_types(id) ON DELETE RESTRICT,
  start_date        DATE  NOT NULL,
  end_date          DATE  NOT NULL,
  weekly_hours      INT   NOT NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT chk_contract_dates   CHECK (end_date >= start_date),
  CONSTRAINT chk_weekly_hours_pos CHECK (weekly_hours > 0 AND weekly_hours <= 60)
);

CREATE INDEX idx_teacher_contracts_teacher ON teacher_contracts(teacher_id);
CREATE INDEX idx_teacher_contracts_school  ON teacher_contracts(school_id);
