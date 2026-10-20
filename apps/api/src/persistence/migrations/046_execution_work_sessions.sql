-- New evidence only. Existing task durations and history are not backfilled.
CREATE TABLE execution_work_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL REFERENCES execution_plans(plan_id),
  task_id TEXT NOT NULL REFERENCES execution_tasks(task_id),
  person_id TEXT NOT NULL,
  person_label TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  end_kind TEXT CHECK (end_kind IN ('LEFT', 'COMPLETED')),
  CHECK ((ended_at IS NULL AND end_kind IS NULL) OR
         (ended_at IS NOT NULL AND end_kind IS NOT NULL AND ended_at >= started_at))
);
CREATE UNIQUE INDEX execution_work_one_active_person
  ON execution_work_sessions(person_id) WHERE ended_at IS NULL;
CREATE INDEX execution_work_plan ON execution_work_sessions(plan_id, started_at, session_id);
