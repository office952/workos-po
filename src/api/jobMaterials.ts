import { getJson, postJson, TransportError } from "./http";

export type JobMaterialCheckTransport = {
  status: "AVAILABLE" | "MISSING";
  checkedByLabel: string;
  checkedAt: string;
};

export type JobMaterialRequestTransport = {
  requestId: string;
  requestedQuantity: number | null;
  unit: string;
  status: string;
  requestedByLabel: string;
  requestedAt: string;
  requiresReview: boolean;
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
        typeof line.canCheck !== "boolean" ||
        (line.openRequest !== null && (
          typeof line.openRequest !== "object" ||
          typeof line.openRequest.requiresReview !== "boolean" ||
          !(
            line.openRequest.requestedQuantity === null ||
            (typeof line.openRequest.requestedQuantity === "number" &&
              Number.isFinite(line.openRequest.requestedQuantity) &&
              line.openRequest.requestedQuantity > 0)
          )
        ))
      )) {
    throw new Error("invalid_material_preparation");
  }
  return payload as JobMaterialPreparationTransport;
}

export class MaterialDecisionConflictError extends TransportError {
  readonly preparation: JobMaterialPreparationTransport;

  constructor(preparation: JobMaterialPreparationTransport) {
    super("Starea materialelor a fost modificată.", 409);
    this.name = "MaterialDecisionConflictError";
    this.preparation = preparation;
  }
}

type MaterialDecision = {
  status: "AVAILABLE" | "MISSING";
};

type PendingMaterialAction = {
  fingerprint: string;
  actionKey: string;
};

const pendingActions = new Map<string, PendingMaterialAction>();

function decisionFingerprint(decision: MaterialDecision): string {
  return decision.status;
}

/** Test hook. Pending keys survive a lost response until the same action succeeds. */
export function resetPendingJobMaterialActionKeys(): void {
  pendingActions.clear();
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
  decision: MaterialDecision,
): Promise<JobMaterialPreparationTransport> {
  const slot = jobId + "\n" + resourceId;
  const fingerprint = decisionFingerprint(decision);
  const pending = pendingActions.get(slot);
  const actionKey = pending?.fingerprint === fingerprint
    ? pending.actionKey
    : crypto.randomUUID();
  pendingActions.set(slot, { fingerprint, actionKey });
  const path = "/api/jobs/" + encodeURIComponent(jobId) + "/material-preparation/" +
    encodeURIComponent(resourceId) + "/decision";
  try {
    const updated = parsePreparation(await postJson(path, { ...decision, actionKey }));
    pendingActions.delete(slot);
    return updated;
  } catch (error) {
    if (!(error instanceof TransportError) || error.status !== 409) {
      throw error;
    }
    let current: JobMaterialPreparationTransport;
    try {
      current = await fetchJobMaterialPreparation(jobId);
    } catch {
      throw error;
    }
    pendingActions.delete(slot);
    // A 409 is another action or a conflicting replay. The same action key returns 200.
    throw new MaterialDecisionConflictError(current);
  }
}
