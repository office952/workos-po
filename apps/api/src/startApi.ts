import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { openProvisionedControlPlane } from "./cloud/provision.js";
import { isCloudRootConfigured, resolveCloudRoot } from "./cloud/paths.js";
import { createRuntimeRegistry } from "./cloud/runtimeRegistry.js";
import { resolveProductSystemSqlitePath } from "./persistence/sqlite.js";
import { createProductSystemRuntime } from "./productSystem/runtime.js";
import { installProcessShutdown, shutdownApi } from "./serverLifecycle.js";

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
      const controlPlane = openProvisionedControlPlane(cloudRoot);
      const registry = createRuntimeRegistry();
      const server = serve(
        {
          fetch: createApp({
            cloud: { controlPlane, registry },
            env,
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
          console.log(
            `workos-final-api listening on http://${info.address}:${info.port}`,
          );
          console.log(`workos cloud root: ${cloudRoot}`);
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
        fetch: createApp({ productSystem, env }).fetch,
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
        console.log(
          `workos-final-api listening on http://${info.address}:${info.port}`,
        );
        console.log(`product-system sqlite: ${productSystem.sqlitePath}`);
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
