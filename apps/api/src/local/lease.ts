import {
  acquireCloudRuntimeLease,
  CloudRuntimeLeaseError,
  releaseCloudRuntimeLease,
  type CloudLeasePurpose,
  type CloudRuntimeLease,
} from "../ops/runtimeLease.js";
import { LocalRuntimeError } from "./errors.js";

export type LocalRuntimeLease = CloudRuntimeLease;

function mapLeaseError(error: CloudRuntimeLeaseError): LocalRuntimeError {
  switch (error.code) {
    case "cloud_runtime_active":
      return new LocalRuntimeError("local_runtime_active");
    case "cloud_runtime_lease_indeterminate":
      return new LocalRuntimeError("local_runtime_lease_indeterminate");
    case "cloud_runtime_lease_invalid":
      return new LocalRuntimeError("local_runtime_lease_invalid");
    default: {
      const exhaustive: never = error.code;
      return new LocalRuntimeError(exhaustive);
    }
  }
}

export function acquireLocalRuntimeLease(
  localRoot: string,
  purpose: CloudLeasePurpose,
): LocalRuntimeLease {
  try {
    return acquireCloudRuntimeLease(localRoot, purpose);
  } catch (error) {
    if (error instanceof CloudRuntimeLeaseError) {
      throw mapLeaseError(error);
    }
    throw error;
  }
}

export function releaseLocalRuntimeLease(
  localRoot: string,
  lease: LocalRuntimeLease,
): void {
  releaseCloudRuntimeLease(localRoot, lease);
}
