import { LocalRuntimeError } from "./errors.js";

export const LOCAL_LOOPBACK_HOST = "127.0.0.1";

export function assertLocalLoopbackHost(env: NodeJS.ProcessEnv = process.env): typeof LOCAL_LOOPBACK_HOST {
  const raw = env.HOST;
  const host = raw === undefined || raw.trim() === "" ? LOCAL_LOOPBACK_HOST : raw.trim();
  if (host !== LOCAL_LOOPBACK_HOST) {
    throw new LocalRuntimeError("local_host_not_loopback");
  }
  return LOCAL_LOOPBACK_HOST;
}
