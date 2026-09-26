import { getResource } from "../resources/catalog.js";

export const MATERIAL_READINESS_MODES = ["DISABLED", "REQUIRED"] as const;
export type MaterialReadinessMode = (typeof MATERIAL_READINESS_MODES)[number];

export const MATERIAL_CONFIRMATION_STATUSES = ["AVAILABLE", "NOT_AVAILABLE"] as const;
export type MaterialConfirmationStatus = (typeof MATERIAL_CONFIRMATION_STATUSES)[number];

export const MATERIAL_LINE_STATUSES = [
  "AVAILABLE",
  "NOT_AVAILABLE",
  "UNKNOWN",
  "UNRESOLVED",
] as const;
export type MaterialLineStatus = (typeof MATERIAL_LINE_STATUSES)[number];

export const MATERIAL_PARTICIPATIONS = [
  "NOT_ADOPTED",
  "NOT_APPLICABLE",
  "READY",
  "BLOCKED",
] as const;
export type MaterialParticipation = (typeof MATERIAL_PARTICIPATIONS)[number];

export type MaterialReadinessConfirmation = {
  taskId: string;
  resourceId: string;
  status: MaterialConfirmationStatus;
  confirmedBy: string;
  confirmedAt: string;
};

export type MaterialReadinessContext = {
  mode: MaterialReadinessMode;
  confirmations: readonly MaterialReadinessConfirmation[];
};

export const DISABLED_MATERIAL_READINESS: MaterialReadinessContext = {
  mode: "DISABLED",
  confirmations: [],
};

export type MaterialDemandLine = {
  resourceId: string;
  label: string;
  status: MaterialLineStatus;
  statusLabel: string;
};

export type StoredMaterialReadinessMode = {
  version: number;
  mode: MaterialReadinessMode;
  updatedAt: string;
  updatedBy: string;
};

export type MaterialReadinessModeRecord = StoredMaterialReadinessMode & {
  source: "STORED" | "CODE_DEFAULT";
};

export const MATERIAL_CONFIRMATION_ERRORS = [
  "task_not_found",
  "not_material_demand",
  "invalid_status",
] as const;
export type MaterialConfirmationError = (typeof MATERIAL_CONFIRMATION_ERRORS)[number];

type MaterialTaskDemand = {
  taskId: string;
  resourceDemands: readonly { resourceId: string; label: string }[];
};

export function parseMaterialReadinessMode(value: string): MaterialReadinessMode | null {
  switch (value) {
    case "DISABLED":
    case "REQUIRED":
      return value;
    default:
      return null;
  }
}

