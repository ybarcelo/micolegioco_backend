-- birth_date is not available during bulk import (only ID fields are required)
ALTER TABLE students ALTER COLUMN birth_date DROP NOT NULL;
