CREATE TABLE subject_achievements (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id   UUID        NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  subject_id  UUID        NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  grade_id    UUID        NOT NULL REFERENCES grades(id)   ON DELETE CASCADE,
  code        VARCHAR(5)  NOT NULL,
  description TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_achievement_code UNIQUE (school_id, code)
);

CREATE INDEX idx_subject_achievements_school  ON subject_achievements(school_id);
CREATE INDEX idx_subject_achievements_subject ON subject_achievements(subject_id);
CREATE INDEX idx_subject_achievements_grade   ON subject_achievements(grade_id);
