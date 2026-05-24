CREATE TABLE period_achievements (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id          UUID        NOT NULL REFERENCES schools(id)              ON DELETE CASCADE,
  academic_period_id UUID        NOT NULL REFERENCES academic_periods(id)     ON DELETE CASCADE,
  achievement_id     UUID        NOT NULL REFERENCES subject_achievements(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_period_achievement UNIQUE (academic_period_id, achievement_id)
);

CREATE INDEX idx_period_achievements_school  ON period_achievements(school_id);
CREATE INDEX idx_period_achievements_period  ON period_achievements(academic_period_id);
CREATE INDEX idx_period_achievements_achiev  ON period_achievements(achievement_id);
