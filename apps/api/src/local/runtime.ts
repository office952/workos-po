import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createProductSystemRuntime, type ProductSystemRuntime } from "../productSystem/runtime.js";
import { LocalRuntimeError } from "./errors.js";
import { assertLocalLoopbackHost } from "./host.js";
import { acquireLocalRuntimeLease, releaseLocalRuntimeLease, type LocalRuntimeLease } from "./lease.js";
import { ensureLocalProfile, type LocalProfile } from "./profile.js";

export function resolveLocalStaticRoot(env: NodeJS.ProcessEnv): string {
  const configured = env.WORKOS_STATIC_ROOT?.trim();
  if (configured) {
    const root = resolve(configured);
    if (!existsSync(join(root, "index.html"))) {
      throw new LocalRuntimeError("local_static_missing");
    }
    return root;
  }
  const fallback = resolve(process.cwd(), "dist");
  if (!existsSync(join(fallback, "index.html"))) {
    throw new LocalRuntimeError("local_static_missing");
  }
  return fallback;
}

export type OpenLocalRuntime = {
  profile: LocalProfile;
  productSystem: ProductSystemRuntime;
  lease: LocalRuntimeLease;
  staticRoot: string;
  close: () => void;
};

export function openLocalProductRuntime(env: NodeJS.ProcessEnv = process.env): OpenLocalRuntime {
  assertLocalLoopbackHost(env);
  const staticRoot = resolveLocalStaticRoot(env);
  const profile = ensureLocalProfile(env);
  const lease = acquireLocalRuntimeLease(profile.root, "api");
  let productSystem;
  try {
    productSystem = createProductSystemRuntime(profile.sqlitePath, {
      documentsRoot: profile.documentsRoot,
    });
  } catch (error) {
    releaseLocalRuntimeLease(profile.root, lease);
    throw error;
  }

  let released = false;
  return {
    profile,
    productSystem,
    lease,
    staticRoot,
    close: () => {
      if (released) {
        return;
      }
      released = true;
      productSystem.close();
      releaseLocalRuntimeLease(profile.root, lease);
    },
  };
}
