-- El archivo bancario necesita el CÓDIGO numérico del banco del docente
-- (ej. 001 Banco de Bogotá), no solo el nombre en texto libre — un código
-- equivocado hace que el banco rechace la transacción.
ALTER TABLE teachers ADD COLUMN bank_code VARCHAR(10);
