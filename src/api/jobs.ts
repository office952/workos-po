import { getJson } from "./http";

export async function fetchJobOverview(): Promise<unknown> {
  return getJson("/api/jobs");
}

export async function fetchJob(jobId: string): Promise<unknown> {
  return getJson(`/api/jobs/${encodeURIComponent(jobId)}`);
}
