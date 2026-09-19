import { isCloudRootConfigured } from "../cloud/paths.js";
import { backupLocalRuntime } from "./backup.js";
import { LocalRuntimeError } from "./errors.js";
import { isLocalRootConfigured } from "./paths.js";

if (isCloudRootConfigured()) {
  console.error("WORKOS_CLOUD_ROOT cannot be set for local backup.");
  process.exit(1);
}

if (!isLocalRootConfigured()) {
  console.error("WORKOS_LOCAL_ROOT is required for local backup.");
  process.exit(1);
}

try {
  const result = await backupLocalRuntime();
  console.log(`local backup written under ${result.backupDir}`);
} catch (error) {
  if (error instanceof LocalRuntimeError) {
    console.error(error.code);
    process.exit(1);
  }
  throw error;
}
