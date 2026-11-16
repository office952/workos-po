import {
  SELLER_FIELDS,
  checkFiscalId,
  fiscalIdCheckLabel,
  sellerCompleteness,
  sellerFieldLabel,
  type SellerProfile,
  type SellerProfileInput,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { can, getProductSystem, type ApiEnv } from "../cloud/context.js";
import { requireCapability } from "../cloud/middleware.js";
import { actorIdentity } from "../commercial/offeringAccess.js";

/**
 * Commercial & Financial V1 · company identity (seller profile).
 * Read: any role with client prices (documents show it). Write: Owner (`org.settings.manage`),
 * validated, versioned and protected against concurrent edits with `expectedVersion`.
 */
function presentSeller(profile: SellerProfile | null) {
  const completeness = sellerCompleteness(profile);
  return {
    seller: profile,
    configured: profile !== null,
    completeness: {
      ...completeness,
      missingRequiredLabels: completeness.missingRequired.map(sellerFieldLabel),
    },
    fiscalIdCheck: profile ? fiscalIdCheckLabel(checkFiscalId(profile.fiscalId)) : null,
  };
}

export function registerSellerRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/seller", (c) => {
    const runtime = getProductSystem(c);
    const seller = runtime.getSellerProfile();
    return c.json({
      ...presentSeller(seller),
      version: runtime.readSellerProfileVersion(),
      canEdit: can(c, "org.settings.manage"),
      fields: SELLER_FIELDS.map((field) => ({ field, label: sellerFieldLabel(field) })),
    });
  });

  app.get("/api/seller/versions", requireCapability("org.settings.manage"), (c) => {
    const runtime = getProductSystem(c);
    return c.json({
      currentVersion: runtime.readSellerProfileVersion(),
      versions: runtime.listSellerProfileVersions().map((version) => ({
        version: version.version,
        values: version.values,
        changedFields: version.changedFields.map((field) => ({ field, label: sellerFieldLabel(field) })),
        createdAt: version.createdAt,
        createdByLabel: version.createdByLabel,
      })),
    });
  });

  app.patch("/api/seller", requireCapability("org.settings.manage"), async (c) => {
    const runtime = getProductSystem(c);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const input = readSellerInput(body);
    if (!input) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const expectedVersion = typeof body?.expectedVersion === "number" ? body.expectedVersion : null;
    const actor = actorIdentity(c);
    const result = runtime.saveSellerProfile(input, { userId: actor.userId, label: actor.label }, expectedVersion);
    if (!result.ok) {
      if (result.error === "version_conflict") {
        return c.json(
          {
            error: "version_conflict",
            currentVersion: result.currentVersion,
            reasons: ["Datele firmei au fost modificate între timp. Reîncarcă pagina înainte de a salva."],
          },
          409,
        );
      }
      return c.json(
        {
          error: "invalid_profile",
          issues: result.issues.map((issue) => ({ ...issue, label: sellerFieldLabel(issue.field) })),
          reasons: result.issues.map((issue) => `${sellerFieldLabel(issue.field)}: ${issue.reason}`),
        },
        400,
      );
    }
    return c.json({
      alreadyApplied: result.alreadyApplied,
      version: result.version,
      warnings: result.warnings.map((issue) => ({ ...issue, label: sellerFieldLabel(issue.field) })),
      ...presentSeller(result.profile),
    });
  });
}

function readSellerInput(body: unknown): SellerProfileInput | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const payload = body as Record<string, unknown>;
  const legalName = payload.legalName;
  if (typeof legalName !== "string") {
    return null;
  }
  return {
    legalName,
    brand: readOptionalString(payload.brand),
    fiscalId: readOptionalString(payload.fiscalId),
    tradeRegister: readOptionalString(payload.tradeRegister),
    address: readOptionalString(payload.address),
    locality: readOptionalString(payload.locality),
    iban: readOptionalString(payload.iban),
    bank: readOptionalString(payload.bank),
  };
}

function readOptionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
