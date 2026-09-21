import type { Hono } from "hono";
import { getProductSystem, type ApiEnv } from "../cloud/context.js";
import { presentPlanningWorkload } from "./service.js";

export function registerPlanningRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/planning/workload", (c) => {
    const runtime = getProductSystem(c);
    return c.json({ workload: presentPlanningWorkload(runtime, c) });
  });
}
