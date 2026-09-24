import { randomUUID } from "node:crypto";
import {
  SIGN_ASSEMBLY_ACM_LETTERS_V1,
  SIGN_ASSEMBLY_ACM_SIGNAGE_V2,
  acknowledgeAssemblyReview,
  acceptAssemblyQuote,
  assemblyAvailableForNewWork,
  assemblyV2AvailableForNewWork,
  attachConfirmedChild,
  confirmAssembly,
  createAssemblyDefinition,
  freezeAssemblyQuote,
  freezeProductionInput,
  freezeQuoteSnapshot,
  freezeSiteInstallationQuoteLine,
  frozenTechnicalSettingsFromResolved,
  hashProductAggregate,
  hashProductTruth,
  isAssemblyKind,
  isTemplateEnabledForNewWork,
  materializeAssemblyExecutionPlan,
  presentAssemblyReview,
  productCodeForRole,
  projectAssemblyProduction,
  projectSiteInstallationScope,
  SITE_INSTALLATION_SCOPE_ID,
  siteInstallationEvidenceFromRows,
  siteInstallationFreezeRefusal,
  type AssemblyKind,
  type AssemblyMemberRole,
  type ConfirmedChildProduct,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, isOwner, type ApiEnv } from "../cloud/context.js";
import {
  compileAcceptedProduct,
  resolveProductCommercialForRequest,
} from "../product.js";
import {
  listAssemblyTruths,
  readAssemblyDefinition,
  readAssemblyOrderByQuote,
  readAssemblyProductionByOrder,
  readAssemblyTruth,
  readConfirmedChild,
  readLatestAssemblyQuote,
  saveAssemblyDefinition,
  saveAssemblyOrder,
  saveAssemblyProduction,
  saveAssemblyQuote,
  saveAssemblyTruth,
  saveConfirmedChild,
} from "./store.js";
import { persistAssemblyQuoteRequestLock } from "../requests/store.js";

