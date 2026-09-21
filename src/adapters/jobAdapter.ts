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
    productCode: row.productCode,
    productLabel: asString(row.productLabel) ?? row.productCode,
    inscription: asString(row.inscription) ?? "",
    customerDisplayName: asString(row.customerDisplayName),
    stage: asString(row.stage) ?? "",
    stageLabel: asString(row.stageLabel) ?? "—",
    nextAction: asString(row.nextAction) ?? "",
    nextActionLabel: asString(row.nextActionLabel) ?? "",
    needsAttention: asBoolean(row.needsAttention) ?? false,
    attentionLabel: asString(row.attentionLabel),
    progressLabel: asString(row.progressLabel),
    createdAt: asString(row.createdAt),
    releaseSnapshotId: asString(row.releaseSnapshotId),
    planId: asString(row.planId),
    orderSnapshotId: asString(row.orderSnapshotId) ?? row.jobId,
  };
}

export function presentJobDetail(payload: unknown): {
  job: JobListItemTransport;
  quoteSnapshotId: string | null;
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
    requestId: asString(request?.requestId),
    releaseSnapshotId: asString(release?.releaseSnapshotId) ?? job.releaseSnapshotId,
    planId: asString(execution?.planId) ?? job.planId,
  };
}
