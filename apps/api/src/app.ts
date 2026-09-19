import { Hono } from "hono";
import { cors } from "hono/cors";
import { registerCloudRoutes } from "./cloud/routes.js";
import type { ApiEnv } from "./cloud/context.js";
import type { ControlPlane } from "./cloud/controlPlane.js";
import {
  attachCloudHost,
  attachSinglePlaneRuntime,
  requireCloudSession,
} from "./cloud/middleware.js";
import {
  createRuntimeRegistry,
  type RuntimeRegistry,
} from "./cloud/runtimeRegistry.js";
import { registerInventoryRoutes } from "./inventory/routes.js";
import { registerJobRoutes } from "./jobs/routes.js";
import { registerQuoteRoutes } from "./quotes/routes.js";
import { registerRequestRoutes } from "./requests/routes.js";
import { registerCustomerRoutes } from "./customers/routes.js";
import { registerOperationalServiceRoutes } from "./operationalServices/routes.js";
import { registerSellerRoutes } from "./seller/routes.js";
import { registerPeopleRoutes } from "./people/routes.js";
import { assertDevOperatorConfigSafe } from "./operator/devMode.js";
import { registerOperatorRoutes } from "./operator/routes.js";
import { registerProductRoutes } from "./product.js";
import { registerProductSystemAdminRoutes } from "./productSystem/routes.js";
import {
  createProductSystemRuntime,
  type ProductSystemRuntime,
} from "./productSystem/runtime.js";
import { registerSystemProjectionRoutes } from "./system.js";

export const HEALTH_SERVICE_NAME = "workos-final-api" as const;
export const API_CONTRACT_ID = "workos-ui-contract-v1" as const;

export type HealthResponse = {
  status: "ok";
  service: typeof HEALTH_SERVICE_NAME;
  apiContractId: typeof API_CONTRACT_ID;
};

const DEV_WEB_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5178",
  "http://127.0.0.1:5185",
  "http://127.0.0.1:5187",
] as const;

export type CreateAppOptions = {
  productSystem?: ProductSystemRuntime;
  /** Test override for DEV operator fail-fast / enablement. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  cloud?: {
    controlPlane: ControlPlane;
    registry?: RuntimeRegistry;
  };
};

export function createApp(options: CreateAppOptions = {}): Hono<ApiEnv> {
  const env = options.env ?? process.env;
  assertDevOperatorConfigSafe(env);

  if (options.cloud && options.productSystem) {
    throw new Error("createApp cannot take both productSystem and cloud");
  }

  const app = new Hono<ApiEnv>();

  if (env.NODE_ENV !== "production") {
    app.use(
      "/api/*",
      cors({
        origin: [...DEV_WEB_ORIGINS],
        credentials: true,
      }),
    );
  }

  if (options.cloud) {
    const registry = options.cloud.registry ?? createRuntimeRegistry();
    app.use("/api/*", attachCloudHost(options.cloud.controlPlane, registry, env));
    app.use("/api/*", requireCloudSession());
  } else {
    const productSystem = options.productSystem ?? createProductSystemRuntime();
    app.use("/api/*", attachSinglePlaneRuntime(productSystem, env));
  }

  app.get("/api/health", (c) => {
    const body: HealthResponse = {
      status: "ok",
      service: HEALTH_SERVICE_NAME,
      apiContractId: API_CONTRACT_ID,
    };
    return c.json(body);
  });

  registerCloudRoutes(app);
  registerProductRoutes(app);
  registerJobRoutes(app);
  registerQuoteRoutes(app);
  registerRequestRoutes(app);
  registerPeopleRoutes(app);
  registerOperatorRoutes(app);
  registerCustomerRoutes(app);
  registerSellerRoutes(app);
  registerOperationalServiceRoutes(app);
  registerInventoryRoutes(app);
  registerSystemProjectionRoutes(app);
  registerProductSystemAdminRoutes(app);

  return app;
}
