-- ── 045: Catálogo de dimensiones/indicadores de preescolar (configurable por colegio) ──
-- Antes de esta migración, las 4 dimensiones de preescolar (Cognitiva, Comunicativa,
-- Religiosa, Estética) y sus indicadores estaban fijas por CHECK constraints, iguales
-- para todos los colegios. Ahora cada colegio tiene su propio catálogo editable; se
-- siembra con las mismas 4 dimensiones/indicadores de hoy para no romper nada existente.
-- También se agrega preschool_grading_mode a grading_scale_config: un colegio puede
-- calificar preescolar "igual que primaria y bachillerato" (SUBJECTS) o "cualitativo
-- por dimensiones propias" (DIMENSIONS, default — preserva el comportamiento actual).

-- 1. Nuevas tablas de catálogo
CREATE TABLE preschool_dimensions (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id   UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(255),
  sort_order  SMALLINT    NOT NULL DEFAULT 0,
  code        VARCHAR(20),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_preschool_dimensions_school_name UNIQUE (school_id, name)
);
CREATE INDEX idx_preschool_dimensions_school ON preschool_dimensions(school_id);

CREATE TABLE preschool_indicators (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id    UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  dimension_id UUID        NOT NULL REFERENCES preschool_dimensions(id) ON DELETE CASCADE,
  name         VARCHAR(150) NOT NULL,
  sort_order   SMALLINT    NOT NULL DEFAULT 0,
  code         VARCHAR(60),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_preschool_indicators_dim_name UNIQUE (dimension_id, name)
);
CREATE INDEX idx_preschool_indicators_school ON preschool_indicators(school_id);
CREATE INDEX idx_preschool_indicators_dimension ON preschool_indicators(dimension_id);

-- 2. Modo de calificación de preescolar (independiente de scale_type, que sigue
--    siendo exclusivamente la escala de primaria/bachillerato)
ALTER TABLE grading_scale_config
  ADD COLUMN preschool_grading_mode VARCHAR(20) NOT NULL DEFAULT 'DIMENSIONS'
  CHECK (preschool_grading_mode IN ('SUBJECTS', 'DIMENSIONS'));

-- 3. Sembrar el catálogo para todos los colegios con las 4 dimensiones actuales
WITH dim_seed(code, name, description, sort_order) AS (
  VALUES
    ('COGNITIVA',    'Cognitiva',    'Nociones lógico-matemáticas',                     0),
    ('COMUNICATIVA', 'Comunicativa', 'Comprensión, expresión escrita, producción oral', 1),
    ('RELIGIOSA',    'Religiosa',    'Identidad, familia y cultura',                    2),
    ('ESTETICA',     'Estética',     'Sentir, expresar, valorar y transformar',         3)
)
INSERT INTO preschool_dimensions (school_id, name, description, sort_order, code)
SELECT s.id, d.name, d.description, d.sort_order, d.code
FROM schools s CROSS JOIN dim_seed d;

WITH ind_seed(dim_code, code, name, sort_order) AS (
  VALUES
    ('COGNITIVA',    'nociones_logico_matematicas', 'Nociones lógico-matemáticas', 0),
    ('COMUNICATIVA', 'comprension_palabras',        'Comprensión de palabras',     0),
    ('COMUNICATIVA', 'expresion_escrita',           'Expresión escrita',           1),
    ('COMUNICATIVA', 'produccion_oral',             'Producción oral',             2),
    ('COMUNICATIVA', 'conciencia_fonologica',       'Conciencia fonológica',       3),
    ('RELIGIOSA',    'construccion_identidad',      'Construcción de identidad',   0),
    ('RELIGIOSA',    'pertenencia_cultural',        'Pertenencia cultural',        1),
    ('ESTETICA',     'expresion_habilidades',       'Expresión de habilidades',    0)
)
INSERT INTO preschool_indicators (school_id, dimension_id, name, sort_order, code)
SELECT pd.school_id, pd.id, i.name, i.sort_order, i.code
FROM preschool_dimensions pd
JOIN ind_seed i ON i.dim_code = pd.code;