export function registerAssemblyRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/assemblies/offering", (c) => {
    const runtime = getProductSystem(c);
    const resolution = runtime.resolveProductEnablement();
    const v1 = assemblyAvailableForNewWork(resolution);
    const v2 = assemblyV2AvailableForNewWork(resolution);
    return c.json({
      available: v1,
      label: "Panou ACM + litere volumetrice",
      summary: "Panou ACM și litere volumetrice, confirmate separat și montate împreună.",
      offerings: [
        {
          kind: SIGN_ASSEMBLY_ACM_LETTERS_V1,
          available: v1,
          label: "Panou ACM + litere volumetrice",
          summary: "Panou ACM și litere volumetrice, confirmate separat și montate împreună.",
        },
        {
          kind: SIGN_ASSEMBLY_ACM_SIGNAGE_V2,
          available: v2,
          label: "Panou ACM + logo volumetric",
          summary: "Panou ACM și logo volumetric. Literele pot fi adăugate când sunt oferite.",
        },
      ],
    });
  });

  app.post("/api/assemblies", async (c) => {
    if (!isOwner(c)) {
      return c.json({ error: "forbidden" }, 403);
    }
    const runtime = getProductSystem(c);
    const plane = runtime.assemblyPlane();
    const body = await c.req.json().catch(() => null);
    const requestId = readString(body, "requestId");
    if (!requestId) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const request = runtime.readCommercialRequest(requestId);
    if (!request) {
      return c.json({ error: "not_found" }, 404);
    }
    const resolution = runtime.resolveProductEnablement();
    const kind = readKind(body);
    if (readString(body, "kind") !== null && !kind) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const created = createAssemblyDefinition({
      assemblyId: `asm:${randomUUID()}`,
      organizationId: plane.organizationId,
      requestId,
      customerId: request.customerId,
      resolution,
      createdAt: new Date().toISOString(),
      kind: kind ?? SIGN_ASSEMBLY_ACM_LETTERS_V1,
    });
    if (!created.ok) {
      return c.json({ error: created.error, reasons: created.reasons }, 409);
    }
    saveAssemblyDefinition(plane.db, created.definition);
    return c.json({ assembly: presentCurrent(runtime, created.definition.assemblyId) }, 201);
  });

  app.get("/api/assemblies/:assemblyId", (c) => {
    const runtime = getProductSystem(c);
    const presented = presentCurrent(runtime, c.req.param("assemblyId"));
    if (!presented) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ assembly: presented });
  });

  app.post("/api/assemblies/:assemblyId/members", async (c) => {
    if (!isOwner(c)) {
      return c.json({ error: "forbidden" }, 403);
    }
    const runtime = getProductSystem(c);
    const plane = runtime.assemblyPlane();
    const definition = readAssemblyDefinition(
      plane.db,
      plane.organizationId,
      c.req.param("assemblyId"),
    );
    if (!definition) {
      return c.json({ error: "not_found" }, 404);
    }
    const body = await c.req.json().catch(() => null);
    const role = readRole(body);
    if (!role) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const productCode = productCodeForRole(role);
    const compiled = compileAcceptedProduct(runtime, productCode, body);
    if (!compiled.ok) {
      return c.json(compiled.body, compiled.status);
    }
    const truthHash = hashProductTruth(compiled.truth);
    const productionOptions = {
      costEvidenceRows: compiled.costEvidenceRows,
      technicalSettings: frozenTechnicalSettingsFromResolved(compiled.resolvedTechnicalSettings),
      formulas: compiled.formulaTraces,
    };
    const child: ConfirmedChildProduct = {
      truthId: `pct:${truthHash}`,
      organizationId: plane.organizationId,
      productCode: compiled.truth.templateCode,
      templateCode: compiled.truth.templateCode,
      templateVersion: compiled.truth.templateVersion,
      familyId: compiled.truth.familyId,
      reviewId: compiled.truth.reviewId,
      truthHash,
      aggregateHash: hashProductAggregate(compiled.aggregate),
      confirmedAt: compiled.truth.confirmedAt,
      productLabel: compiled.aggregate.productLabel,
      inscription: compiled.aggregate.inscription,
      childQuoteSnapshotId: null,
      childQuoteContentHash: null,
      commercial: null,
      productionInput: freezeProductionInput(
        compiled.aggregate,
        compiled.composition,
        productionOptions,
      ),
      eicTotal: compiled.eic.total,
      eicCurrency: "EUR",
      eicCompleteness: compiled.eic.completeness,
      truth: compiled.truth,
    };
    const priced = resolveProductCommercialForRequest(
      runtime,
      compiled.eic,
      body,
      isOwner(c),
    );
    if (priced.ok) {
      const frozen = freezeQuoteSnapshot(
        compiled.truth,
        compiled.aggregate,
        compiled.composition,
        compiled.eic,
        priced.commercialPrice,
        {
          createdAt: new Date().toISOString(),
          ...productionOptions,
        },
      );
      if (frozen.ok) {
        child.childQuoteSnapshotId = frozen.snapshot.quoteSnapshotId;
        child.childQuoteContentHash = frozen.snapshot.contentHash;
        child.commercial = frozen.snapshot.commercial;
        child.productionInput = frozen.snapshot.productionInput;
      }
    }
    saveConfirmedChild(plane.db, child);
    const attached = attachConfirmedChild(definition, child, role, new Date().toISOString());
    if (!attached.ok) {
      return c.json({ error: attached.error, reasons: attached.reasons }, 422);
    }
    saveAssemblyDefinition(plane.db, attached.definition);
    return c.json({
      assembly: presentCurrent(runtime, attached.definition.assemblyId),
      productLabel: child.productLabel,
      inscription: child.inscription,
    });
  });

  app.post("/api/assemblies/:assemblyId/review", (c) => {
    if (!isOwner(c)) {
      return c.json({ error: "forbidden" }, 403);
    }
    const runtime = getProductSystem(c);
    const plane = runtime.assemblyPlane();
    const definition = readAssemblyDefinition(plane.db, plane.organizationId, c.req.param("assemblyId"));
    if (!definition) {
      return c.json({ error: "not_found" }, 404);
    }
    const reviewed = acknowledgeAssemblyReview(definition, new Date().toISOString());
    if (!reviewed.ok) {
      return c.json({ error: reviewed.error, reasons: reviewed.reasons }, 409);
    }
    saveAssemblyDefinition(plane.db, reviewed.definition);
    return c.json({ assembly: presentCurrent(runtime, reviewed.definition.assemblyId) });
  });

  app.post("/api/assemblies/:assemblyId/confirm", (c) => {
    if (!isOwner(c)) {
      return c.json({ error: "forbidden" }, 403);
    }
    const runtime = getProductSystem(c);
    const plane = runtime.assemblyPlane();
    const definition = readAssemblyDefinition(plane.db, plane.organizationId, c.req.param("assemblyId"));
    if (!definition) {
      return c.json({ error: "not_found" }, 404);
    }
    const children = definition.members.flatMap((member) => {
      const child = readConfirmedChild(plane.db, plane.organizationId, member.confirmedTruthId);
      return child ? [child] : [];
    });
    const confirmed = confirmAssembly(
      definition,
      children,
      listAssemblyTruths(plane.db, plane.organizationId, definition.assemblyId),
      new Date().toISOString(),
    );
    if (!confirmed.ok) {
      return c.json({ error: confirmed.error, reasons: confirmed.reasons }, 422);
    }
    saveAssemblyTruth(plane.db, confirmed.truth);
    saveAssemblyDefinition(plane.db, confirmed.definition);
    return c.json({ assembly: presentCurrent(runtime, confirmed.definition.assemblyId) });
  });

  app.post("/api/assemblies/:assemblyId/quote", (c) => {
    if (!isOwner(c)) {
      return c.json({ error: "forbidden" }, 403);
    }
    const runtime = getProductSystem(c);
    const plane = runtime.assemblyPlane();
    const current = loadBundle(runtime, c.req.param("assemblyId"));
    if (!current?.truth) {
      return c.json({ error: "not_found", reasons: ["Ansamblul trebuie confirmat înainte de ofertă."] }, 422);
    }
    const children = current.definition.members.flatMap((member) => {
      const child = readConfirmedChild(plane.db, plane.organizationId, member.confirmedTruthId);
      return child ? [child] : [];
    });
    const service = assemblyServiceLine(runtime, current.truth.requestId);
    if (!service.ok) {
      return c.json({ error: service.error, reasons: service.reasons }, 422);
    }
    const frozen = freezeAssemblyQuote({
      quoteSnapshotId: `asmq:${current.truth.assemblyTruthId}`,
      truth: current.truth,
      children,
      createdAt: new Date().toISOString(),
      ...(service.line ? { serviceLine: service.line } : {}),
    });
    if (!frozen.ok) {
      return c.json({ error: frozen.error, reasons: frozen.reasons }, 422);
    }
    saveAssemblyQuote(plane.db, frozen.quote);
    if (current.truth.requestId) {
      persistAssemblyQuoteRequestLock(
        plane.db,
        current.truth.requestId,
        frozen.quote.quoteSnapshotId,
      );
    }
    return c.json({ assembly: presentCurrent(runtime, current.definition.assemblyId) });
  });

  app.post("/api/assemblies/:assemblyId/accept", (c) => {
    if (!isOwner(c)) {
      return c.json({ error: "forbidden" }, 403);
    }
    const runtime = getProductSystem(c);
    const plane = runtime.assemblyPlane();
    const current = loadBundle(runtime, c.req.param("assemblyId"));
    if (!current?.quote) {
      return c.json({ error: "not_found" }, 404);
    }
    const children = current.definition.members.flatMap((member) => {
      const child = readConfirmedChild(plane.db, plane.organizationId, member.confirmedTruthId);
      return child ? [child] : [];
    });
    const accepted = acceptAssemblyQuote({
      orderSnapshotId: `asmo:${current.quote.contentHash.slice(0, 24)}`,
      quote: current.quote,
      children,
      createdAt: new Date().toISOString(),
    });
    if (!accepted.ok) {
      return c.json({ error: accepted.error, reasons: accepted.reasons }, 422);
    }
    saveAssemblyOrder(plane.db, accepted.order);
    return c.json({ assembly: presentCurrent(runtime, current.definition.assemblyId) });
  });

  app.post("/api/assemblies/:assemblyId/production", (c) => {
    if (!isOwner(c)) {
      return c.json({ error: "forbidden" }, 403);
    }
    const runtime = getProductSystem(c);
    const current = loadBundle(runtime, c.req.param("assemblyId"));
    if (!current?.order) {
      return c.json({ error: "not_found" }, 404);
    }
    const projected = projectAssemblyProduction(current.order, {
      snapshotId: `asmp:${current.order.contentHash.slice(0, 24)}`,
      createdAt: new Date().toISOString(),
    });
    if (!projected.ok) {
      return c.json({ error: projected.error, reasons: projected.reasons }, 422);
    }
    saveAssemblyProduction(runtime.assemblyPlane().db, projected.snapshot);
    return c.json({ assembly: presentCurrent(runtime, current.definition.assemblyId) });
  });

  app.post("/api/assemblies/:assemblyId/execution-plan", (c) => {
    if (!isOwner(c)) {
      return c.json({ error: "forbidden" }, 403);
    }
    const runtime = getProductSystem(c);
    const current = loadBundle(runtime, c.req.param("assemblyId"));
    if (!current?.production) {
      return c.json({ error: "not_found" }, 404);
    }
    runtime.persistExecutionPlan(materializeAssemblyExecutionPlan(current.production));
    return c.json({ assembly: presentCurrent(runtime, current.definition.assemblyId) });
  });
}

