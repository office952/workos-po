import type { JobListItemTransport } from "../api/types";
import { asBoolean, asRecord, asString } from "./record";

export function presentJobList(payload: unknown): JobListItemTransport[] {
  const record = asRecord(payload);
  const overview = asRecord(record?.overview);
  const jobs = overview?.jobs;
  if (!Array.isArray(jobs)) {
    return [];
  }
  return jobs.flatMap((item) => {
    const presented = presentJobItem(item);
    return presented ? [presented] : [];
  });
}

export function presentJobItem(value: unknown): JobListItemTransport | null {
  const row = asRecord(value);
  if (!row || typeof row.jobId !== "string" || typeof row.productCode !== "string") {
    return null;
  }
  return {
    jobId: row.jobId,
    kind: asString(row.kind) ?? "PRODUCT",
    kindLabel: asString(row.kindLabel) ?? "Produs",
    productCode: row.productCode,
    productLabel: asString(row.productLabel) ?? row.productCode,
    inscription: asString(row.inscription) ?? "",
    memberLabels: stringList(row.memberLabels),
    customerId: asString(row.customerId),
    customerDisplayName: asString(row.customerDisplayName),
    requestId: asString(row.requestId),
    stage: asString(row.stage) ?? "",
    stageLabel: asString(row.stageLabel) ?? "—",
    nextAction: asString(row.nextAction) ?? "",
    nextActionLabel: asString(row.nextActionLabel) ?? "",
    priority: asString(row.priority) ?? "STANDARD",
    priorityLabel: asString(row.priorityLabel) ?? "Standard",
    targetDate: asString(row.targetDate),
    targetDateLabel: asString(row.targetDateLabel) ?? "Fără termen",
    planningEditable: asBoolean(row.planningEditable) ?? asString(row.stage) !== "EXECUTION_COMPLETED",
    overdue: asBoolean(row.overdue) ?? false,
    needsAttention: asBoolean(row.needsAttention) ?? false,
    attentionLabel: asString(row.attentionLabel),
    progressLabel: asString(row.progressLabel),
    createdAt: asString(row.createdAt),
    releaseSnapshotId: asString(row.releaseSnapshotId),
    planId: asString(row.planId),
    orderSnapshotId: asString(row.orderSnapshotId) ?? row.jobId,
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export function presentJobDetail(payload: unknown): {
  job: JobListItemTransport;
  quoteSnapshotId: string | null;
  quoteHref: string | null;
  requestId: string | null;
  releaseSnapshotId: string | null;
  planId: string | null;
} | null {
  const record = asRecord(payload);
  const job = presentJobItem(record?.job);
  if (!job) {
    return null;
  }
  const quote = asRecord(record?.quote);
  const request = asRecord(record?.request);
  const release = asRecord(record?.release);
  const execution = asRecord(record?.execution);
  return {
    job,
    quoteSnapshotId: asString(quote?.quoteSnapshotId),
    quoteHref: asString(quote?.href),
    requestId: asString(request?.requestId),
    releaseSnapshotId: asString(release?.releaseSnapshotId) ?? job.releaseSnapshotId,
    planId: asString(execution?.planId) ?? job.planId,
  };
}
