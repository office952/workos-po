export const HEALTH_SERVICE_NAME: "workos-final-api";

export function localUrl(port: number): string;
export function readLeasePid(dataRoot: string): number | null;
export function isAlive(pid: number): boolean;
export function readJson(
  url: string,
  timeoutMs?: number,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> } | null>;
export function inspectLocalEndpoint(
  port: number,
): Promise<{ kind: "empty" | "foreign" | "workos"; ready?: boolean }>;
export function waitForReady(port: number, timeoutMs?: number): Promise<boolean>;
export function buildRuntimeEnv(input: {
  env: NodeJS.ProcessEnv;
  port: number;
  dataRoot: string;
  staticRoot: string;
  version: string;
  strippedPath?: string;
}): NodeJS.ProcessEnv;
export function spawnDetachedRuntime(input: {
  nodePath: string;
  entryPath: string;
  cwd: string;
  dataRoot: string;
  staticRoot: string;
  port: number;
  version: string;
  env: NodeJS.ProcessEnv;
  logPath: string;
}): unknown;
export function stopRuntime(
  dataRoot: string,
): Promise<{ stopped: boolean; code: string; message: string }>;
export function operatorMessage(code: string): string;
