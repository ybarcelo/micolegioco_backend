-- ── 037: Separar actas de seguimiento de las citaciones (parent_meetings) ────

CREATE TABLE student_follow_up_records (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id                UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  meeting_id               UUID NOT NULL UNIQUE REFERENCES parent_meetings(id) ON DELETE CASCADE,
  student_id               UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  description              TEXT NOT NULL,
  record_date              DATE NOT NULL,
  report_type              VARCHAR(20) NOT NULL DEFAULT 'DISCIPLINARY',
  fault_type               VARCHAR(20),
  academic_period_id       UUID REFERENCES academic_periods(id) ON DELETE SET NULL,
  pedagogical_actions      TEXT,
  agreements               TEXT,
  conduct_manual_articles  TEXT,
  reported_by              UUID REFERENCES teachers(id) ON DELETE SET NULL,
  guardian_signature       TEXT,
  student_signature        TEXT,
  staff_signature          TEXT,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_follow_up_student_id ON student_follow_up_records(student_id);
CREATE INDEX idx_follow_up_school_id  ON student_follow_up_records(school_id);

-- Preservar datos de citaciones ya realizadas que tenían notas/compromisos/firmas
INSERT INTO student_follow_up_records (
  school_id, meeting_id, student_id, description, record_date,
  agreements, guardian_signature, student_signature, staff_signature
)
SELECT school_id, id, student_id,
       COALESCE(meeting_notes, meeting_reason),
       scheduled_datetime::date,
       agreements, guardian_signature, student_signature, staff_signature
FROM parent_meetings
WHERE status = 'COMPLETED'
  AND (meeting_notes IS NOT NULL OR agreements IS NOT NULL
       OR guardian_signature IS NOT NULL OR student_signature IS NOT NULL OR staff_signature IS NOT NULL);

ALTER TABLE parent_meetings
  DROP COLUMN meeting_notes,
  DROP COLUMN agreements,
  DROP COLUMN guardian_signature,
  DROP COLUMN student_signature,
  DROP COLUMN staff_signature;
