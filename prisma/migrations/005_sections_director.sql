-- Revertir: el director NO va en el grado
ALTER TABLE grades DROP COLUMN IF EXISTS director_id;

-- Corrección: el director de grupo va en la sección
ALTER TABLE sections
  ADD COLUMN director_id UUID REFERENCES teachers(id) ON DELETE SET NULL;
