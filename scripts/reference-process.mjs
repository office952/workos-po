import { REFERENCE_PORT } from "./reference-root.mjs";

export const REFERENCE_PROCESS_MARKER = "--workos-reference-runtime";

export const REFERENCE_LAUNCH_PNPM_ARGS = [
  "--filter",
  "@workos-final/api",
  "start",
  "--",
  REFERENCE_PROCESS_MARKER,
];

export function recordedAllowsStop(recorded, commandLine) {
  if (!recorded || !Number.isInteger(recorded.pid) || recorded.pid <= 0) {
    return { ok: false, reason: "no_recorded_pid" };
  }
  if (recorded.classification !== "SYNTHETIC_REFERENCE") {
    return { ok: false, reason: "classification" };
  }
  if (Number(recorded.port) !== REFERENCE_PORT) {
    return { ok: false, reason: "port" };
  }
  if (typeof commandLine !== "string" || commandLine.trim() === "") {
    return { ok: false, reason: "command_unreadable" };
  }
  if (!commandLine.includes(REFERENCE_PROCESS_MARKER)) {
    return { ok: false, reason: "marker_absent" };
  }
  return { ok: true };
}

export function isPositivelyIdentifiedReferenceProcess(pid, recorded, commandLine) {
  if (!recorded || recorded.pid !== pid) {
    return false;
  }
  return recordedAllowsStop(recorded, commandLine).ok;
}
