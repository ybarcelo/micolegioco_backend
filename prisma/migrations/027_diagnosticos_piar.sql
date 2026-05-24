-- ── Catálogo de categorías de diagnóstico (global, sin school_id) ─────────────
CREATE TABLE diagnosis_categories (
  id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  code       VARCHAR(30)  NOT NULL UNIQUE,
  label      VARCHAR(100) NOT NULL,
  sort_order SMALLINT     NOT NULL DEFAULT 0
);

INSERT INTO diagnosis_categories (code, label, sort_order) VALUES
  ('NEURODESARROLLO',     'Trastornos del Neurodesarrollo',                          1),
  ('SENSORIAL_FISICA',    'Discapacidades Sensoriales y Físicas',                   2),
  ('SALUD_MENTAL',        'Condiciones de Salud Mental y Trastornos Emocionales',   3),
  ('TALENTO_EXCEPCIONAL', 'Capacidades o Talentos Excepcionales',                   4),
  ('ENFERMEDAD_CRONICA',  'Enfermedades Crónicas o Sistémicas',                     5);

-- ── Catálogo de diagnósticos específicos por categoría ────────────────────────
CREATE TABLE diagnosis_types (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID         NOT NULL REFERENCES diagnosis_categories(id) ON DELETE CASCADE,
  code        VARCHAR(40)  NOT NULL UNIQUE,
  label       VARCHAR(200) NOT NULL,
  sort_order  SMALLINT     NOT NULL DEFAULT 0
);

-- NEURODESARROLLO
INSERT INTO diagnosis_types (category_id, code, label, sort_order)
SELECT c.id, t.code, t.label, t.sort_order
FROM diagnosis_categories c,
(VALUES
  ('TEA',                     'TEA – Trastorno del Espectro Autista',                              1),
  ('TDAH',                    'TDAH – Trastorno por Déficit de Atención e Hiperactividad',         2),
  ('CAPACIDAD_LIMITE',        'Trastornos Límites del Aprendizaje (Capacidad Intelectual Límite)', 3),
  ('DISCAPACIDAD_INTELECTUAL','Discapacidad Intelectual',                                          4),
  ('DISLEXIA',                'Dislexia',                                                          5),
  ('DISGRAFIA',               'Disgrafía',                                                         6),
  ('DISCALCULIA',             'Discalculia',                                                       7),
  ('TRASTORNO_LENGUAJE',      'Trastornos de la Comunicación y del Lenguaje (TEL)',                8)
) AS t(code, label, sort_order)
WHERE c.code = 'NEURODESARROLLO';

-- SENSORIAL_FISICA
INSERT INTO diagnosis_types (category_id, code, label, sort_order)
SELECT c.id, t.code, t.label, t.sort_order
FROM diagnosis_categories c,
(VALUES
  ('DISCAPACIDAD_AUDITIVA', 'Discapacidad Auditiva (sordera / hipoacusia)',  1),
  ('DISCAPACIDAD_VISUAL',   'Discapacidad Visual (ceguera / baja visión)',   2),
  ('SORDOCEGUERA',          'Sordoceguera',                                  3),
  ('DISCAPACIDAD_MOTORA',   'Discapacidad Física o Motora',                  4)
) AS t(code, label, sort_order)
WHERE c.code = 'SENSORIAL_FISICA';

-- SALUD_MENTAL
INSERT INTO diagnosis_types (category_id, code, label, sort_order)
SELECT c.id, t.code, t.label, t.sort_order
FROM diagnosis_categories c,
(VALUES
  ('DEPRESION',             'Depresión infantil / juvenil',                  1),
  ('BIPOLAR',               'Trastorno Afectivo Bipolar (TAB)',               2),
  ('ANSIEDAD_GENERALIZADA', 'Ansiedad generalizada',                         3),
  ('FOBIA_SOCIAL',          'Fobia social',                                  4),
  ('MUTISMO_SELECTIVO',     'Mutismo selectivo',                             5),
  ('TRASTORNO_PANICO',      'Trastorno de pánico',                           6),
  ('TOC',                   'Trastorno Obsesivo-Compulsivo (TOC)',            7),
  ('TND',                   'Trastorno Negativista Desafiante (TND)',         8),
  ('CONDUCTA_DISOCIAL',     'Trastorno de la conducta disocial',             9)
) AS t(code, label, sort_order)
WHERE c.code = 'SALUD_MENTAL';

