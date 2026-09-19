import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, parse, resolve, sep } from "node:path";
import { isCloudRootConfigured } from "../cloud/paths.js";
import { LocalRuntimeError } from "./errors.js";

export const DEFAULT_LOCAL_PORT = 8790;
export const LOCAL_PROFILE_VERSION = 1 as const;

export function isLocalRootConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.WORKOS_LOCAL_ROOT?.trim());
}

export function defaultLocalRoot(): string {
  return join(homedir(), "WorkOS", "local");
}

function pathInside(child: string, parent: string): boolean {
  const resolvedChild = resolve(child);
  const resolvedParent = resolve(parent);
  if (process.platform === "win32") {
    const left = resolvedChild.toLowerCase();
    const right = resolvedParent.toLowerCase();
    return left === right || left.startsWith(right + sep);
  }
  return resolvedChild === resolvedParent || resolvedChild.startsWith(resolvedParent + sep);
}

function looksLikeCloudRoot(root: string): boolean {
  return (
    existsSync(join(root, "control", "control-plane.sqlite")) ||
    existsSync(join(root, "organizations"))
  );
}

export function assertSafeLocalRoot(raw: string, env: NodeJS.ProcessEnv = process.env): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new LocalRuntimeError("local_root_missing");
  }
  const resolved = resolve(trimmed);
  const driveRoot = parse(resolved).root;
  if (!resolved || resolved === driveRoot || resolved.length <= driveRoot.length + 1) {
    throw new LocalRuntimeError("local_root_invalid");
  }
  if (existsSync(resolved) && statSync(resolved).isFile()) {
    throw new LocalRuntimeError("local_root_is_file");
  }
  if (looksLikeCloudRoot(resolved)) {
    throw new LocalRuntimeError("local_root_looks_like_cloud");
  }
  if (isCloudRootConfigured(env)) {
    throw new LocalRuntimeError("local_cloud_conflict");
  }
  const allowInRepo = env.WORKOS_ALLOW_IN_REPO_LOCAL === "1";
  if (!allowInRepo && pathInside(resolved, process.cwd())) {
    throw new LocalRuntimeError("local_root_inside_source");
  }
  return resolved;
}

export function resolveLocalRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.WORKOS_LOCAL_ROOT?.trim();
  if (configured) {
    return assertSafeLocalRoot(configured, env);
  }
  if (env.VITEST) {
    throw new LocalRuntimeError("local_root_missing");
  }
  return assertSafeLocalRoot(defaultLocalRoot(), env);
}

export function localLayout(root: string): {
  root: string;
  dataDir: string;
  sqlitePath: string;
  documentsRoot: string;
  backupsRoot: string;
  logsRoot: string;
  configDir: string;
  configPath: string;
} {
  const dataDir = join(root, "data");
  return {
    root,
    dataDir,
    sqlitePath: join(dataDir, "product-system.sqlite"),
    documentsRoot: join(dataDir, "documents"),
    backupsRoot: join(root, "backups"),
    logsRoot: join(root, "logs"),
    configDir: join(root, "config"),
    configPath: join(root, "config", "local-profile.json"),
  };
}