export function materialReadinessModeLabel(mode: MaterialReadinessMode): string {
  switch (mode) {
    case "DISABLED":
      return "Oprit";
    case "REQUIRED":
      return "Obligatoriu";
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

export function materialLineStatusLabel(status: MaterialLineStatus): string {
  switch (status) {
    case "AVAILABLE":
      return "Disponibil";
    case "NOT_AVAILABLE":
      return "Indisponibil";
    case "UNKNOWN":
      return "Neconfirmat";
    case "UNRESOLVED":
      return "Resursă necunoscută";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function resolveMaterialReadinessMode(
  versions: readonly StoredMaterialReadinessMode[],
): MaterialReadinessModeRecord {
  if (versions.length === 0) {
    return {
      version: 0,
      mode: "DISABLED",
      updatedAt: "",
      updatedBy: "",
      source: "CODE_DEFAULT",
    };
  }
  const latest = [...versions].sort((left, right) => right.version - left.version)[0];
  if (!latest) {
    return {
      version: 0,
      mode: "DISABLED",
      updatedAt: "",
      updatedBy: "",
      source: "CODE_DEFAULT",
    };
  }
  return { ...latest, source: "STORED" };
}

export function nextMaterialReadinessVersion(
  current: MaterialReadinessModeRecord,
  mode: MaterialReadinessMode,
  updatedAt: string,
  updatedBy: string,
): StoredMaterialReadinessMode | null {
  if (current.source === "CODE_DEFAULT" && mode === "DISABLED") {
    return null;
  }
  if (current.source === "STORED" && current.mode === mode) {
    return null;
  }
  return {
    version: current.version + 1,
    mode,
    updatedAt,
    updatedBy,
  };
}

export function materialDemandLines(
  task: MaterialTaskDemand,
  confirmations: readonly MaterialReadinessConfirmation[],
): MaterialDemandLine[] {
  const lines: MaterialDemandLine[] = [];
  for (const demand of task.resourceDemands) {
    const resource = getResource(demand.resourceId);
    if (!resource) {
      lines.push({
        resourceId: demand.resourceId,
        label: demand.label,
        status: "UNRESOLVED",
        statusLabel: materialLineStatusLabel("UNRESOLVED"),
      });
      continue;
    }
    if (resource.kind !== "MATERIAL") {
      continue;
    }
    const confirmation = confirmations.find(
      (item) => item.taskId === task.taskId && item.resourceId === demand.resourceId,
    );
    const status = confirmation?.status ?? "UNKNOWN";
    lines.push({
      resourceId: demand.resourceId,
      label: demand.label,
      status,
      statusLabel: materialLineStatusLabel(status),
    });
  }
  return lines;
}

export function materialParticipation(
  mode: MaterialReadinessMode,
  lines: readonly MaterialDemandLine[],
): MaterialParticipation {
  switch (mode) {
    case "DISABLED":
      return "NOT_ADOPTED";
    case "REQUIRED":
      if (lines.length === 0) {
        return "NOT_APPLICABLE";
      }
      if (lines.every((line) => line.status === "AVAILABLE")) {
        return "READY";
      }
      return "BLOCKED";
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

export function materialBlocksStart(
  mode: MaterialReadinessMode,
  lines: readonly MaterialDemandLine[],
): boolean {
  return materialParticipation(mode, lines) === "BLOCKED";
}

export function materialBlockLabel(
  participation: MaterialParticipation,
  lines: readonly MaterialDemandLine[],
): string | null {
  if (participation !== "BLOCKED") {
    return null;
  }
  const names = lines
    .filter((line) => line.status !== "AVAILABLE")
    .map((line) => line.label);
  if (names.length === 0) {
    return "Materialul nu este confirmat disponibil.";
  }
  return `Materialul nu este confirmat disponibil: ${names.join(", ")}.`;
}

export function confirmMaterialReadiness(input: {
  task: MaterialTaskDemand | null;
  resourceId: string;
  status: string;
  confirmedBy: string;
  confirmedAt: string;
  existing: readonly MaterialReadinessConfirmation[];
}):
  | { ok: true; confirmation: MaterialReadinessConfirmation; unchanged: boolean }
  | { ok: false; error: MaterialConfirmationError } {
  if (!input.task) {
    return { ok: false, error: "task_not_found" };
  }
  if (input.status !== "AVAILABLE" && input.status !== "NOT_AVAILABLE") {
    return { ok: false, error: "invalid_status" };
  }
  const line = materialDemandLines(input.task, input.existing).find(
    (item) => item.resourceId === input.resourceId,
  );
  if (!line || line.status === "UNRESOLVED") {
    return { ok: false, error: "not_material_demand" };
  }
  const previous = input.existing.find(
    (item) => item.taskId === input.task?.taskId && item.resourceId === input.resourceId,
  );
  if (previous && previous.status === input.status) {
    return { ok: true, confirmation: previous, unchanged: true };
  }
  return {
    ok: true,
    unchanged: false,
    confirmation: {
      taskId: input.task.taskId,
      resourceId: input.resourceId,
      status: input.status,
      confirmedBy: input.confirmedBy,
      confirmedAt: input.confirmedAt,
    },
  };
}
