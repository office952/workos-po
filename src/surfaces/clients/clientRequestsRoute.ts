import { clientHref } from "../../routing/appRoute";

/** The selection of the view, kept in the URL (`?sectiune=cereri&selectie=cereri|oferte&q=…`). */
export type RequestsSelection = "" | "cereri" | "oferte";

export function readRequestsSelection(search: string): RequestsSelection {
  const value = new URLSearchParams(search).get("selectie");
  return value === "cereri" || value === "oferte" ? value : "";
}

/** The address of Cereri și oferte with a selection, a search and optional extra parameters. */
export function clientRequestsHref(customerId: string, selection: RequestsSelection = "", q = "", extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  if (selection) params.set("selectie", selection);
  if (q) params.set("q", q);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return `${clientHref(customerId, "cereri")}${query ? `&${query}` : ""}`;
}
