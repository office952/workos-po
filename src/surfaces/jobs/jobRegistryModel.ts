import type { JobListItemTransport, JobOverviewSummaryTransport } from "../../api/types";
import { matchesSearch } from "../../presentation/listFilter";
import { readRegistryMemory, writeRegistryMemory } from "../../session/registryMemory";
import { JOBS_MEMORY_KEY } from "../../session/registryMemoryKeys";
import type { DeskSignal } from "../desk/DeskSignalBoard";
import type { Density } from "../desk/DeskToolbar";

/** One station per server stage code. Labels describe the station; the job's own label comes from stageLabel. */
export const STATIONS = [
  { stage: "ORDER_CREATED", label: "Comandă", short: "Comandă", milestone: "Comandă creată" },
  { stage: "RELEASED", label: "Eliberată", short: "Eliber.", milestone: "Eliberare în producție" },
  { stage: "EXECUTION_PLANNED", label: "Plan", short: "Plan", milestone: "Plan de execuție" },
  { stage: "EXECUTION_IN_PROGRESS", label: "În execuție", short: "Execuție", milestone: "Atelier / execuție" },
  { stage: "EXECUTION_COMPLETED", label: "Finalizată", short: "Final", milestone: "Lucrare finalizată" },
] as const;

export type RouteMark = "done" | "current" | "future" | "unknown";

/** Visual milestones only; blockers, progress and next actions stay server-owned. */
export function routeMarks(stage: string): RouteMark[] {
  const completedMilestones: Record<string, number> = {
    ORDER_CREATED: 1,
    RELEASED: 2,
    EXECUTION_PLANNED: 3,
    EXECUTION_IN_PROGRESS: 3,
    EXECUTION_COMPLETED: 5,
  };
  const done = completedMilestones[stage];
  if (done === undefined) return STATIONS.map(() => "unknown");
  return STATIONS.map((_, index) => {
    if (index < done) return "done";
    if (stage === "EXECUTION_IN_PROGRESS" && index === 3) return "current";
    return "future";
  });
}

export const ROUTE_MARK_LABEL: Record<RouteMark, string> = {
  done: "Finalizat",
  current: "În lucru",
  future: "Urmează",
  unknown: "Necunoscut",
};

export function jobName(job: JobListItemTransport): string {
  return job.kind === "ASSEMBLY" ? job.productLabel : job.inscription || job.productLabel;
}

export function jobContext(job: JobListItemTransport): string {
  const what = job.kind === "ASSEMBLY" ? job.inscription : job.inscription && job.inscription !== job.productLabel ? job.productLabel : "";
  return [job.customerDisplayName ?? "Client neprecizat", what, job.kindLabel].filter(Boolean).join("  ·  ");
}

/** Operation progress, only from the numeric counts the server sends. */
export type OperationProgress = { completed: number; total: number; inProgress: number | null; fraction: number };

export function operationProgress(job: JobListItemTransport): OperationProgress | null {
  const total = job.taskCount;
  const completed = job.completedCount;
  if (typeof total !== "number" || typeof completed !== "number" || total <= 0) return null;
  return {
    completed,
    total,
    inProgress: typeof job.inProgressCount === "number" ? job.inProgressCount : null,
    fraction: Math.min(1, Math.max(0, completed / total)),
  };
}

/** The text shown beside the progress: the server label, or the existing "no plan" wording. */
export function progressText(job: JobListItemTransport): string {
  return job.progressLabel ?? "Fără plan de execuție";
}

export type JobFocus = "all" | "urgent" | "overdue";
export type JobSort = "newest" | "oldest";

export type JobFilters = {
  query: string;
  attention: boolean;
  focus: JobFocus;
  stage: string | null;
};

export const EMPTY_JOB_FILTERS: JobFilters = { query: "", attention: false, focus: "all", stage: null };

export const FOCUS_OPTIONS: readonly { id: JobFocus; label: string }[] = [
  { id: "all", label: "Toate" },
  { id: "urgent", label: "Urgente" },
  { id: "overdue", label: "Termen depășit" },
];

/** Attention on a finished job is consultation, not work: it stays out of "Necesită acțiune". */
function needsAction(job: JobListItemTransport): boolean {
  return job.needsAttention && job.stage !== "EXECUTION_COMPLETED";
}

function dateValue(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function filterJobs(items: readonly JobListItemTransport[], filters: JobFilters, sort: JobSort): JobListItemTransport[] {
  return items
    .filter(
      (job) =>
        (!filters.attention || needsAction(job)) &&
        (filters.focus === "all" || (filters.focus === "urgent" ? job.priority === "URGENT" : job.overdue)) &&
        (filters.stage === null || job.stage === filters.stage) &&
        matchesSearch(filters.query, [
          job.inscription, job.productLabel, job.customerDisplayName, job.stageLabel, job.priorityLabel,
          job.kindLabel, job.nextActionLabel, job.attentionLabel, job.progressLabel, job.targetDateLabel, ...job.memberLabels,
        ]),
    )
    .sort((left, right) => {
      const a = dateValue(left.createdAt);
      const b = dateValue(right.createdAt);
      if (a === null) return b === null ? 0 : 1;
      if (b === null) return -1;
      return sort === "newest" ? b - a : a - b;
    });
}

export function hasJobFilter(filters: JobFilters): boolean {
  return filters.query.trim() !== "" || filters.attention || filters.focus !== "all" || filters.stage !== null;
}

/** Station counts group the whole overview by stage code: no rule is added, only the server code is read. */
export function stationTally(items: readonly JobListItemTransport[]) {
  return STATIONS.map((station) => {
    const jobs = items.filter((job) => job.stage === station.stage);
    return { ...station, count: jobs.length, jobs };
  });
}

export function jobSignals(summary: JobOverviewSummaryTransport | null, items: readonly JobListItemTransport[], filters: JobFilters): DeskSignal[] {
  return [
    {
      id: "all",
      label: "Toate",
      count: summary?.total ?? items.length,
      tone: "neutral",
      pressed: !filters.attention && filters.stage === null && filters.focus === "all",
    },
    {
      id: "attention",
      label: "Necesită acțiune",
      count: items.filter(needsAction).length,
      tone: "attention",
      pressed: filters.attention,
    },
  ];
}

export type JobsMemory = { filters: JobFilters; sort: JobSort; density: Density };

const DEFAULT_MEMORY: JobsMemory = { filters: EMPTY_JOB_FILTERS, sort: "newest", density: "comfortable" };

export function readJobsMemory(): JobsMemory {
  return readRegistryMemory(JOBS_MEMORY_KEY, DEFAULT_MEMORY, (value) => {
    const filters = value.filters && typeof value.filters === "object" ? (value.filters as Record<string, unknown>) : {};
    const focus = FOCUS_OPTIONS.some((option) => option.id === filters.focus) ? (filters.focus as JobFocus) : "all";
    const stage = STATIONS.some((station) => station.stage === filters.stage) ? (filters.stage as string) : null;
    return {
      filters: {
        query: typeof filters.query === "string" ? filters.query : "",
        attention: filters.attention === true,
        focus,
        stage,
      },
      sort: value.sort === "oldest" ? "oldest" : "newest",
      density: value.density === "compact" ? "compact" : "comfortable",
    };
  });
}

export function writeJobsMemory(memory: JobsMemory): void {
  writeRegistryMemory(JOBS_MEMORY_KEY, memory);
}
