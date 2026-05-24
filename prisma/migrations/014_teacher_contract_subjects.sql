-- Asignaturas asociadas a un contrato docente
CREATE TABLE teacher_contract_subjects (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES teacher_contracts(id) ON DELETE CASCADE,
  subject_id  UUID NOT NULL REFERENCES subjects(id)          ON DELETE CASCADE,
  CONSTRAINT uq_tcs_contract_subject UNIQUE (contract_id, subject_id)
);
CREATE INDEX idx_tcs_contract ON teacher_contract_subjects(contract_id);
CREATE INDEX idx_tcs_subject  ON teacher_contract_subjects(subject_id);
