import {
  closeQualityReworkEpisode,
  recordQualityFail,
  recordQualityPass,
  type QualityAttempt,
  type QualityControlRecord,
  type QualityMutationResult,
  type ReworkEpisode,
  type TaskMutationError,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import { getExecutionPlanByTaskId, writeTaskOperationalState } from "./store.js";

const QUALITY_WRITE_CONFLICT = "quality_write_conflict";

type AttemptRow = {
  task_id: string;
  attempt_seq: number;
  result: "PASS" | "FAIL";
  note: string | null;
  actor_id: string;
  recorded_at: string;
};

type EpisodeRow = {
  task_id: string;
  episode_seq: number;
  opened_by_attempt_seq: number;
  status: "OPEN" | "CLOSED";
  correction_note: string | null;
  closed_by: string | null;
  closed_at: string | null;
};

export function readQualityControlForPlan(
  db: SqliteDatabase,
  planId: string,
): QualityControlRecord {
  const attempts = (
    db
      .prepare(
        `
        SELECT a.task_id, a.attempt_seq, a.result, a.note, a.actor_id, a.recorded_at
        FROM execution_quality_attempts a
        JOIN execution_tasks t ON t.task_id = a.task_id
        WHERE t.plan_id = ?
        ORDER BY a.task_id, a.attempt_seq
      `,
      )
      .all(planId) as AttemptRow[]
  ).map(attemptFromRow);
  const episodes = (
    db
      .prepare(
        `
        SELECT e.task_id, e.episode_seq, e.opened_by_attempt_seq, e.status,
               e.correction_note, e.closed_by, e.closed_at
        FROM execution_rework_episodes e
        JOIN execution_tasks t ON t.task_id = e.task_id
        WHERE t.plan_id = ?
        ORDER BY e.task_id, e.episode_seq
      `,
      )
      .all(planId) as EpisodeRow[]
  ).map(episodeFromRow);
  return { attempts, episodes };
}

export function readQualityControlForTask(
  db: SqliteDatabase,
  taskId: string,
): QualityControlRecord | null {
  const plan = getExecutionPlanByTaskId(db, taskId);
  if (!plan) {
    return null;
  }
  return readQualityControlForPlan(db, plan.plan.planId);
}

export function persistQualityFail(
  db: SqliteDatabase,
  taskId: string,
  actorPersonId: string,
  note: unknown,
  recordedAt: string,
): QualityMutationResult {
  return runQualityTransaction(db, () => {
    const loaded = loadQualityMutation(db, taskId);
    if (!loaded.ok) {
      return loaded;
    }
    const result = recordQualityFail(
      loaded.record,
      loaded.quality,
      taskId,
      actorPersonId,
      note,
      recordedAt,
    );
    if (!result.ok || result.alreadyApplied) {
      return result;
    }
    const attempt = newestAttempt(loaded.quality, result.quality, taskId);
    const episode = newestEpisode(loaded.quality, result.quality, taskId);
    if (!attempt || attempt.result !== "FAIL" || !episode || episode.status !== "OPEN") {
      throw new Error(QUALITY_WRITE_CONFLICT);
    }
    insertAttempt(db, attempt);
    insertEpisode(db, episode);
    return storedQualityResult(db, taskId, false);
  });
}

export function persistQualityPass(
  db: SqliteDatabase,
  taskId: string,
  actorPersonId: string,
  note: unknown,
  recordedAt: string,
): QualityMutationResult {
  return runQualityTransaction(db, () => {
    const loaded = loadQualityMutation(db, taskId);
    if (!loaded.ok) {
      return loaded;
    }
    const result = recordQualityPass(
      loaded.record,
      loaded.quality,
      taskId,
      actorPersonId,
      note,
      recordedAt,
    );
    if (!result.ok || result.alreadyApplied) {
      return result;
    }
    const attempt = newestAttempt(loaded.quality, result.quality, taskId);
    const next = result.record.tasks.find((task) => task.taskId === taskId);
    const previous = loaded.record.tasks.find((task) => task.taskId === taskId);
    if (!attempt || attempt.result !== "PASS" || !next || !previous) {
      throw new Error(QUALITY_WRITE_CONFLICT);
    }
    insertAttempt(db, attempt);
    const written = writeTaskOperationalState(db, next, previous);
    if (!written) {
      throw new Error(QUALITY_WRITE_CONFLICT);
    }
    return storedQualityResult(db, taskId, false);
  });
}

export function persistQualityCorrectionClose(
  db: SqliteDatabase,
  taskId: string,
  correctionNote: unknown,
  closedBy: string,
  closedAt: string,
): QualityMutationResult {
  return runQualityTransaction(db, () => {
    const loaded = loadQualityMutation(db, taskId);
    if (!loaded.ok) {
      return loaded;
    }
    const result = closeQualityReworkEpisode(
      loaded.record,
      loaded.quality,
      taskId,
      correctionNote,
      closedBy,
      closedAt,
    );
    if (!result.ok || result.alreadyApplied) {
      return result;
    }
    const closed = result.quality.episodes.find(
      (episode) =>
        episode.taskId === taskId &&
        episode.status === "CLOSED" &&
        !loaded.quality.episodes.some(
          (previous) =>
            previous.taskId === episode.taskId &&
            previous.episodeSeq === episode.episodeSeq &&
            previous.status === "CLOSED",
        ),
    );
    if (!closed || closed.correctionNote === null || closed.closedBy === null || closed.closedAt === null) {
      throw new Error(QUALITY_WRITE_CONFLICT);
    }
    const updated = db
      .prepare(
        `
        UPDATE execution_rework_episodes
        SET status = 'CLOSED',
            correction_note = ?,
            closed_by = ?,
            closed_at = ?
        WHERE task_id = ?
          AND episode_seq = ?
          AND status = 'OPEN'
      `,
      )
      .run(
        closed.correctionNote,
        closed.closedBy,
        closed.closedAt,
        closed.taskId,
        closed.episodeSeq,
      );
    if (updated.changes !== 1) {
      throw new Error(QUALITY_WRITE_CONFLICT);
    }
    return storedQualityResult(db, taskId, false);
  });
}

function loadQualityMutation(
  db: SqliteDatabase,
  taskId: string,
): QualityMutationResult | { ok: true; record: NonNullable<ReturnType<typeof getExecutionPlanByTaskId>>; quality: QualityControlRecord } {
  const record = getExecutionPlanByTaskId(db, taskId);
  if (!record) {
    return { ok: false, error: "not_found" };
  }
  return {
    ok: true,
    record,
    quality: readQualityControlForPlan(db, record.plan.planId),
  };
}

function storedQualityResult(
  db: SqliteDatabase,
  taskId: string,
  alreadyApplied: boolean,
): QualityMutationResult {
  const record = getExecutionPlanByTaskId(db, taskId);
  if (!record) {
    return { ok: false, error: "not_found" };
  }
  return {
    ok: true,
    alreadyApplied,
    record,
    quality: readQualityControlForPlan(db, record.plan.planId),
  };
}

function runQualityTransaction(
  db: SqliteDatabase,
  mutate: () => QualityMutationResult,
): QualityMutationResult {
  const run = db.transaction(mutate);
  try {
    return run.immediate();
  } catch (error) {
    const conflict = qualityConflictError(error);
    if (conflict) {
      return { ok: false, error: conflict };
    }
    throw error;
  }
}

function qualityConflictError(error: unknown): TaskMutationError | null {
  if (error instanceof Error && error.message === QUALITY_WRITE_CONFLICT) {
    return "invalid_transition";
  }
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    !String((error as { code: unknown }).code).startsWith("SQLITE_CONSTRAINT")
  ) {
    return null;
  }
  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("execution_rework_episodes.task_id") &&
    !message.includes("episode_seq")
  ) {
    return "quality_correction_open";
  }
  return "invalid_transition";
}

