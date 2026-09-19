import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const CLOUD_RUNTIME_LEASE_VERSION = 1 as const;
export const CLOUD_LEASE_PURPOSES = ["api", "backup"] as const;
export type CloudLeasePurpose = (typeof CLOUD_LEASE_PURPOSES)[number];

export type CloudRuntimeLease = {
  version: typeof CLOUD_RUNTIME_LEASE_VERSION;
  leaseId: string;
  pid: number;
  startedAt: string;
  purpose: CloudLeasePurpose;
};

export type CloudRuntimeLeaseFaultCode =
  | "cloud_runtime_active"
  | "cloud_runtime_lease_indeterminate"
  | "cloud_runtime_lease_invalid";

export class CloudRuntimeLeaseError extends Error {
  readonly code: CloudRuntimeLeaseFaultCode;

  constructor(code: CloudRuntimeLeaseFaultCode) {
    super(code);
    this.name = "CloudRuntimeLeaseError";
    this.code = code;
  }
}

export type ProcessLiveness = "alive" | "dead" | "indeterminate";

export function cloudRuntimeLeasePath(cloudRoot: string): string {
  return join(resolve(cloudRoot), "ops", "runtime-lease.json");
}

export function inspectProcessLiveness(pid: number): ProcessLiveness {
  if (!Number.isInteger(pid) || pid <= 0) {
    return "indeterminate";
  }
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") {
      return "dead";
    }
    if (code === "EPERM") {
      return "alive";
    }
    return "indeterminate";
  }
}

function parsePurpose(value: unknown): CloudLeasePurpose {
  if (value === "api" || value === "backup") {
    return value;
  }
  throw new CloudRuntimeLeaseError("cloud_runtime_lease_invalid");
}

function parseLease(raw: unknown): CloudRuntimeLease {
  if (!raw || typeof raw !== "object") {
    throw new CloudRuntimeLeaseError("cloud_runtime_lease_invalid");
  }
  const record = raw as Record<string, unknown>;
  if (record.version !== CLOUD_RUNTIME_LEASE_VERSION) {
    throw new CloudRuntimeLeaseError("cloud_runtime_lease_invalid");
  }
  if (typeof record.leaseId !== "string" || record.leaseId.length < 8) {
    throw new CloudRuntimeLeaseError("cloud_runtime_lease_invalid");
  }
  if (typeof record.pid !== "number" || !Number.isInteger(record.pid)) {
    throw new CloudRuntimeLeaseError("cloud_runtime_lease_invalid");
  }
  if (typeof record.startedAt !== "string" || record.startedAt.length === 0) {
    throw new CloudRuntimeLeaseError("cloud_runtime_lease_invalid");
  }
  return {
    version: CLOUD_RUNTIME_LEASE_VERSION,
    leaseId: record.leaseId,
    pid: record.pid,
    startedAt: record.startedAt,
    purpose: parsePurpose(record.purpose),
  };
}

export function readCloudRuntimeLeaseFile(cloudRoot: string): CloudRuntimeLease | null {
  const filePath = cloudRuntimeLeasePath(cloudRoot);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return parseLease(JSON.parse(readFileSync(filePath, "utf8")));
  } catch (error) {
    if (error instanceof CloudRuntimeLeaseError) {
      throw error;
    }
    throw new CloudRuntimeLeaseError("cloud_runtime_lease_invalid");
  }
}

function removeLeaseFile(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw new CloudRuntimeLeaseError("cloud_runtime_lease_indeterminate");
  }
}

function refuseExistingLease(existing: CloudRuntimeLease): void {
  const liveness = inspectProcessLiveness(existing.pid);
  switch (liveness) {
    case "alive":
      throw new CloudRuntimeLeaseError("cloud_runtime_active");
    case "dead":
      return;
    case "indeterminate":
      throw new CloudRuntimeLeaseError("cloud_runtime_lease_indeterminate");
    default: {
      const exhaustive: never = liveness;
      throw new CloudRuntimeLeaseError(exhaustive);
    }
  }
}

export function acquireCloudRuntimeLease(
  cloudRoot: string,
  purpose: CloudLeasePurpose,
): CloudRuntimeLease {
  const filePath = cloudRuntimeLeasePath(cloudRoot);
  mkdirSync(dirname(filePath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (existsSync(filePath)) {
      const existing = readCloudRuntimeLeaseFile(cloudRoot);
      if (!existing) {
        throw new CloudRuntimeLeaseError("cloud_runtime_lease_indeterminate");
      }
      refuseExistingLease(existing);
      removeLeaseFile(filePath);
    }

    const lease: CloudRuntimeLease = {
      version: CLOUD_RUNTIME_LEASE_VERSION,
      leaseId: randomBytes(16).toString("hex"),
      pid: process.pid,
      startedAt: new Date().toISOString(),
      purpose,
    };
    try {
      writeFileSync(filePath, `${JSON.stringify(lease)}\n`, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        continue;
      }
      throw new CloudRuntimeLeaseError("cloud_runtime_lease_indeterminate");
    }

    const written = readCloudRuntimeLeaseFile(cloudRoot);
    if (
      !written ||
      written.leaseId !== lease.leaseId ||
      written.pid !== process.pid ||
      written.purpose !== purpose
    ) {
      throw new CloudRuntimeLeaseError("cloud_runtime_active");
    }
    return lease;
  }

  throw new CloudRuntimeLeaseError("cloud_runtime_active");
}

export function releaseCloudRuntimeLease(
  cloudRoot: string,
  lease: CloudRuntimeLease,
): void {
  const existing = (() => {
    try {
      return readCloudRuntimeLeaseFile(cloudRoot);
    } catch {
      return null;
    }
  })();
  if (!existing) {
    return;
  }
  if (
    existing.leaseId !== lease.leaseId ||
    existing.pid !== process.pid ||
    existing.purpose !== lease.purpose
  ) {
    return;
  }
  removeLeaseFile(cloudRuntimeLeasePath(cloudRoot));
}

export function assertCloudRuntimeQuiesced(cloudRoot: string): void {
  let existing: CloudRuntimeLease | null;
  try {
    existing = readCloudRuntimeLeaseFile(cloudRoot);
  } catch {
    throw new CloudRuntimeLeaseError("cloud_runtime_active");
  }
  if (!existing) {
    return;
  }
  const liveness = inspectProcessLiveness(existing.pid);
  switch (liveness) {
    case "dead":
      return;
    case "alive":
    case "indeterminate":
      throw new CloudRuntimeLeaseError("cloud_runtime_active");
    default: {
      const exhaustive: never = liveness;
      throw new CloudRuntimeLeaseError(exhaustive);
    }
  }
}
