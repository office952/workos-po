export type OpsLogLevel = "info" | "error";

export const OPS_EVENTS = [
  "api_startup",
  "api_shutdown",
  "control_plane_open_failed",
  "migration_failed",
  "plane_identity_failed",
  "backup_succeeded",
  "backup_failed",
  "restore_validated",
  "restore_failed",
] as const;

export type OpsEvent = (typeof OPS_EVENTS)[number];

export type OpsLogFields = {
  code?: string;
  mode?: "cloud" | "single_plane" | "local";
  port?: number;
  organizationCount?: number;
  planeCount?: number;
  organizationId?: string;
  planeId?: string;
};

const FORBIDDEN_FIELD = /password|token|pin|salt|secret|path|email|payload/i;

export function opsLog(
  level: OpsLogLevel,
  event: OpsEvent,
  fields: OpsLogFields = {},
): void {
  const safe: Record<string, string | number> = { event };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || FORBIDDEN_FIELD.test(key)) {
      continue;
    }
    safe[key] = value;
  }
  const line = JSON.stringify(safe);
  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
}