-- TALENTO_EXCEPCIONAL
INSERT INTO diagnosis_types (category_id, code, label, sort_order)
SELECT c.id, t.code, t.label, t.sort_order
FROM diagnosis_categories c,
(VALUES
  ('SUPERDOTACION', 'Superdotación Intelectual',                    1),
  ('TALENTO_AREA',  'Talento Excepcional en área específica',       2)
) AS t(code, label, sort_order)
WHERE c.code = 'TALENTO_EXCEPCIONAL';

-- ENFERMEDAD_CRONICA
INSERT INTO diagnosis_types (category_id, code, label, sort_order)
SELECT c.id, t.code, t.label, t.sort_order
FROM diagnosis_categories c,
(VALUES
  ('EPILEPSIA',       'Epilepsia / Síndromes convulsivos',                         1),
  ('DIABETES_T1',     'Diabetes Tipo 1 (Insulinodependiente)',                     2),
  ('ASMA_ALERGIA',    'Asma grave o alergias alimentarias severas (anafilaxia)',   3),
  ('ENFERMEDAD_RARA', 'Enfermedades raras o huérfanas',                            4)
) AS t(code, label, sort_order)
WHERE c.code = 'ENFERMEDAD_CRONICA';

-- ── Diagnósticos registrados por estudiante ───────────────────────────────────
CREATE TABLE student_diagnoses (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id         UUID         NOT NULL REFERENCES schools(id)         ON DELETE CASCADE,
  student_id        UUID         NOT NULL REFERENCES students(id)        ON DELETE CASCADE,
  diagnosis_type_id UUID         NOT NULL REFERENCES diagnosis_types(id) ON DELETE RESTRICT,
  cie_code          VARCHAR(20)  NULL,
  diagnosed_by      VARCHAR(150) NULL,
  diagnosis_date    DATE         NULL,
  document_path     VARCHAR(500) NULL,
  document_filename VARCHAR(255) NULL,
  notes             TEXT         NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_student_diagnoses_school  ON student_diagnoses(school_id);
CREATE INDEX idx_student_diagnoses_student ON student_diagnoses(student_id);
CREATE INDEX idx_student_diagnoses_type    ON student_diagnoses(diagnosis_type_id);

-- ── PIAR (Plan Individual de Ajustes Razonables) — uno por estudiante por año ─
CREATE TABLE student_piars (
  id                        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id                 UUID        NOT NULL REFERENCES schools(id)        ON DELETE CASCADE,
  student_id                UUID        NOT NULL REFERENCES students(id)       ON DELETE CASCADE,
  academic_year_id          UUID        NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  pedagogical_strengths     TEXT        NULL,
  pedagogical_barriers      TEXT        NULL,
  environmental_adjustments TEXT        NULL,
  school_commitment         TEXT        NULL,
  family_commitment         TEXT        NULL,
  student_commitment        TEXT        NULL,
  status                    VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_piar_status      CHECK (status IN ('ACTIVE', 'CLOSED')),
  CONSTRAINT uq_student_piar_year UNIQUE (student_id, academic_year_id)
);
CREATE INDEX idx_student_piars_school  ON student_piars(school_id);
CREATE INDEX idx_student_piars_student ON student_piars(student_id);
CREATE INDEX idx_student_piars_year    ON student_piars(academic_year_id);

-- ── Matriz de Ajustes Razonables (filas del PIAR) ─────────────────────────────
CREATE TABLE piar_adjustments (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  piar_id          UUID         NOT NULL REFERENCES student_piars(id)  ON DELETE CASCADE,
  school_id        UUID         NOT NULL REFERENCES schools(id)        ON DELETE CASCADE,
  subject_area_id  UUID         NULL     REFERENCES subject_areas(id)  ON DELETE SET NULL,
  area_label       VARCHAR(150) NULL,
  sort_order       SMALLINT     NOT NULL DEFAULT 0,
  objectives       TEXT         NULL,
  barriers         TEXT         NULL,
  adjustments      TEXT         NULL,
  evaluation_notes TEXT         NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_piar_adjustments_piar   ON piar_adjustments(piar_id);
CREATE INDEX idx_piar_adjustments_school ON piar_adjustments(school_id);
