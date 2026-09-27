CREATE TABLE execution_quality_attempts (
  task_id TEXT NOT NULL,
  attempt_seq INTEGER NOT NULL,
  result TEXT NOT NULL,
  note TEXT,
  actor_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (task_id, attempt_seq),
  FOREIGN KEY (task_id) REFERENCES execution_tasks(task_id),
  CHECK (attempt_seq >= 1),
  CHECK (result IN ('PASS', 'FAIL')),
  CHECK (length(actor_id) > 0),
  CHECK (length(recorded_at) > 0),
  CHECK (
    (
      result = 'PASS'
      AND (
        note IS NULL
        OR (length(trim(note)) > 0 AND length(note) <= 280)
      )
    )
    OR (
      result = 'FAIL'
      AND note IS NOT NULL
      AND length(trim(note)) > 0
      AND length(note) <= 280
    )
  )
);

CREATE TABLE execution_rework_episodes (
  task_id TEXT NOT NULL,
  episode_seq INTEGER NOT NULL,
  opened_by_attempt_seq INTEGER NOT NULL,
  status TEXT NOT NULL,
  correction_note TEXT,
  closed_by TEXT,
  closed_at TEXT,
  PRIMARY KEY (task_id, episode_seq),
  FOREIGN KEY (task_id) REFERENCES execution_tasks(task_id),
  FOREIGN KEY (task_id, opened_by_attempt_seq)
    REFERENCES execution_quality_attempts(task_id, attempt_seq),
  CHECK (episode_seq >= 1),
  CHECK (opened_by_attempt_seq >= 1),
  CHECK (status IN ('OPEN', 'CLOSED')),
  CHECK (
    (
      status = 'OPEN'
      AND correction_note IS NULL
      AND closed_by IS NULL
      AND closed_at IS NULL
    )
    OR (
      status = 'CLOSED'
      AND correction_note IS NOT NULL
      AND length(trim(correction_note)) > 0
      AND length(correction_note) <= 280
      AND closed_by IS NOT NULL
      AND length(closed_by) > 0
      AND closed_at IS NOT NULL
      AND length(closed_at) > 0
    )
  )
);

CREATE UNIQUE INDEX execution_rework_episodes_one_open
  ON execution_rework_episodes(task_id)
  WHERE status = 'OPEN';

CREATE TRIGGER execution_quality_attempts_no_update
BEFORE UPDATE ON execution_quality_attempts
BEGIN
  SELECT RAISE(ABORT, 'append_only');
END;

CREATE TRIGGER execution_quality_attempts_no_delete
BEFORE DELETE ON execution_quality_attempts
BEGIN
  SELECT RAISE(ABORT, 'append_only');
END;

CREATE TRIGGER execution_rework_episodes_no_delete
BEFORE DELETE ON execution_rework_episodes
BEGIN
  SELECT RAISE(ABORT, 'append_only');
END;

CREATE TRIGGER execution_rework_episodes_close_only
BEFORE UPDATE ON execution_rework_episodes
WHEN OLD.status != 'OPEN'
  OR NEW.status != 'CLOSED'
  OR NEW.task_id != OLD.task_id
  OR NEW.episode_seq != OLD.episode_seq
  OR NEW.opened_by_attempt_seq != OLD.opened_by_attempt_seq
BEGIN
  SELECT RAISE(ABORT, 'append_only');
END;
