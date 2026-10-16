import { randomUUID } from "node:crypto";
import {
  classifyTaskArtifact,
  filePurposeLabel,
  formatAttachmentSize,
  issueReasonLabel,
  parseDossierText,
  parseIssueReason,
  parseOptionalFileNote,
  parseOptionalFilePurpose,
  safeAttachmentDownloadAsciiName,
  taskArtifactDownloadHref,
  type IssueReasonCode,
  type TaskDossierError,
} from "@workos-final/domain";
import {
  attachmentIntegrityMatches,
  readScopedDocumentBytes,
  removeScopedDocumentFile,
  writeScopedDocumentBytes,
} from "../requests/attachmentStorage.js";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import { getExecutionPlanByTaskId, recordDossierEvent } from "./store.js";

export type DossierActor = {
  accountId: string;
  operatorId: string | null;
};

type EntryRow = {
  entry_id: string;
  plan_id: string;
  task_id: string;
  job_id: string | null;
  kind: string;
  body: string;
  reason_code: string | null;
  author_account_id: string;
  author_operator_id: string | null;
  created_at: string;
};

type ArtifactRow = {
  artifact_id: string;
  plan_id: string | null;
  job_id: string | null;
  original_file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  storage_key: string;
  storage_scope: string;
  category: string;
  preview: string;
  supersedes_artifact_id: string | null;
  uploaded_by_account_id: string;
  uploaded_by_operator_id: string | null;
  uploaded_at: string;
  purpose: string | null;
  purpose_note: string | null;
  used_at: string | null;
};

type LinkedArtifactRow = ArtifactRow & { link_used_at: string | null };

export type JobFileArchive = {
  jobId: string;
  files: ReturnType<typeof presentJobFile>[];
  history: Array<{
    eventId: string;
    kind: string;
    actorAccountId: string;
    actorOperatorId: string | null;
    actorLabel: string | null;
    occurredAt: string;
    artifactId: string | null;
    taskId: string | null;
    detail: Record<string, string | null>;
  }>;
};

type EventRow = {
  event_id: string;
  event_kind: string;
  actor_account_id: string;
  actor_operator_id: string | null;
  occurred_at: string;
  entry_id: string | null;
  artifact_id: string | null;
  detail_json: string;
};

export type TaskDossierResult<T> = { ok: true; dossier: T } | { ok: false; error: TaskDossierError };

export function readTaskDossier(db: SqliteDatabase, taskId: string) {
  const located = locateTask(db, taskId);
  if (!located) {
    return null;
  }
  const entries = db
    .prepare(
      `
      SELECT * FROM execution_task_dossier_entries
      WHERE task_id = ?
      ORDER BY created_at ASC, entry_id ASC
    `,
    )
    .all(taskId) as EntryRow[];
  const linked = db
    .prepare(
      `
      SELECT artifact.*, link.used_at AS link_used_at
      FROM execution_job_artifacts AS artifact
      JOIN execution_artifact_task_links AS link ON link.artifact_id = artifact.artifact_id
      WHERE link.task_id = ?
      ORDER BY artifact.uploaded_at ASC, artifact.artifact_id ASC
    `,
    )
    .all(taskId) as LinkedArtifactRow[];
  const planFiles = db
    .prepare(
      `
      SELECT * FROM execution_job_artifacts
      WHERE plan_id = ? OR job_id = ?
      ORDER BY uploaded_at ASC, artifact_id ASC
    `,
    )
    .all(located.planId, located.jobId) as ArtifactRow[];
  const events = db
    .prepare(
      `
      SELECT event_id, event_kind, actor_account_id, actor_operator_id, occurred_at,
             entry_id, artifact_id, detail_json
      FROM execution_task_dossier_events
      WHERE task_id = ?
      ORDER BY occurred_at ASC, event_id ASC
    `,
    )
    .all(taskId) as EventRow[];
  const presentEntry = (row: EntryRow) => ({
    entryId: row.entry_id,
    kind: row.kind,
    body: row.body,
    reasonCode: row.reason_code,
    reasonLabel: isIssueReason(row.reason_code) ? issueReasonLabel(row.reason_code) : null,
    authorAccountId: row.author_account_id,
    authorOperatorId: row.author_operator_id,
    authorLabel: personLabel(db, row.author_operator_id),
    createdAt: row.created_at,
  });
  return {
    taskId,
    planId: located.planId,
    jobId: located.jobId,
    taskStatus: located.status,
    instructions: entries.filter((row) => row.kind === "INSTRUCTION").map(presentEntry),
    observations: entries.filter((row) => row.kind === "OBSERVATION").map(presentEntry),
    issues: entries.filter((row) => row.kind === "ISSUE_REPORT").map(presentEntry),
    files: linked.map((row) => presentArtifact(row, taskId, true, row.link_used_at)),
    planFiles: planFiles.map((row) =>
      presentArtifact(
        row,
        taskId,
        linked.some((item) => item.artifact_id === row.artifact_id),
        null,
      ),
    ),
    history: events.map((row) => ({
      eventId: row.event_id,
      kind: row.event_kind,
      actorAccountId: row.actor_account_id,
      actorOperatorId: row.actor_operator_id,
      actorLabel: personLabel(db, row.actor_operator_id),
      occurredAt: row.occurred_at,
      entryId: row.entry_id,
      artifactId: row.artifact_id,
      detail: parseDetail(row.detail_json),
    })),
  };
}

