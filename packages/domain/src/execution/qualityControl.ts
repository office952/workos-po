import {
  INSPECT_FINISHED_ASSEMBLY_ID,
  INSPECT_FINISHED_LETTER_ID,
  INSPECT_FINISHED_LOGO_ID,
  TEST_ILLUMINATION_UNIFORMITY_ID,
} from "../processes/catalog.js";

export const QUALITY_CONTROL_EXECUTION_PROCESS_IDS = [
  TEST_ILLUMINATION_UNIFORMITY_ID,
  INSPECT_FINISHED_LETTER_ID,
  INSPECT_FINISHED_LOGO_ID,
  INSPECT_FINISHED_ASSEMBLY_ID,
] as const;

const QUALITY_CONTROL_EXECUTION_PROCESS_ID_SET = new Set<string>(
  QUALITY_CONTROL_EXECUTION_PROCESS_IDS,
);

export function isQualityControlExecutionProcess(processId: string): boolean {
  return QUALITY_CONTROL_EXECUTION_PROCESS_ID_SET.has(processId);
}

export const QUALITY_RESULTS = ["PASS", "FAIL"] as const;
export type QualityResult = (typeof QUALITY_RESULTS)[number];

export const REWORK_EPISODE_STATUSES = ["OPEN", "CLOSED"] as const;
export type ReworkEpisodeStatus = (typeof REWORK_EPISODE_STATUSES)[number];

export const QUALITY_NOTE_MAX_LENGTH = 280;

export type QualityAttempt = {
  taskId: string;
  attemptSeq: number;
  result: QualityResult;
  note: string | null;
  actorId: string;
  recordedAt: string;
};

export type ReworkEpisode = {
  taskId: string;
  episodeSeq: number;
  openedByAttemptSeq: number;
  status: ReworkEpisodeStatus;
  correctionNote: string | null;
  closedBy: string | null;
  closedAt: string | null;
};

export type QualityControlRecord = {
  attempts: readonly QualityAttempt[];
  episodes: readonly ReworkEpisode[];
};

export type QualityControlProjectionInput = QualityControlRecord & {
  viewerIsOwner: boolean;
};

export const EMPTY_QUALITY_CONTROL: QualityControlProjectionInput = {
  attempts: [],
  episodes: [],
  viewerIsOwner: false,
};

export type QualityTaskProjection = {
  qualityControl: boolean;
  latestQualityResult: QualityResult | null;
  qualityAttemptCount: number;
  qualityAttempts: readonly QualityAttempt[];
  reworkEpisodes: readonly ReworkEpisode[];
  openReworkEpisode: ReworkEpisode | null;
  canRecordQualityPass: boolean;
  canRecordQualityFail: boolean;
  canCloseReworkEpisode: boolean;
  qualityBlockLabel: string | null;
};

export function parseQualityNote(
  note: unknown,
  required: boolean,
): { ok: true; note: string | null } | { ok: false } {
  if (note === undefined || note === null) {
    return required ? { ok: false } : { ok: true, note: null };
  }
  if (typeof note !== "string") {
    return { ok: false };
  }
  const trimmed = note.trim();
  if (trimmed.length === 0) {
    return required ? { ok: false } : { ok: true, note: null };
  }
  if (trimmed.length > QUALITY_NOTE_MAX_LENGTH) {
    return { ok: false };
  }
  return { ok: true, note: trimmed };
}

export function taskQualityAttempts(
  quality: QualityControlRecord,
  taskId: string,
): QualityAttempt[] {
  return quality.attempts
    .filter((attempt) => attempt.taskId === taskId)
    .slice()
    .sort((left, right) => left.attemptSeq - right.attemptSeq);
}

export function taskReworkEpisodes(
  quality: QualityControlRecord,
  taskId: string,
): ReworkEpisode[] {
  return quality.episodes
    .filter((episode) => episode.taskId === taskId)
    .slice()
    .sort((left, right) => left.episodeSeq - right.episodeSeq);
}

export function openReworkEpisode(
  episodes: readonly ReworkEpisode[],
): ReworkEpisode | null {
  return episodes.find((episode) => episode.status === "OPEN") ?? null;
}

