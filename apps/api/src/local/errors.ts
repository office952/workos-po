export const LOCAL_RUNTIME_FAULTS = [
  "local_cloud_conflict",
  "local_root_missing",
  "local_root_invalid",
  "local_root_inside_source",
  "local_root_is_file",
  "local_root_looks_like_cloud",
  "local_static_missing",
  "local_runtime_active",
  "local_runtime_lease_indeterminate",
  "local_runtime_lease_invalid",
  "local_profile_invalid",
  "local_backup_failed",
] as const;

export type LocalRuntimeFaultCode = (typeof LOCAL_RUNTIME_FAULTS)[number];

export class LocalRuntimeError extends Error {
  readonly code: LocalRuntimeFaultCode;

  constructor(code: LocalRuntimeFaultCode) {
    super(code);
    this.name = "LocalRuntimeError";
    this.code = code;
  }
}