export function addTaskDossierEntry(
  db: SqliteDatabase,
  taskId: string,
  kind: "INSTRUCTION" | "OBSERVATION" | "ISSUE_REPORT",
  body: unknown,
  actor: DossierActor,
  createdAt: string,
  reasonCode: unknown = null,
): TaskDossierResult<NonNullable<ReturnType<typeof readTaskDossier>>> {
  const text = parseDossierText(body);
  if (!text.ok) {
    return text;
  }
  let reason: IssueReasonCode | null = null;
  if (kind === "ISSUE_REPORT") {
    const parsed = parseIssueReason(reasonCode);
    if (!parsed.ok) {
      return parsed;
    }
    reason = parsed.reason;
  }
  const located = locateTask(db, taskId);
  if (!located) {
    return { ok: false, error: "not_found" };
  }
  const entryId = `den:${randomUUID()}`;
  const run = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO execution_task_dossier_entries (
        entry_id, plan_id, task_id, job_id, kind, body, reason_code,
        author_account_id, author_operator_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      entryId,
      located.planId,
      taskId,
      located.jobId,
      kind,
      text.text,
      reason,
      actor.accountId,
      actor.operatorId,
      createdAt,
    );
    recordDossierEvent(db, {
      planId: located.planId,
      taskId,
      jobId: located.jobId,
      eventKind:
        kind === "INSTRUCTION"
          ? "INSTRUCTION_ADDED"
          : kind === "OBSERVATION"
            ? "OBSERVATION_ADDED"
            : "ISSUE_REPORTED",
      actorAccountId: actor.accountId,
      actorOperatorId: actor.operatorId,
      occurredAt: createdAt,
      entryId,
      detail: {
        kind,
        reasonCode: reason,
      },
    });
  });
  run();
  const dossier = readTaskDossier(db, taskId);
  if (!dossier) {
    return { ok: false, error: "not_found" };
  }
  return { ok: true, dossier };
}