function insertAttempt(db: SqliteDatabase, attempt: QualityAttempt): void {
  db.prepare(
    `
      INSERT INTO execution_quality_attempts (
        task_id, attempt_seq, result, note, actor_id, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(
    attempt.taskId,
    attempt.attemptSeq,
    attempt.result,
    attempt.note,
    attempt.actorId,
    attempt.recordedAt,
  );
}

function insertEpisode(db: SqliteDatabase, episode: ReworkEpisode): void {
  db.prepare(
    `
      INSERT INTO execution_rework_episodes (
        task_id, episode_seq, opened_by_attempt_seq, status,
        correction_note, closed_by, closed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    episode.taskId,
    episode.episodeSeq,
    episode.openedByAttemptSeq,
    episode.status,
    episode.correctionNote,
    episode.closedBy,
    episode.closedAt,
  );
}

function newestAttempt(
  previous: QualityControlRecord,
  next: QualityControlRecord,
  taskId: string,
): QualityAttempt | null {
  const known = new Set(
    previous.attempts
      .filter((attempt) => attempt.taskId === taskId)
      .map((attempt) => attempt.attemptSeq),
  );
  return (
    next.attempts.find((attempt) => attempt.taskId === taskId && !known.has(attempt.attemptSeq)) ??
    null
  );
}

function newestEpisode(
  previous: QualityControlRecord,
  next: QualityControlRecord,
  taskId: string,
): ReworkEpisode | null {
  const known = new Set(
    previous.episodes
      .filter((episode) => episode.taskId === taskId)
      .map((episode) => episode.episodeSeq),
  );
  return (
    next.episodes.find((episode) => episode.taskId === taskId && !known.has(episode.episodeSeq)) ??
    null
  );
}

function attemptFromRow(row: AttemptRow): QualityAttempt {
  return {
    taskId: row.task_id,
    attemptSeq: row.attempt_seq,
    result: row.result,
    note: row.note,
    actorId: row.actor_id,
    recordedAt: row.recorded_at,
  };
}

function episodeFromRow(row: EpisodeRow): ReworkEpisode {
  return {
    taskId: row.task_id,
    episodeSeq: row.episode_seq,
    openedByAttemptSeq: row.opened_by_attempt_seq,
    status: row.status,
    correctionNote: row.correction_note,
    closedBy: row.closed_by,
    closedAt: row.closed_at,
  };
}
