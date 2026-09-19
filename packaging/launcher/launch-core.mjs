import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { LOCAL_BIND_HOST } from "../paths.mjs";
import { operatorMessage } from "./messages.mjs";

export const HEALTH_SERVICE_NAME = "workos-final-api";

export function localUrl(port) {
  return `http://${LOCAL_BIND_HOST}:${port}`;
}

export function readLeasePid(dataRoot) {
  const leasePath = join(dataRoot, "ops", "runtime-lease.json");
  if (!existsSync(leasePath)) {
    return null;
  }
  try {
    const lease = JSON.parse(readFileSync(leasePath, "utf8"));
    if (typeof lease.pid === "number" && Number.isInteger(lease.pid) && lease.pid > 0) {
      return lease.pid;
    }
    return null;
  } catch {
    return null;
  }
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "";
    if (code === "ESRCH") {
      return false;
    }
    return code === "EPERM";
  }
}

export async function readJson(url, timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.json();
    return { ok: response.ok, status: response.status, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function inspectLocalEndpoint(port) {
  const health = await readJson(`${localUrl(port)}/api/health`);
  if (!health) {
    return { kind: "empty" };
  }
  if (health.body?.service === HEALTH_SERVICE_NAME && health.body?.status === "ok") {
    const ready = await readJson(`${localUrl(port)}/api/ready`);
    return {
      kind: "workos",
      ready: ready?.ok === true && ready.body?.status === "ready",
    };
  }
  return { kind: "foreign" };
}

export async function waitForReady(port, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await inspectLocalEndpoint(port);
    if (state.kind === "workos" && state.ready) {
      return true;
    }
    if (state.kind === "foreign") {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

export function buildRuntimeEnv(input) {
  const env = { ...input.env };
  delete env.VITEST;
  delete env.WORKOS_SQLITE_PATH;
  delete env.WORKOS_CLOUD_ROOT;
  delete env.WORKOS_TRUSTED_ORIGINS;
  delete env.NODE_OPTIONS;
  env.HOST = LOCAL_BIND_HOST;
  env.PORT = String(input.port);
  env.NODE_ENV = "production";
  env.WORKOS_PUBLIC_ORIGIN = localUrl(input.port);
  env.WORKOS_CLOUD_ROOT = "";
  env.WORKOS_TRUSTED_ORIGINS = "";
  env.WORKOS_LOCAL_ROOT = input.dataRoot;
  env.WORKOS_STATIC_ROOT = input.staticRoot;
  env.WORKOS_PRODUCT_VERSION = input.version;
  env.WORKOS_DATA_DIR = join(input.dataRoot, "data");
  env.PATH = input.strippedPath ?? env.PATH;
  return env;
}

export function spawnDetachedRuntime(input) {
  mkdirSync(dirname(input.logPath), { recursive: true });
  const child = spawn(input.nodePath, [input.entryPath], {
    cwd: input.cwd,
    env: buildRuntimeEnv(input),
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true,
  });
  child.unref();
  return child;
}

export async function stopRuntime(dataRoot) {
  const pid = readLeasePid(dataRoot);
  if (!pid || !isAlive(pid)) {
    return { stopped: false, code: "not_running", message: operatorMessage("not_running") };
  }
  try {
    process.kill(pid);
  } catch {
    return { stopped: false, code: "generic_failure", message: operatorMessage("generic_failure") };
  }
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) {
      return { stopped: true, code: "stopped", message: operatorMessage("stopped") };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return { stopped: !isAlive(pid), code: "stopped", message: operatorMessage("stopped") };
}

export { isAlive, operatorMessage };
