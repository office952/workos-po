import { getJson, sendJson } from "./http";

export function formulasPath(): string {
  return "/api/admin/formulas";
}

export async function fetchFormulas(): Promise<unknown> {
  return getJson(formulasPath());
}

export async function postFormula(body: {
  formulaId: string;
  expression: unknown;
}): Promise<ReturnType<typeof sendJson>> {
  return sendJson("POST", formulasPath(), body);
}
