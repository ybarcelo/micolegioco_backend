-- ── 048: Préstamos a docentes + datos bancarios para el pago de nómina ──

-- 1. Cuenta bancaria del docente (beneficiario del pago)
ALTER TABLE teachers ADD COLUMN bank_name VARCHAR(60);
ALTER TABLE teachers ADD COLUMN bank_account_type VARCHAR(10);
ALTER TABLE teachers ADD COLUMN bank_account_number VARCHAR(30);

-- 2. Configuración de nómina del colegio (cuenta a debitar / banco de pago)
ALTER TABLE schools ADD COLUMN payroll_bank VARCHAR(20);
ALTER TABLE schools ADD COLUMN payroll_debit_account_number VARCHAR(20);
ALTER TABLE schools ADD COLUMN payroll_debit_account_type VARCHAR(10);

-- 3. Préstamos autorizados por el rector, descontados en cuotas del valor a pagar
CREATE TABLE teacher_loans (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id          UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  authorized_by       UUID NOT NULL REFERENCES users(id),
  amount              DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  installments_count  INT NOT NULL CHECK (installments_count >= 1),
  start_year          INT NOT NULL,
  start_month         INT NOT NULL CHECK (start_month BETWEEN 1 AND 12),
  status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_teacher_loans_school_teacher ON teacher_loans(school_id, teacher_id);

-- 4. Cuotas pre-generadas del préstamo (una fila por cuota, amortización simple)
CREATE TABLE teacher_loan_installments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id             UUID NOT NULL REFERENCES teacher_loans(id) ON DELETE CASCADE,
  installment_number  INT NOT NULL,
  year                INT NOT NULL,
  month               INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount              DECIMAL(15, 2) NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (loan_id, installment_number)
);
CREATE INDEX idx_tli_loan_year_month ON teacher_loan_installments(loan_id, year, month);
