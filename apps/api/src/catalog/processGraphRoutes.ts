import {
  formulasForTypeFromResolved,
  technicalSettingsLookupFromResolved,
  type ComponentTypeId,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, isOwner, type ApiEnv } from "../cloud/context.js";
import { projectCatalogProcessGraphHttp } from "./processGraphProjection.js";

const ALLOWED_QUERY = new Set(["product", "scenario"]);

export function registerCatalogProcessGraphRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/catalog/process-graph", (c) => {
    const query = new URL(c.req.url).searchParams;
    for (const key of query.keys()) {
      if (!ALLOWED_QUERY.has(key)) {
        return c.json({ error: "unsupported_query" }, 400);
      }
    }
    const runtime = getProductSystem(c);
    const formulas = runtime.resolveFormulas();
    if (!formulas.ok) {
      return c.json({ error: "formulas_unavailable", reasons: [formulas.reason] }, 409);
    }
    const technical = runtime.resolveTechnicalSettings();
    if (!technical.ok) {
      return c.json({ error: "technical_settings_unavailable", reasons: [technical.reason] }, 409);
    }
    const result = projectCatalogProcessGraphHttp({
      productCode: query.get("product") ?? "",
      scenarioId: query.get("scenario"),
      evidenceRows: runtime.listActiveCostEvidence(),
      labels: runtime.labels(),
      canViewFinancialAmounts: isOwner(c),
      composition: {
        formulaVersionsForType: (typeId: ComponentTypeId) => formulasForTypeFromResolved(typeId, formulas.formulas),
        technicalSettingsForType: technicalSettingsLookupFromResolved(technical.settings),
      },
    });
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.body);
  });
}
