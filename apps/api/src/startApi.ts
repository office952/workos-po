import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { openProvisionedControlPlane } from "./cloud/provision.js";
import { isCloudRootConfigured, resolveCloudRoot } from "./cloud/paths.js";
import { createRuntimeRegistry } from "./cloud/runtimeRegistry.js";
import { opsLog } from "./ops/log.js";
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
  const port = Number(env.PORT ?? 8787);
  const hostname = env.HOST ?? "127.0.0.1";
  const installSignals = options.installSignals ?? true;

  return new Promise((resolve, reject) => {
    let settled = false;
    const settleError = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    if (isCloudRootConfigured(env)) {
      const cloudRoot = resolveCloudRoot(env);
      let controlPlane;
      try {
        controlPlane = openProvisionedControlPlane(cloudRoot);
      } catch (error) {
        opsLog("error", "control_plane_open_failed", { code: "open_failed" });
        settleError(error);
        return;
      }
      const registry = createRuntimeRegistry();
      const server = serve(
        {
          fetch: createApp({
            cloud: { controlPlane, registry },
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
            registry.closeAll();
            controlPlane.close();
          };
          if (installSignals) {
            installProcessShutdown(server, closeResources);
          }
          opsLog("info", "api_startup", { mode: "cloud", port: info.port });
          console.log(`workos-final-api listening on http://${info.address}:${info.port}`);
          resolve({
            hostname: String(info.address),
            port: info.port,
            close: () => shutdownApi(server, closeResources),
          });
        },
      );
      server.once("error", settleError);
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
        resolve({
          hostname: String(info.address),
          port: info.port,
          close: () => shutdownApi(server, closeResources),
        });
      },
    );
    server.once("error", settleError);
  });
}
