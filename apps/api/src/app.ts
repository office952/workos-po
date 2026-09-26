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
import { registerMaterialReadinessRoutes } from "./execution/materialReadinessRoutes.js";
import { registerInventoryRoutes } from "./inventory/routes.js";
import { registerJobRoutes } from "./jobs/routes.js";
import { registerQuoteRoutes } from "./quotes/routes.js";
import { registerRequestRoutes } from "./requests/routes.js";
import { registerCustomerRoutes } from "./customers/routes.js";
import { registerOperationalServiceRoutes } from "./operationalServices/routes.js";
import { registerSellerRoutes } from "./seller/routes.js";
import { registerPeopleRoutes } from "./people/routes.js";
import { registerWorkcenterRoutes } from "./workcenters/routes.js";
import { assertDevOperatorConfigSafe } from "./operator/devMode.js";
import { registerOperatorRoutes } from "./operator/routes.js";
import {
  API_CONTRACT_ID,
  HEALTH_SERVICE_NAME,
  type HealthResponse,
} from "./ops/contract.js";
import {
  assertProductionCloudPublicOrigin,
  mutatingOriginAllowed,
  PRODUCTION_HSTS_VALUE,
  shouldSendHsts,
} from "./ops/origin.js";
import { evaluateReadiness } from "./ops/readiness.js";
import { registerStaticSite } from "./ops/staticSite.js";
import { registerCommercialPolicyRoutes } from "./commercial/routes.js";
import { registerFormulaRoutes } from "./product/formulaRoutes.js";
import { registerTechnicalSettingRoutes } from "./product/technicalSettingRoutes.js";
import { registerProductEnablementRoutes } from "./product/productEnablementRoutes.js";
import { registerPlanningRoutes } from "./planning/routes.js";
import { registerAssemblyRoutes } from "./assembly/routes.js";
import { registerProductRoutes } from "./product.js";
import { registerProductSystemAdminRoutes } from "./productSystem/routes.js";
import {
  createProductSystemRuntime,
  type ProductSystemRuntime,
} from "./productSystem/runtime.js";
import { registerSystemProjectionRoutes } from "./system.js";

export { API_CONTRACT_ID, HEALTH_SERVICE_NAME, type HealthResponse };

const DEV_WEB_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5178",
  "http://127.0.0.1:5185",
  "http://127.0.0.1:5187",
  "http://127.0.0.1:5191",
] as const;

export type CreateAppOptions = {
  productSystem?: ProductSystemRuntime;
  /** Test override for DEV operator fail-fast / enablement. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  cloud?: {
    controlPlane: ControlPlane;
    registry?: RuntimeRegistry;
  };
  staticRoot?: string;
};

export function createApp(options: CreateAppOptions = {}): Hono<ApiEnv> {
  const env = options.env ?? process.env;
  assertDevOperatorConfigSafe(env);

  if (options.cloud && options.productSystem) {
    throw new Error("createApp cannot take both productSystem and cloud");
  }
  if (options.cloud && env.NODE_ENV === "production") {
    assertProductionCloudPublicOrigin(env);
  }

  const app = new Hono<ApiEnv>();

  app.use("*", async (c, next) => {
    await next();
    const proto = (c.req.header("x-forwarded-proto") ?? "").split(",")[0]?.trim();
    if (shouldSendHsts(env, proto)) {
      c.res.headers.set("Strict-Transport-Security", PRODUCTION_HSTS_VALUE);
    }
  });

  app.use("/api/*", async (c, next) => {
    if (
      !mutatingOriginAllowed(env, c.req.method, c.req.header("origin"), {
        cloud: Boolean(options.cloud),
      })
    ) {
      return c.json({ error: "origin_forbidden" }, 403);
    }
    await next();
  });

  if (env.NODE_ENV !== "production") {
    app.use(
      "/api/*",
      cors({
        origin: [...DEV_WEB_ORIGINS],
        credentials: true,
      }),
    );
  }

  const singlePlaneRuntime = options.cloud
    ? undefined
    : (options.productSystem ?? createProductSystemRuntime());

  if (options.cloud) {
    const registry = options.cloud.registry ?? createRuntimeRegistry();
    app.use("/api/*", attachCloudHost(options.cloud.controlPlane, registry, env));
    app.use("/api/*", requireCloudSession());
  } else if (singlePlaneRuntime) {
    app.use("/api/*", attachSinglePlaneRuntime(singlePlaneRuntime, env));
  }

  app.get("/api/health", (c) => {
    const body: HealthResponse = {
      status: "ok",
      service: HEALTH_SERVICE_NAME,
      apiContractId: API_CONTRACT_ID,
    };
    return c.json(body);
  });

  app.get("/api/ready", (c) => {
    const body = evaluateReadiness({
      mode: options.cloud ? "cloud" : "single_plane",
      cloudRoot: options.cloud?.controlPlane.cloudRoot,
      controlPlane: options.cloud?.controlPlane,
      productSystem: singlePlaneRuntime ?? c.get("productSystem"),
    });
    return c.json(body, body.status === "ready" ? 200 : 503);
  });

  registerCloudRoutes(app);
  registerProductRoutes(app);
  registerCommercialPolicyRoutes(app);
  registerTechnicalSettingRoutes(app);
  registerProductEnablementRoutes(app);
  registerFormulaRoutes(app);
  registerJobRoutes(app);
  registerPlanningRoutes(app);
  registerAssemblyRoutes(app);
  registerQuoteRoutes(app);
  registerRequestRoutes(app);
  registerPeopleRoutes(app);
  registerWorkcenterRoutes(app);
  registerOperatorRoutes(app);
  registerCustomerRoutes(app);
  registerSellerRoutes(app);
  registerOperationalServiceRoutes(app);
  registerMaterialReadinessRoutes(app);
  registerInventoryRoutes(app);
  registerSystemProjectionRoutes(app);
  registerProductSystemAdminRoutes(app);

  if (options.staticRoot) {
    registerStaticSite(app, options.staticRoot);
  }

  return app;
}
