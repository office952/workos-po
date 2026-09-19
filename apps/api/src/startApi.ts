import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { openProvisionedControlPlane } from "./cloud/provision.js";
import { isCloudRootConfigured, resolveCloudRoot } from "./cloud/paths.js";
import { createRuntimeRegistry } from "./cloud/runtimeRegistry.js";
import { LocalRuntimeError } from "./local/errors.js";
import { assertLocalLoopbackHost } from "./local/host.js";
import { DEFAULT_LOCAL_PORT, isLocalRootConfigured } from "./local/paths.js";
import { openLocalProductRuntime } from "./local/runtime.js";
import { opsLog } from "./ops/log.js";
import { assertProductionCloudPublicOrigin } from "./ops/origin.js";
import {
  acquireCloudRuntimeLease,
  releaseCloudRuntimeLease,
  type CloudRuntimeLease,
} from "./ops/runtimeLease.js";
import { resolveProductSystemSqlitePath } from "./persistence/sqlite.js";
import { createProductSystemRuntime } from "./productSystem/runtime.js";
import { installProcessShutdown, shutdownApi } from "./serverLifecycle.js";

function resolveStaticRoot(env: NodeJS.ProcessEnv): string | undefined {
  const configured = env.WORKOS_STATIC_ROOT?.trim();
  if (configured) {
    return configured;
  }
  if (env.NODE_ENV === "production") {
    const fallback = resolve(process.cwd(), "dist");
    if (existsSync(fallback)) {
      return fallback;
    }
  }
  return undefined;
}

export type StartedWorkosApi = {
  hostname: string;
  port: number;
  close: () => Promise<void>;
};

export function startWorkosApi(
  env: NodeJS.ProcessEnv = process.env,
  options: { installSignals?: boolean } = {},
): Promise<StartedWorkosApi> {
  const localConfigured = isLocalRootConfigured(env);
  const port = Number(env.PORT ?? (localConfigured ? DEFAULT_LOCAL_PORT : 8787));
  const hostname = env.HOST ?? "127.0.0.1";
  const installSignals = options.installSignals ?? true;

  return new Promise((resolveStart, reject) => {
    let settled = false;
    const settleError = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    if (localConfigured && isCloudRootConfigured(env)) {
      settleError(new LocalRuntimeError("local_cloud_conflict"));
      return;
    }

    if (localConfigured) {
      let localHost: string;
      try {
        localHost = assertLocalLoopbackHost(env);
      } catch (error) {
        settleError(error);
        return;
      }

      let opened;
      try {
        opened = openLocalProductRuntime(env);
      } catch (error) {
        settleError(error);
        return;
      }

      const { productSystem, staticRoot, close: closeLocal } = opened;
      const server = serve(
        {
          fetch: createApp({
            productSystem,
            env,
            staticRoot,
          }).fetch,
          hostname: localHost,
          port,
        },
        (info) => {
          if (settled) {
            closeLocal();
            return;
          }
          settled = true;
          if (installSignals) {
            installProcessShutdown(server, closeLocal);
          }
          opsLog("info", "api_startup", { mode: "local", port: info.port });
          console.log(`workos-final-api listening on http://${info.address}:${info.port}`);
          resolveStart({
            hostname: String(info.address),
            port: info.port,
            close: () => shutdownApi(server, closeLocal),
          });
        },
      );
      server.once("error", (error) => {
        closeLocal();
        settleError(error);
      });
      return;
    }

    if (isCloudRootConfigured(env)) {
      const cloudRoot = resolveCloudRoot(env);
      if (env.NODE_ENV === "production") {
        try {
          assertProductionCloudPublicOrigin(env);
        } catch (error) {
          settleError(error);
          return;
        }
      }

      let lease: CloudRuntimeLease;
      try {
        lease = acquireCloudRuntimeLease(cloudRoot, "api");
      } catch (error) {
        settleError(error);
        return;
      }

      let controlPlane;
      try {
        controlPlane = openProvisionedControlPlane(cloudRoot);
      } catch (error) {
        releaseCloudRuntimeLease(cloudRoot, lease);
        opsLog("error", "control_plane_open_failed", { code: "open_failed" });
        settleError(error);
        return;
      }

      const registry = createRuntimeRegistry();
      let released = false;
      const closeResources = () => {
        if (released) {
          return;
        }
        released = true;
        registry.closeAll();
        controlPlane.close();
        releaseCloudRuntimeLease(cloudRoot, lease);
      };

      let app;
      try {
        app = createApp({
          cloud: { controlPlane, registry },
          env,
          staticRoot: resolveStaticRoot(env),
        });
      } catch (error) {
        closeResources();
        settleError(error);
        return;
      }

      const server = serve(
        {
          fetch: app.fetch,
          hostname,
          port,
        },
        (info) => {
          if (settled) {
            closeResources();
            return;
          }
          settled = true;
          if (installSignals) {
            installProcessShutdown(server, closeResources);
          }
          opsLog("info", "api_startup", { mode: "cloud", port: info.port });
          console.log(`workos-final-api listening on http://${info.address}:${info.port}`);
          resolveStart({
            hostname: String(info.address),
            port: info.port,
            close: () => shutdownApi(server, closeResources),
          });
        },
      );
      server.once("error", (error) => {
        closeResources();
        settleError(error);
      });
      return;
    }

    const sqlitePath = env.WORKOS_SQLITE_PATH?.trim() || resolveProductSystemSqlitePath();
    const productSystem = createProductSystemRuntime(sqlitePath);
    const server = serve(
      {
        fetch: createApp({
          productSystem,
          env,
          staticRoot: resolveStaticRoot(env),
        }).fetch,
        hostname,
        port,
      },
      (info) => {
        if (settled) {
          return;
        }
        settled = true;
        const closeResources = () => {
          productSystem.close();
        };
        if (installSignals) {
          installProcessShutdown(server, closeResources);
        }
        opsLog("info", "api_startup", { mode: "single_plane", port: info.port });
        console.log(`workos-final-api listening on http://${info.address}:${info.port}`);
        resolveStart({
          hostname: String(info.address),
          port: info.port,
          close: () => shutdownApi(server, closeResources),
        });
      },
    );
    server.once("error", settleError);
  });
}
