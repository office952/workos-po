import { join } from "node:path";

const PLANE_KEY = /^[a-z0-9]{16,32}$/;

export function assertPlaneKey(planeKey: string): string {
  if (!PLANE_KEY.test(planeKey)) {
    throw new Error("invalid_plane_key");
  }
  return planeKey;
}

export function derivePlanePaths(
  cloudRoot: string,
  planeKey: string,
): { sqlitePath: string; documentsRoot: string; planeRoot: string } {
  const safeKey = assertPlaneKey(planeKey);
  const planeRoot = join(cloudRoot, "organizations", safeKey);
  return {
    planeRoot,
    sqlitePath: join(planeRoot, "product-system.sqlite"),
    documentsRoot: join(planeRoot, "documents"),
  };
}

export function isCloudRootConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.WORKOS_CLOUD_ROOT?.trim());
}

export function resolveCloudRoot(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.WORKOS_CLOUD_ROOT?.trim();
  if (!root) {
    throw new Error("WORKOS_CLOUD_ROOT is required in Cloud mode.");
  }
  if (env.WORKOS_SQLITE_PATH?.trim()) {
    throw new Error("WORKOS_SQLITE_PATH cannot be set together with WORKOS_CLOUD_ROOT.");
  }
  return root;
}
