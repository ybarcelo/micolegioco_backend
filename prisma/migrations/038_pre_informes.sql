-- ── 038: Pre-informes de alerta académica (spec-preinforme) ────

CREATE TABLE pre_informes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  enrollment_id       UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  subject_id          UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  academic_period_id  UUID NOT NULL REFERENCES academic_periods(id) ON DELETE CASCADE,
  teacher_id          UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  reason_1            TEXT NOT NULL,
  reason_2            TEXT NOT NULL,
  reason_3            TEXT NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (enrollment_id, subject_id, academic_period_id)
);

CREATE INDEX idx_pre_informes_school_id          ON pre_informes(school_id);
CREATE INDEX idx_pre_informes_academic_period_id ON pre_informes(academic_period_id);
CREATE INDEX idx_pre_informes_teacher_id         ON pre_informes(teacher_id);
