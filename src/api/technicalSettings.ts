import { getJson, sendJson } from "./http";

export function technicalSettingsPath(): string {
  return "/api/admin/technical-settings";
}

export async function fetchTechnicalSettings(): Promise<unknown> {
  return getJson(technicalSettingsPath());
}

export async function postTechnicalSettings(body: {
  settings?: ReadonlyArray<{ settingId: string; value: number }>;
  ledPitchMm?: number;
  ledModulePowerW?: number;
  psuReservePercent?: number;
  frameClearanceMm?: number;
}): Promise<ReturnType<typeof sendJson>> {
  return sendJson("POST", technicalSettingsPath(), body);
}