function presentCurrent(
  runtime: ReturnType<typeof getProductSystem>,
  assemblyId: string,
) {
  const bundle = loadBundle(runtime, assemblyId);
  if (!bundle) {
    return null;
  }
  const resolution = runtime.resolveProductEnablement();
  return presentAssemblyReview({
    definition: bundle.definition,
    truth: bundle.truth,
    quote: bundle.quote,
    order: bundle.order,
    production: bundle.production,
    executionPlanId: bundle.executionPlanId,
    lettersSelectable:
      resolution.ok &&
      isTemplateEnabledForNewWork(productCodeForRole("SIGNAGE_LETTERS"), resolution),
  });
}

function loadBundle(runtime: ReturnType<typeof getProductSystem>, assemblyId: string) {
  const plane = runtime.assemblyPlane();
  const definition = readAssemblyDefinition(plane.db, plane.organizationId, assemblyId);
  if (!definition) {
    return null;
  }
  const truth = definition.confirmedTruthId
    ? readAssemblyTruth(plane.db, plane.organizationId, definition.confirmedTruthId)
    : null;
  const quote = readLatestAssemblyQuote(plane.db, plane.organizationId, definition.assemblyId);
  const order = quote
    ? readAssemblyOrderByQuote(plane.db, plane.organizationId, quote.quoteSnapshotId)
    : null;
  const production = order
    ? readAssemblyProductionByOrder(plane.db, plane.organizationId, order.orderSnapshotId)
    : null;
  const execution = production
    ? runtime.readExecutionPlanBySnapshot(production.snapshotId)
    : null;
  return {
    definition,
    truth,
    quote,
    order,
    production,
    executionPlanId: execution?.plan.planId ?? null,
  };
}

