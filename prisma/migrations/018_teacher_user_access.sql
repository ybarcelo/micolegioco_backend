-- Vincular docentes con cuentas de usuario del sistema
ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_user_id
  ON teachers(user_id)
  WHERE user_id IS NOT NULL;

-- Insertar rol DOCENTE si no existe
INSERT INTO roles (name, description)
VALUES ('DOCENTE', 'Docente con acceso a registro académico de su sección asignada')
ON CONFLICT (name) DO NOTHING;