export function addTaskArtifact(
  db: SqliteDatabase,
  taskId: string,
  input: {
    originalFileName: string;
    mimeType: string | null;
    bytes: Uint8Array;
    supersedesArtifactId?: string | null;
    purpose?: unknown;
    note?: unknown;
  },
  actor: DossierActor,
  uploadedAt: string,
  documentsRoot?: string,
): TaskDossierResult<NonNullable<ReturnType<typeof readTaskDossier>>> {
  const located = locateTask(db, taskId);
  if (!located) {
    return { ok: false, error: "not_found" };
  }
  const classified = classifyTaskArtifact({
    fileName: input.originalFileName,
    mimeType: input.mimeType,
    bytes: input.bytes,
  });
  if (!classified.ok) {
    return classified;
  }
  const purpose = parseOptionalFilePurpose(input.purpose);
  if (!purpose.ok) {
    return purpose;
  }
  const note = parseOptionalFileNote(input.note);
  if (!note.ok) {
    return note;
  }
  if (input.supersedesArtifactId) {
    const previous = artifactById(db, input.supersedesArtifactId);
    const samePlan = previous?.plan_id === located.planId;
    const sameJob = Boolean(previous?.job_id && located.jobId && previous.job_id === located.jobId);
    if (!previous || (!samePlan && !sameJob)) {
      return { ok: false, error: "artifact_scope" };
    }
  }
  const storageScope = `execution/${located.planId}`;
  let stored: { storageKey: string; sha256: string };
  try {
    stored = writeScopedDocumentBytes({
      scopeSegments: storageSegments(storageScope),
      bytes: input.bytes,
      ...(documentsRoot ? { documentsRoot } : {}),
    });
  } catch {
    return { ok: false, error: "storage_unavailable" };
  }
  const artifactId = `art:${randomUUID()}`;
  try {
    const run = db.transaction(() => {
      db.prepare(
        `
        INSERT INTO execution_job_artifacts (
          artifact_id, plan_id, job_id, original_file_name, mime_type, size_bytes,
          sha256, storage_key, storage_scope, category, preview, supersedes_artifact_id,
          uploaded_by_account_id, uploaded_by_operator_id, uploaded_at,
          purpose, purpose_note, used_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `,
      ).run(
        artifactId,
        located.planId,
        located.jobId,
        input.originalFileName.slice(0, 180),
        classified.mimeType,
        input.bytes.byteLength,
        stored.sha256,
        stored.storageKey,
        storageScope,
        classified.category,
        classified.preview,
        input.supersedesArtifactId ?? null,
        actor.accountId,
        actor.operatorId,
        uploadedAt,
        purpose.purpose,
        note.note,
      );
      db.prepare(
        `
        INSERT INTO execution_artifact_task_links (
          artifact_id, task_id, plan_id, linked_at, linked_by_account_id, linked_by_operator_id
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      ).run(artifactId, taskId, located.planId, uploadedAt, actor.accountId, actor.operatorId);
      recordDossierEvent(db, {
        planId: located.planId,
        taskId,
        jobId: located.jobId,
        eventKind: "ARTIFACT_UPLOADED",
        actorAccountId: actor.accountId,
        actorOperatorId: actor.operatorId,
        occurredAt: uploadedAt,
        artifactId,
        detail: {
          fileName: input.originalFileName.slice(0, 180),
          sha256: stored.sha256,
          category: classified.category,
          purpose: purpose.purpose,
          supersedesArtifactId: input.supersedesArtifactId ?? null,
        },
      });
      if (located.jobId) {
        recordJobFileEvent(db, {
          jobId: located.jobId,
          planId: located.planId,
          taskId,
          eventKind: "ARTIFACT_UPLOADED",
          actor,
          occurredAt: uploadedAt,
          artifactId,
          detail: {
            fileName: input.originalFileName.slice(0, 180),
            sha256: stored.sha256,
            purpose: purpose.purpose,
            supersedesArtifactId: input.supersedesArtifactId ?? null,
            taskId,
          },
        });
      }
    });
    run();
  } catch {
    removeScopedDocumentFile(storageSegments(storageScope), stored.storageKey, documentsRoot);
    return { ok: false, error: "storage_unavailable" };
  }
  const dossier = readTaskDossier(db, taskId);
  if (!dossier) {
    return { ok: false, error: "not_found" };
  }
  return { ok: true, dossier };
}

export function linkTaskArtifact(
  db: SqliteDatabase,
  taskId: string,
  artifactId: string,
  actor: DossierActor,
  linkedAt: string,
): TaskDossierResult<NonNullable<ReturnType<typeof readTaskDossier>>> & { alreadyApplied?: boolean } {
  const located = locateTask(db, taskId);
  const artifact = artifactById(db, artifactId);
  if (!located || !artifact) {
    return { ok: false, error: "not_found" };
  }
  if (!artifactMatchesTask(artifact, located)) {
    return { ok: false, error: "artifact_scope" };
  }
  const existing = db
    .prepare(
      `SELECT 1 AS linked FROM execution_artifact_task_links WHERE artifact_id = ? AND task_id = ?`,
    )
    .get(artifactId, taskId) as { linked: number } | undefined;
  if (!existing) {
    const run = db.transaction(() => {
      db.prepare(
        `
        INSERT INTO execution_artifact_task_links (
          artifact_id, task_id, plan_id, linked_at, linked_by_account_id, linked_by_operator_id
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      ).run(artifactId, taskId, located.planId, linkedAt, actor.accountId, actor.operatorId);
      if (!artifact.plan_id) {
        db.prepare(
          `UPDATE execution_job_artifacts SET plan_id = ? WHERE artifact_id = ? AND plan_id IS NULL`,
        ).run(located.planId, artifactId);
      }
      recordDossierEvent(db, {
        planId: located.planId,
        taskId,
        jobId: located.jobId,
        eventKind: "ARTIFACT_LINKED",
        actorAccountId: actor.accountId,
        actorOperatorId: actor.operatorId,
        occurredAt: linkedAt,
        artifactId,
        detail: { fileName: artifact.original_file_name },
      });
      if (artifact.job_id) {
        recordJobFileEvent(db, {
          jobId: artifact.job_id,
          planId: located.planId,
          taskId,
          eventKind: "ARTIFACT_LINKED",
          actor,
          occurredAt: linkedAt,
          artifactId,
          detail: { fileName: artifact.original_file_name, taskId },
        });
      }
    });
    run();
  }
  const dossier = readTaskDossier(db, taskId);
  if (!dossier) {
    return { ok: false, error: "not_found" };
  }
  return { ok: true, dossier, alreadyApplied: Boolean(existing) };
}

export function markTaskArtifactUsed(
  db: SqliteDatabase,
  taskId: string,
  artifactId: string,
  actor: DossierActor,
  usedAt: string,
): TaskDossierResult<NonNullable<ReturnType<typeof readTaskDossier>>> & { alreadyApplied?: boolean } {
  const located = locateTask(db, taskId);
  const artifact = artifactById(db, artifactId);
  if (!located || !artifact) {
    return { ok: false, error: "not_found" };
  }
  if (!artifactMatchesTask(artifact, located)) {
    return { ok: false, error: "artifact_scope" };
  }
  const linked = db
    .prepare(
      `SELECT used_at FROM execution_artifact_task_links WHERE artifact_id = ? AND task_id = ?`,
    )
    .get(artifactId, taskId) as { used_at: string | null } | undefined;
  if (!linked) {
    return { ok: false, error: "artifact_scope" };
  }
  const alreadyApplied = Boolean(linked.used_at);
  if (!alreadyApplied) {
    const run = db.transaction(() => {
      db.prepare(
        `
        UPDATE execution_artifact_task_links
        SET used_at = ?, used_by_account_id = ?, used_by_operator_id = ?
        WHERE artifact_id = ? AND task_id = ? AND used_at IS NULL
      `,
      ).run(usedAt, actor.accountId, actor.operatorId, artifactId, taskId);
      recordDossierEvent(db, {
        planId: located.planId,
        taskId,
        jobId: located.jobId,
        eventKind: "ARTIFACT_MARKED_USED",
        actorAccountId: actor.accountId,
        actorOperatorId: actor.operatorId,
        occurredAt: usedAt,
        artifactId,
        detail: { fileName: artifact.original_file_name, taskId },
      });
      if (located.jobId) {
        recordJobFileEvent(db, {
          jobId: located.jobId,
          planId: located.planId,
          taskId,
          eventKind: "ARTIFACT_MARKED_USED",
          actor,
          occurredAt: usedAt,
          artifactId,
          detail: { fileName: artifact.original_file_name, taskId },
        });
      }
    });
    run();
  }
  const dossier = readTaskDossier(db, taskId);
  if (!dossier) {
    return { ok: false, error: "not_found" };
  }
  return { ok: true, dossier, alreadyApplied };
}

export function readTaskArtifactDownload(
  db: SqliteDatabase,
  artifactId: string,
  documentsRoot?: string,
):
  | {
      ok: true;
      fileName: string;
      asciiName: string;
      mimeType: string;
      bytes: Uint8Array;
    }
  | { ok: false; error: TaskDossierError } {
  const artifact = artifactById(db, artifactId);
  if (!artifact) {
    return { ok: false, error: "not_found" };
  }
  const segments = storageSegments(artifact.storage_scope);
  if (segments.length === 0) {
    return { ok: false, error: "file_missing" };
  }
  const bytes = readScopedDocumentBytes(segments, artifact.storage_key, documentsRoot);
  if (!bytes) {
    return { ok: false, error: "file_missing" };
  }
  if (!attachmentIntegrityMatches(bytes, artifact.sha256)) {
    return { ok: false, error: "file_corrupt" };
  }
  return {
    ok: true,
    fileName: artifact.original_file_name,
    asciiName: safeAttachmentDownloadAsciiName(artifact.original_file_name),
    mimeType: artifact.mime_type,
    bytes,
  };
}

export function readJobFileArchive(db: SqliteDatabase, jobId: string): JobFileArchive | null {
  if (!jobExists(db, jobId)) {
    return null;
  }
  const files = db
    .prepare(
      `
      SELECT * FROM execution_job_artifacts
      WHERE job_id = ?
      ORDER BY uploaded_at ASC, artifact_id ASC
    `,
    )
    .all(jobId) as ArtifactRow[];
  const events = db
    .prepare(
      `
      SELECT event_id, event_kind, actor_account_id, actor_operator_id, occurred_at,
             artifact_id, task_id, detail_json
      FROM execution_job_file_events
      WHERE job_id = ?
      ORDER BY occurred_at ASC, event_id ASC
    `,
    )
    .all(jobId) as Array<EventRow & { task_id: string | null }>;
  return {
    jobId,
    files: files.map((row) => presentJobFile(row, db)),
    history: events.map((row) => ({
      eventId: row.event_id,
      kind: row.event_kind,
      actorAccountId: row.actor_account_id,
      actorOperatorId: row.actor_operator_id,
      actorLabel: personLabel(db, row.actor_operator_id),
      occurredAt: row.occurred_at,
      artifactId: row.artifact_id,
      taskId: row.task_id,
      detail: parseDetail(row.detail_json),
    })),
  };
}

export function addJobArtifact(
  db: SqliteDatabase,
  jobId: string,
  input: {
    originalFileName: string;
    mimeType: string | null;
    bytes: Uint8Array;
    supersedesArtifactId?: string | null;
    purpose?: unknown;
    note?: unknown;
  },
  actor: DossierActor,
  uploadedAt: string,
  documentsRoot?: string,
): { ok: true; archive: JobFileArchive } | { ok: false; error: TaskDossierError } {
  if (!jobExists(db, jobId)) {
    return { ok: false, error: "not_found" };
  }
  const classified = classifyTaskArtifact({
    fileName: input.originalFileName,
    mimeType: input.mimeType,
    bytes: input.bytes,
  });
  if (!classified.ok) {
    return classified;
  }
  const purpose = parseOptionalFilePurpose(input.purpose);
  if (!purpose.ok) {
    return purpose;
  }
  const note = parseOptionalFileNote(input.note);
  if (!note.ok) {
    return note;
  }
  if (input.supersedesArtifactId) {
    const previous = artifactById(db, input.supersedesArtifactId);
    if (!previous || previous.job_id !== jobId) {
      return { ok: false, error: "artifact_scope" };
    }
  }
  const storageScope = `execution/jobs/${jobId}`;
  let stored: { storageKey: string; sha256: string };
  try {
    stored = writeScopedDocumentBytes({
      scopeSegments: storageSegments(storageScope),
      bytes: input.bytes,
      ...(documentsRoot ? { documentsRoot } : {}),
    });
  } catch {
    return { ok: false, error: "storage_unavailable" };
  }
  const artifactId = `art:${randomUUID()}`;
  try {
    const run = db.transaction(() => {
      db.prepare(
        `
        INSERT INTO execution_job_artifacts (
          artifact_id, plan_id, job_id, original_file_name, mime_type, size_bytes,
          sha256, storage_key, storage_scope, category, preview, supersedes_artifact_id,
          uploaded_by_account_id, uploaded_by_operator_id, uploaded_at,
          purpose, purpose_note, used_at
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `,
      ).run(
        artifactId,
        jobId,
        input.originalFileName.slice(0, 180),
        classified.mimeType,
        input.bytes.byteLength,
        stored.sha256,
        stored.storageKey,
        storageScope,
        classified.category,
        classified.preview,
        input.supersedesArtifactId ?? null,
        actor.accountId,
        actor.operatorId,
        uploadedAt,
        purpose.purpose,
        note.note,
      );
      recordJobFileEvent(db, {
        jobId,
        planId: null,
        taskId: null,
        eventKind: "ARTIFACT_UPLOADED",
        actor,
        occurredAt: uploadedAt,
        artifactId,
        detail: {
          fileName: input.originalFileName.slice(0, 180),
          sha256: stored.sha256,
          purpose: purpose.purpose,
          supersedesArtifactId: input.supersedesArtifactId ?? null,
        },
      });
    });
    run();
  } catch {
    removeScopedDocumentFile(storageSegments(storageScope), stored.storageKey, documentsRoot);
    return { ok: false, error: "storage_unavailable" };
  }
  const archive = readJobFileArchive(db, jobId);
  if (!archive) {
    return { ok: false, error: "not_found" };
  }
  return { ok: true, archive };
}

function presentArtifact(row: ArtifactRow, taskId: string, linkedToTask: boolean, usedAt: string | null) {
  return {
    artifactId: row.artifact_id,
    planId: row.plan_id,
    jobId: row.job_id,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sizeLabel: formatAttachmentSize(row.size_bytes),
    sha256: row.sha256,
    category: row.category,
    purpose: row.purpose,
    purposeLabel: knownPurposeLabel(row.purpose),
    note: row.purpose_note,
    usedAt,
    preview: row.preview,
    supersedesArtifactId: row.supersedes_artifact_id,
    uploadedByAccountId: row.uploaded_by_account_id,
    uploadedByOperatorId: row.uploaded_by_operator_id,
    uploadedAt: row.uploaded_at,
    downloadHref: taskArtifactDownloadHref(row.artifact_id),
    linkedToTask,
    taskId,
  };
}

function presentJobFile(row: ArtifactRow, db: SqliteDatabase) {
  return {
    artifactId: row.artifact_id,
    planId: row.plan_id,
    jobId: row.job_id,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sizeLabel: formatAttachmentSize(row.size_bytes),
    sha256: row.sha256,
    category: row.category,
    purpose: row.purpose,
    purposeLabel: knownPurposeLabel(row.purpose),
    note: row.purpose_note,
    preview: row.preview,
    supersedesArtifactId: row.supersedes_artifact_id,
    uploadedByAccountId: row.uploaded_by_account_id,
    uploadedByOperatorId: row.uploaded_by_operator_id,
    authorLabel: personLabel(db, row.uploaded_by_operator_id),
    uploadedAt: row.uploaded_at,
    downloadHref: taskArtifactDownloadHref(row.artifact_id),
  };
}

function knownPurposeLabel(purpose: string | null): string | null {
  if (!purpose) {
    return null;
  }
  const parsed = parseOptionalFilePurpose(purpose);
  return parsed.ok && parsed.purpose ? filePurposeLabel(parsed.purpose) : null;
}

function artifactMatchesTask(
  artifact: ArtifactRow,
  located: { planId: string; jobId: string | null },
): boolean {
  if (artifact.job_id && located.jobId && artifact.job_id !== located.jobId) {
    return false;
  }
  if (artifact.plan_id && artifact.plan_id !== located.planId) {
    return false;
  }
  if (!artifact.plan_id && !(artifact.job_id && located.jobId && artifact.job_id === located.jobId)) {
    return false;
  }
  return true;
}

function storageSegments(scope: string): string[] {
  const parts = scope.split("/");
  if (parts.length === 0 || parts.some((part) => !part || part === "." || part === "..")) {
    return [];
  }
  return parts;
}

function jobExists(db: SqliteDatabase, jobId: string): boolean {
  const row = db
    .prepare(
      `
      SELECT 1 AS present FROM order_snapshots WHERE order_snapshot_id = ?
      UNION ALL
      SELECT 1 FROM assembly_order_snapshots WHERE order_snapshot_id = ?
      LIMIT 1
    `,
    )
    .get(jobId, jobId) as { present: number } | undefined;
  return Boolean(row);
}

function recordJobFileEvent(
  db: SqliteDatabase,
  input: {
    jobId: string;
    planId: string | null;
    taskId: string | null;
    eventKind: string;
    actor: DossierActor;
    occurredAt: string;
    artifactId: string;
    detail: Record<string, string | null>;
  },
): void {
  db.prepare(
    `
    INSERT INTO execution_job_file_events (
      event_id, job_id, plan_id, task_id, event_kind,
      actor_account_id, actor_operator_id, occurred_at, artifact_id, detail_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    `jfe:${randomUUID()}`,
    input.jobId,
    input.planId,
    input.taskId,
    input.eventKind,
    input.actor.accountId,
    input.actor.operatorId,
    input.occurredAt,
    input.artifactId,
    JSON.stringify(input.detail),
  );
}

function artifactById(db: SqliteDatabase, artifactId: string): ArtifactRow | null {
  const row = db
    .prepare(`SELECT * FROM execution_job_artifacts WHERE artifact_id = ?`)
    .get(artifactId) as ArtifactRow | undefined;
  return row ?? null;
}

function locateTask(db: SqliteDatabase, taskId: string) {
  const record = getExecutionPlanByTaskId(db, taskId);
  const task = record?.tasks.find((item) => item.taskId === taskId);
  if (!record || !task) {
    return null;
  }
  return {
    planId: record.plan.planId,
    status: task.status,
    jobId: jobIdForSnapshot(db, record.plan.sourceSnapshotId),
  };
}

function jobIdForSnapshot(db: SqliteDatabase, snapshotId: string): string | null {
  const accepted = db
    .prepare(
      `SELECT source_order_snapshot_id AS job_id FROM accepted_production_snapshots WHERE snapshot_id = ?`,
    )
    .get(snapshotId) as { job_id: string | null } | undefined;
  if (accepted?.job_id) {
    return accepted.job_id;
  }
  const assembly = db
    .prepare(
      `SELECT source_order_snapshot_id AS job_id FROM assembly_production_snapshots WHERE snapshot_id = ?`,
    )
    .get(snapshotId) as { job_id: string | null } | undefined;
  return assembly?.job_id ?? null;
}

function personLabel(db: SqliteDatabase, personId: string | null): string | null {
  if (!personId) {
    return null;
  }
  const row = db
    .prepare(`SELECT display_name FROM people WHERE person_id = ?`)
    .get(personId) as { display_name: string } | undefined;
  return row?.display_name ?? null;
}

function parseDetail(raw: string): Record<string, string | null> {
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }
    const detail: Record<string, string | null> = {};
    for (const [key, item] of Object.entries(value)) {
      detail[key] = typeof item === "string" ? item : item === null ? null : null;
    }
    return detail;
  } catch {
    return {};
  }
}

function isIssueReason(value: string | null): value is IssueReasonCode {
  return value === "MATERIAL" || value === "MACHINE" || value === "DRAWING" || value === "QUALITY" || value === "OTHER";
}