function assemblyServiceLine(
  runtime: ReturnType<typeof getProductSystem>,
  requestId: string | null,
) {
  if (!requestId) {
    return { ok: true, line: null };
  }
  const request = runtime.readCommercialRequest(requestId);
  if (!request?.optionalScopeIds.includes(SITE_INSTALLATION_SCOPE_ID)) {
    return { ok: true, line: null };
  }
  const detail = runtime.readRequestDetail(requestId);
  const readiness = {
    facts: detail?.installationFacts ?? null,
    providerMode: request.siteInstallationMode,
    evidence: siteInstallationEvidenceFromRows(runtime.listActiveCostEvidence()),
    manualNetPrice: request.installationManualNetEur ?? null,
  };
  const refusal = siteInstallationFreezeRefusal(request.optionalScopeIds, readiness);
  if (refusal) {
    return { ok: false, error: refusal.error, reasons: refusal.reasons };
  }
  const policyResolution = runtime.resolveCommercialPolicy();
  const projection = projectSiteInstallationScope({
    selected: true,
    ...readiness,
    ...(policyResolution.ok ? { policy: policyResolution.policy } : {}),
  });
  const evidence =
    readiness.providerMode === "INTERNAL"
      ? readiness.evidence.internalLabor
      : readiness.evidence.subcontract;
  if (!projection || !readiness.facts || !readiness.providerMode || !evidence) {
    return {
      ok: false,
      error: "incomplete_offer",
      reasons: ["Montajul de ansamblu nu are faptele necesare pentru înghețare."],
    };
  }
  const frozen = freezeSiteInstallationQuoteLine({
    label: projection.label,
    eic: projection.eic,
    commercial: projection.commercial,
    providerMode: readiness.providerMode,
    requestId,
    facts: readiness.facts,
    evidence,
  });
  if (!frozen.ok) {
    return frozen;
  }
  return { ok: true, line: frozen.line };
}

function readString(body: unknown, key: string): string | null {
  if (typeof body !== "object" || body === null || !(key in body)) {
    return null;
  }
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readKind(body: unknown): AssemblyKind | null {
  const kind = readString(body, "kind");
  if (!kind) {
    return null;
  }
  return isAssemblyKind(kind) ? kind : null;
}

function readRole(body: unknown): AssemblyMemberRole | null {
  const role = readString(body, "role");
  if (role === "SUPPORT_PANEL" || role === "SIGNAGE_LETTERS" || role === "SIGNAGE_LOGO") {
    return role;
  }
  return null;
}
