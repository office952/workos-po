import { getJson, patchJson, postJson } from "./http";

export async function fetchJobOverview(): Promise<unknown> {
  return getJson("/api/jobs");
}

export async function fetchJob(jobId: string): Promise<unknown> {
  return getJson(`/api/jobs/${encodeURIComponent(jobId)}`);
}

export async function patchJobPlanning(
  jobId: string,
  patch: { priority?: string; targetDate?: string | null },
): Promise<unknown> {
  return patchJson(`/api/jobs/${encodeURIComponent(jobId)}/planning`, patch);
}

export async function postJobProductionRelease(jobId: string): Promise<unknown> {
  return postJson(`/api/jobs/${encodeURIComponent(jobId)}/production-release`);
}

export async function postJobExecutionPlan(jobId: string): Promise<unknown> {
  return postJson(`/api/jobs/${encodeURIComponent(jobId)}/execution-plan`);
}
