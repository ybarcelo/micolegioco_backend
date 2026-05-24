-- Director de grupo por grado
ALTER TABLE grades
  ADD COLUMN director_id UUID REFERENCES teachers(id) ON DELETE SET NULL;