export function appendQualityFail(
  quality: QualityControlRecord,
  taskId: string,
  actorId: string,
  note: string,
  recordedAt: string,
):
  | { ok: true; quality: QualityControlRecord }
  | { ok: false; error: "quality_correction_open" } {
  const attempts = taskQualityAttempts(quality, taskId);
  const episodes = taskReworkEpisodes(quality, taskId);
  if (openReworkEpisode(episodes)) {
    return { ok: false, error: "quality_correction_open" };
  }
  const attemptSeq = nextSequence(attempts.map((attempt) => attempt.attemptSeq));
  const episodeSeq = nextSequence(episodes.map((episode) => episode.episodeSeq));
  return {
    ok: true,
    quality: {
      attempts: [
        ...quality.attempts,
        {
          taskId,
          attemptSeq,
          result: "FAIL",
          note,
          actorId,
          recordedAt,
        },
      ],
      episodes: [
        ...quality.episodes,
        {
          taskId,
          episodeSeq,
          openedByAttemptSeq: attemptSeq,
          status: "OPEN",
          correctionNote: null,
          closedBy: null,
          closedAt: null,
        },
      ],
    },
  };
}

export function appendQualityPass(
  quality: QualityControlRecord,
  taskId: string,
  actorId: string,
  note: string | null,
  recordedAt: string,
):
  | { ok: true; quality: QualityControlRecord }
  | { ok: false; error: "quality_correction_open" } {
  const attempts = taskQualityAttempts(quality, taskId);
  const episodes = taskReworkEpisodes(quality, taskId);
  if (openReworkEpisode(episodes)) {
    return { ok: false, error: "quality_correction_open" };
  }
  const attemptSeq = nextSequence(attempts.map((attempt) => attempt.attemptSeq));
  return {
    ok: true,
    quality: {
      attempts: [
        ...quality.attempts,
        {
          taskId,
          attemptSeq,
          result: "PASS",
          note,
          actorId,
          recordedAt,
        },
      ],
      episodes: quality.episodes,
    },
  };
}

export function closeOpenReworkEpisode(
  quality: QualityControlRecord,
  taskId: string,
  correctionNote: string,
  closedBy: string,
  closedAt: string,
):
  | { ok: true; quality: QualityControlRecord }
  | { ok: false; error: "invalid_transition" } {
  const episodes = taskReworkEpisodes(quality, taskId);
  const open = openReworkEpisode(episodes);
  if (!open) {
    return { ok: false, error: "invalid_transition" };
  }
  return {
    ok: true,
    quality: {
      attempts: quality.attempts,
      episodes: quality.episodes.map((episode) =>
        episode.taskId === open.taskId && episode.episodeSeq === open.episodeSeq
          ? {
              ...episode,
              status: "CLOSED",
              correctionNote,
              closedBy,
              closedAt,
            }
          : episode,
      ),
    },
  };
}

export function projectQualityControl(input: {
  processId: string;
  status: string;
  executionMode: "INTERNAL" | "EXTERNAL";
  ownedByCurrent: boolean;
  machineRunActive: boolean;
  attempts: readonly QualityAttempt[];
  episodes: readonly ReworkEpisode[];
  viewerIsOwner: boolean;
}): QualityTaskProjection {
  const qualityControl = isQualityControlExecutionProcess(input.processId);
  if (!qualityControl) {
    return {
      qualityControl: false,
      latestQualityResult: null,
      qualityAttemptCount: 0,
      qualityAttempts: [],
      reworkEpisodes: [],
      openReworkEpisode: null,
      canRecordQualityPass: false,
      canRecordQualityFail: false,
      canCloseReworkEpisode: false,
      qualityBlockLabel: null,
    };
  }
  const attempts = input.attempts.slice().sort((left, right) => left.attemptSeq - right.attemptSeq);
  const episodes = input.episodes.slice().sort((left, right) => left.episodeSeq - right.episodeSeq);
  const open = openReworkEpisode(episodes);
  const latestQualityResult = attempts.at(-1)?.result ?? null;
  const canRecord =
    input.status === "IN_PROGRESS" &&
    input.executionMode === "INTERNAL" &&
    input.ownedByCurrent &&
    !input.machineRunActive &&
    open === null;
  const canCloseReworkEpisode =
    input.status === "IN_PROGRESS" && open !== null && input.viewerIsOwner;
  let qualityBlockLabel: string | null = null;
  if (input.status === "IN_PROGRESS" && open) {
    qualityBlockLabel = "Este necesară corecția";
  } else if (canRecord && latestQualityResult === "FAIL") {
    qualityBlockLabel = "Poate fi verificată din nou";
  } else if (canRecord) {
    qualityBlockLabel = "Controlul poate fi înregistrat";
  }
  return {
    qualityControl: true,
    latestQualityResult,
    qualityAttemptCount: attempts.length,
    qualityAttempts: attempts,
    reworkEpisodes: episodes,
    openReworkEpisode: open,
    canRecordQualityPass: canRecord,
    canRecordQualityFail: canRecord,
    canCloseReworkEpisode,
    qualityBlockLabel,
  };
}

function nextSequence(values: readonly number[]): number {
  return values.reduce((max, value) => Math.max(max, value), 0) + 1;
}
