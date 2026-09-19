import { getJson } from "./http";

export async function fetchQuoteOverview(): Promise<unknown> {
  return getJson("/api/quotes");
}
