import { getJson, postJson } from "./http";

export type JobMaterialCheckTransport = {
  status: "AVAILABLE" | "MISSING";
  checkedByLabel: string;
  checkedAt: string;
};

export type JobMaterialRequestTransport = {
  requestId: string;
  requestedQuantity: number;
  unit: string;
  status: string;
  requestedByLabel: string;
  requestedAt: string;
};

export type JobMaterialLineTransport = {
  resourceId: string;
  label: string;
  unit: string;
  estimatedQuantity: number;
  taskIds: string[];
  canCheck: boolean;
  latestCheck: JobMaterialCheckTransport | null;
  openRequest: JobMaterialRequestTransport | null;
};

export type JobMaterialPreparationTransport = {
  jobId: string;
  planId: string | null;
  lines: JobMaterialLineTransport[];
};

function parsePreparation(value: unknown): JobMaterialPreparationTransport {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid_material_preparation");
  }
  const result = (value as { preparation?: unknown }).preparation;
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error("invalid_material_preparation");
  }
  const payload = result as Partial<JobMaterialPreparationTransport>;
  if (typeof payload.jobId !== "string" ||
      (payload.planId !== null && typeof payload.planId !== "string") ||
      !Array.isArray(payload.lines) ||
      payload.lines.some((line) =>
        typeof line.resourceId !== "string" ||
        typeof line.label !== "string" ||
        typeof line.unit !== "string" ||
        typeof line.estimatedQuantity !== "number" ||
        !Number.isFinite(line.estimatedQuantity) ||
        line.estimatedQuantity <= 0 ||
        !Array.isArray(line.taskIds) ||
        typeof line.canCheck !== "boolean"
      )) {
    throw new Error("invalid_material_preparation");
  }
  return payload as JobMaterialPreparationTransport;
}

export async function fetchJobMaterialPreparation(
  jobId: string,
): Promise<JobMaterialPreparationTransport> {
  return parsePreparation(
    await getJson("/api/jobs/" + encodeURIComponent(jobId) + "/material-preparation"),
  );
}

export async function submitJobMaterialDecision(
  jobId: string,
  resourceId: string,
  decision: { status: "AVAILABLE" | "MISSING"; requestedQuantity?: number },
): Promise<JobMaterialPreparationTransport> {
  return parsePreparation(await postJson(
    "/api/jobs/" + encodeURIComponent(jobId) + "/material-preparation/" +
      encodeURIComponent(resourceId) + "/decision",
    {
      ...decision,
      actionKey: crypto.randomUUID(),
    },
  ));
}
