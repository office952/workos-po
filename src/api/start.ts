import { getJson } from "./http";

export async function fetchStartOverview(): Promise<unknown> {
  return getJson("/api/start");
}