-- 4. Nuevas columnas FK (nullable por ahora) en las tablas de notas existentes
ALTER TABLE preschool_dimension_grades ADD COLUMN dimension_id UUID REFERENCES preschool_dimensions(id) ON DELETE CASCADE;
ALTER TABLE preschool_indicator_grades ADD COLUMN dimension_id UUID REFERENCES preschool_dimensions(id) ON DELETE CASCADE;
ALTER TABLE preschool_indicator_grades ADD COLUMN indicator_id UUID REFERENCES preschool_indicators(id) ON DELETE CASCADE;

-- 5. Backfill: mapear los valores viejos (dimension/indicator_key) a los ids del catálogo recién sembrado
UPDATE preschool_dimension_grades g
SET dimension_id = pd.id
FROM preschool_dimensions pd
WHERE pd.school_id = g.school_id AND pd.code = g.dimension;

UPDATE preschool_indicator_grades g
SET dimension_id = pd.id
FROM preschool_dimensions pd
WHERE pd.school_id = g.school_id AND pd.code = g.dimension;

UPDATE preschool_indicator_grades g
SET indicator_id = pi.id
FROM preschool_indicators pi
WHERE pi.school_id = g.school_id AND pi.dimension_id = g.dimension_id AND pi.code = g.indicator_key;

-- 6. Chequeo de seguridad (debe dar 0 filas antes de continuar al paso 7):
--    SELECT count(*) FROM preschool_dimension_grades WHERE dimension_id IS NULL;
--    SELECT count(*) FROM preschool_indicator_grades WHERE dimension_id IS NULL OR indicator_id IS NULL;

-- 7. Forzar NOT NULL, eliminar columnas/constraints viejos, nuevos UNIQUE sobre los FKs
-- El nombre del constraint único original de 028 varía según el entorno: si en
-- algún momento se corrió `prisma db push` contra esa base, Prisma renombra el
-- constraint a su convención (`<tabla>_enrollment_id_academic_period_id_key`) en
-- vez del nombre explícito `uq_preschool_dim_grade`/`uq_preschool_ind_grade` que
-- define 028.sql — se cubren ambos nombres para que esta migración sea segura en
-- cualquiera de los dos casos.
ALTER TABLE preschool_dimension_grades ALTER COLUMN dimension_id SET NOT NULL;
ALTER TABLE preschool_dimension_grades DROP CONSTRAINT IF EXISTS uq_preschool_dim_grade;
ALTER TABLE preschool_dimension_grades DROP CONSTRAINT IF EXISTS preschool_dimension_grades_enrollment_id_academic_period_id_key;
ALTER TABLE preschool_dimension_grades DROP COLUMN dimension;
ALTER TABLE preschool_dimension_grades
  ADD CONSTRAINT uq_preschool_dim_grade UNIQUE (enrollment_id, academic_period_id, dimension_id);

ALTER TABLE preschool_indicator_grades ALTER COLUMN dimension_id SET NOT NULL;
ALTER TABLE preschool_indicator_grades ALTER COLUMN indicator_id SET NOT NULL;
ALTER TABLE preschool_indicator_grades DROP CONSTRAINT IF EXISTS uq_preschool_ind_grade;
ALTER TABLE preschool_indicator_grades DROP CONSTRAINT IF EXISTS preschool_indicator_grades_enrollment_id_academic_period_id_key;
ALTER TABLE preschool_indicator_grades DROP COLUMN dimension;
ALTER TABLE preschool_indicator_grades DROP COLUMN indicator_key;
ALTER TABLE preschool_indicator_grades
  ADD CONSTRAINT uq_preschool_ind_grade UNIQUE (enrollment_id, academic_period_id, indicator_id);

CREATE INDEX idx_preschool_dim_grades_dimension ON preschool_dimension_grades(dimension_id);
CREATE INDEX idx_preschool_ind_grades_dimension ON preschool_indicator_grades(dimension_id);
CREATE INDEX idx_preschool_ind_grades_indicator ON preschool_indicator_grades(indicator_id);
