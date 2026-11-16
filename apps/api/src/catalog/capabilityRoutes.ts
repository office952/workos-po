import { projectCatalogCapabilities } from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, type ApiEnv, can } from "../cloud/context.js";

export function registerCatalogCapabilityRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/catalog/capabilities", (c) => {
    const runtime = getProductSystem(c);
    return c.json(
      projectCatalogCapabilities({
        enablement: runtime.resolveProductEnablement(),
        technicalSettings: runtime.resolveTechnicalSettings(),
        formulas: runtime.resolveFormulas(),
        labels: runtime.labels(),
        canEditOrganizationConfiguration: can(c, "org.settings.manage"),
      }),
    );
  });
}
