import type {
  OrganizationServiceOfferMutationError,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";

export function registerOperationalServiceRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/operational-services", (c) => {
    const runtime = getProductSystem(c);
    return c.json({ services: runtime.readOperationalServicesAdmin() });
  });

  app.patch(
    "/api/operational-services/:capabilityId",
    requireOwnerRole(),
    async (c) => {
      const runtime = getProductSystem(c);
      const body = await c.req.json().catch(() => null);
      const offerMode = readOfferMode(body);
      if (!offerMode) {
        return c.json({ error: "invalid_payload" }, 400);
      }
      const result = runtime.updateOrganizationServiceOffer(
        c.req.param("capabilityId"),
        offerMode,
      );
      if (!result.ok) {
        return c.json({ error: result.error }, offerHttpStatus(result.error));
      }
      return c.json({
        alreadyApplied: result.alreadyApplied,
        record: result.record,
        services: runtime.readOperationalServicesAdmin(),
      });
    },
  );
}

function readOfferMode(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const offerMode = (body as { offerMode?: unknown }).offerMode;
  return typeof offerMode === "string" && offerMode.trim().length > 0
    ? offerMode.trim()
    : null;
}

function offerHttpStatus(error: OrganizationServiceOfferMutationError): 400 {
  switch (error) {
    case "unknown_capability":
    case "capability_reserved":
    case "invalid_offer_mode":
      return 400;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}
