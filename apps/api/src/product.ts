import {
  compileAcceptedProductEvaluation,
  compileDefinition,
  confirmReviewedDraft,
  frozenTechnicalSettingsFromResolved,
  formulasForTypeFromResolved,
  projectConfigurationPreview,
  technicalSettingsLookupFromResolved,
  projectCommercialExperience,
  siteInstallationIsPrequoteReady,
  noteListActiveCostEvidence,
  noteRuntimeLabels,
  noteRuntimePresent,
  freezeOrderSnapshot,
  freezeQuoteSnapshot,
  projectQuoteDocument,
  CODE_DEFAULT_POLICY_GUIDANCE,
  commercialPolicySourceLabel,
  MANUAL_FIXED_PRODUCT_STRATEGY,
  PRODUCT_COST_PLUS_STRATEGY,
  organizationCommercialDefaultsFromPolicy,
  projectAuthorizedProductCommercialPrice,
  projectCommercialPrice,
  projectCostCompletenessIssues,
  quoteCommercialTermsFromPolicy,
  quoteCommercialTermsMatchDefaults,
  validateQuoteCommercialTerms,
  type QuoteCommercialTerms,
  projectLiveJobCommercial,
  omitForbiddenFinancialFields,
  scopeCommercialPrice,
  scopeEic,
  scopeExecutionPlanPreview,
  scopeExecutionPlanView,
  scopeOrderSnapshot,
  scopeQuoteSnapshot,
  recordQuoteAcceptance,
  composeProductProcesses,
  projectExecutionPlanPreview,
  assertOrderReleaseReadyForExecution,
  freezeAcceptedProductionSnapshot,
  freezeProductionReleaseFromOrder,
  lettersProcessCompositionInspections,
  materializeExecutionPlanFromSnapshot,
  presentSiteInstallationScope,
  scopeSiteInstallationOperatorView,
  projectSiteInstallationScope,
  SERVICE_QUOTE_DOCUMENT_NOT_AUTHORIZED,
  SERVICE_QUOTE_DOCUMENT_NOT_AUTHORIZED_REASON,
  SERVICE_QUOTE_FREEZE_NOT_AUTHORIZED,
  SERVICE_QUOTE_FREEZE_NOT_AUTHORIZED_REASON,
  SITE_INSTALLATION_SCOPE_ID,
  siteInstallationEvidenceFromRows,
  siteInstallationFreezeRefusal,
  projectExecutionPlanView,
  type ActualConsumptionLineInput,
  type ExecutionPlanRecord,
  type TaskCompletionInput,
  type TaskMutationError,
  type TaskMutationResult,
  type DraftConfiguration,
  type DraftValue,
  type CommercialPolicy,
  type DraftValues,
  type ProductDefinition,
  type ComponentTypeId,
  technicalSettingDefinitionsForTemplate,
  PRODUCT_NOT_ENABLED_FOR_NEW_WORK,
  PRODUCT_NOT_ENABLED_FOR_NEW_WORK_REASON,
  getProductTemplate,
  isTemplateEnabledForNewWork,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { ProductSystemRuntime } from "./productSystem/runtime.js";
import { getProductSystem, isOwner, type ApiContext, type ApiEnv } from "./cloud/context.js";
import {
  presentExecutionPlanForViewer,
  viewerCanAssignProvider,
} from "./execution/presentExecutionPlan.js";
import { financialAccess } from "./financial/access.js";
import { requireOwnerRole } from "./cloud/middleware.js";
import { httpPathIdentity } from "./httpPathIdentity.js";
import { OPERATOR_SESSION_COOKIE } from "./operator/store.js";
import { renderQuoteDocumentPdf } from "./quoteDocument/renderQuoteDocumentPdf.js";


function asDraftValues(value: unknown): DraftValues {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  const values: DraftValues = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      values[key] = entry as DraftValue;
    }
  }
  return values;
}

function readDraft(templateCode: string, body: unknown): DraftConfiguration {
  const values =
    typeof body === "object" && body !== null && "values" in body
      ? asDraftValues((body as { values: unknown }).values)
      : {};
  return { templateCode, values };
}

function readRequestId(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("requestId" in body)) {
    return null;
  }
  const value = (body as { requestId: unknown }).requestId;
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function installationReadinessForRequest(
  runtime: ProductSystemRuntime,
  requestId: string,
) {
  const request = runtime.readCommercialRequest(requestId);
  const detail = runtime.readRequestDetail(requestId);
  return {
    request,
    readiness: {
      facts: detail?.installationFacts ?? null,
      providerMode: request?.siteInstallationMode ?? null,
      evidence: siteInstallationEvidenceFromRows(runtime.listActiveCostEvidence()),
      manualNetPrice: request?.installationManualNetEur ?? null,
    },
  };
}

function readInstallationProjection(
  runtime: ProductSystemRuntime,
  body: unknown,
  policy?: CommercialPolicy,
) {
  const requestId = readRequestId(body);
  if (!requestId) {
    return null;
  }
  const { request, readiness } = installationReadinessForRequest(runtime, requestId);
  if (!request) {
    return null;
  }
  return projectSiteInstallationScope({
    selected: request.optionalScopeIds.includes(SITE_INSTALLATION_SCOPE_ID),
    ...readiness,
    ...(policy ? { policy } : {}),
  });
}

function presentInstallationTransport(
  installationProjection: ReturnType<typeof readInstallationProjection>,
  installationScope: ReturnType<typeof scopeSiteInstallationOperatorView> | null,
) {
  if (!installationProjection) {
    return {
      selected: false,
      prequoteReady: null as boolean | null,
      incompleteReasons: [] as const,
    };
  }
  return {
    selected: true,
    prequoteReady: installationScope
      ? siteInstallationIsPrequoteReady(installationScope)
      : false,
    incompleteReasons: installationScope?.incompleteReasons ?? [],
  };
}

function readManualProductNetPrice(body: unknown): number | null {
  if (typeof body !== "object" || body === null || !("manualProductNetPrice" in body)) {
    return null;
  }
  const value = (body as { manualProductNetPrice: unknown }).manualProductNetPrice;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readPreferManualProductPrice(body: unknown): boolean {
  if (typeof body !== "object" || body === null || !("preferManualProductPrice" in body)) {
    return false;
  }
  return (body as { preferManualProductPrice: unknown }).preferManualProductPrice === true;
}

function readPricingMethod(body: unknown): "PRODUCT_COST_PLUS" | "MANUAL_FIXED_PRODUCT" | null {
  if (typeof body !== "object" || body === null || !("pricingMethod" in body)) {
    return null;
  }
  const value = (body as { pricingMethod: unknown }).pricingMethod;
  if (value === PRODUCT_COST_PLUS_STRATEGY || value === MANUAL_FIXED_PRODUCT_STRATEGY) {
    return value;
  }
  return null;
}

function readQuoteCommercialTerms(body: unknown): QuoteCommercialTerms | null | undefined {
  if (typeof body !== "object" || body === null || !("quoteCommercialTerms" in body)) {
    return undefined;
  }
  const raw = (body as { quoteCommercialTerms: unknown }).quoteCommercialTerms;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const payload = raw as Record<string, unknown>;
  const markupPercent = payload.markupPercent;
  const discountPercent = payload.discountPercent;
  const adjustmentAmount = payload.adjustmentAmount;
  if (
    typeof markupPercent !== "number" ||
    !Number.isFinite(markupPercent) ||
    typeof discountPercent !== "number" ||
    !Number.isFinite(discountPercent) ||
    typeof adjustmentAmount !== "number" ||
    !Number.isFinite(adjustmentAmount)
  ) {
    return null;
  }
  return { markupPercent, discountPercent, adjustmentAmount };
}

export function resolveProductCommercialForRequest(
  runtime: ProductSystemRuntime,
  eic: Parameters<typeof projectCommercialPrice>[0],
  body: unknown,
  authorized: boolean,
) {
  const resolution = runtime.resolveCommercialPolicy();
  if (!resolution.ok) {
    return { ok: false as const, resolution };
  }
  const requestedTerms = readQuoteCommercialTerms(body);
  if (requestedTerms === null) {
    return {
      ok: false as const,
      error: "invalid_quote_terms" as const,
      issues: [
        {
          field: "quoteCommercialTerms",
          reason: "Termenii comerciali ai ofertei trebuie să fie numere valide.",
        },
      ],
    };
  }
  const quoteTerms = requestedTerms ?? quoteCommercialTermsFromPolicy(resolution.policy);
  const termIssues = validateQuoteCommercialTerms(quoteTerms);
  if (termIssues.length > 0) {
    return {
      ok: false as const,
      error: "invalid_quote_terms" as const,
      issues: termIssues,
    };
  }
  const pricingMethod =
    readPricingMethod(body) ??
    (authorized && readPreferManualProductPrice(body)
      ? MANUAL_FIXED_PRODUCT_STRATEGY
      : PRODUCT_COST_PLUS_STRATEGY);
  const preferManual = authorized && pricingMethod === MANUAL_FIXED_PRODUCT_STRATEGY;
  const costPlus = projectCommercialPrice(eic, resolution.policy, quoteTerms);
  const commercialPrice = projectAuthorizedProductCommercialPrice(
    costPlus,
    resolution.policy,
    {
      authorized,
      manualNetPrice: authorized ? readManualProductNetPrice(body) : null,
      preferManual,
    },
  );
  const organizationDefaults = organizationCommercialDefaultsFromPolicy(resolution.policy);
  return {
    ok: true as const,
    resolution,
    costPlus,
    commercialPrice,
    quoteTerms,
    organizationDefaults,
    quoteTermsFromDefaults: quoteCommercialTermsMatchDefaults(quoteTerms, organizationDefaults),
    pricingMethod: commercialPrice.commercialStrategy ?? pricingMethod,
    calculatedPriceAvailable: costPlus.calculationStatus === "CALCULABLE",
    manualProductPriceAuthorized: authorized,
  };
}

function presentResolvedCommercialPolicy(
  resolution: Extract<
    ReturnType<ProductSystemRuntime["resolveCommercialPolicy"]>,
    { ok: true }
  >,
) {
  return {
    source: resolution.policy.source,
    sourceLabel: commercialPolicySourceLabel(resolution.policy.source),
    guidance:
      resolution.policy.source === "CODE_DEFAULT" ? CODE_DEFAULT_POLICY_GUIDANCE : null,
    policyId: resolution.policy.id,
    version: resolution.policy.version,
    currency: resolution.policy.currency,
    rounding: resolution.policy.rounding,
  };
}

function readCustomerId(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("customerId" in body)) {
    return null;
  }
  const value = (body as { customerId: unknown }).customerId;
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readReviewedDraft(body: unknown): {
  values: DraftValues | null;
  reviewId: string;
} {
  if (typeof body !== "object" || body === null) {
    return { values: null, reviewId: "" };
  }
  const payload = body as { values?: unknown; reviewId?: string };
  return {
    values: "values" in payload ? asDraftValues(payload.values) : null,
    reviewId: typeof payload.reviewId === "string" ? payload.reviewId : "",
  };
}

export function registerProductRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/product-catalog", (c) => {
    const runtime = getProductSystem(c);
    return c.json({ tree: runtime.presentNewWorkCatalog() });
  });

  app.get("/api/products/:productCode", (c) => {
    const runtime = getProductSystem(c);
    const productCode = c.req.param("productCode");
    const blocked = refuseDisabledNewWork(runtime, productCode);
    if (blocked) {
      return c.json(blocked.body, blocked.status);
    }
    const presented = runtime.present();
    const template = presented.template(productCode);
    const formSchema = presented.formSchema(productCode);
    if (!template || !formSchema) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ template, formSchema });
  });

  app.get("/api/products/:productCode/process-composition", (c) => {
    const runtime = getProductSystem(c);
    const productCode = c.req.param("productCode");
    const blocked = refuseDisabledNewWork(runtime, productCode);
    if (blocked) {
      return c.json(blocked.body, blocked.status);
    }
    const template = runtime.present().template(productCode);
    if (!template) {
      return c.json({ error: "not_found" }, 404);
    }
    const faceFinish = c.req.query("faceFinish");
    const volumeFinish = c.req.query("volumeFinish");
    const values: DraftValues = {
      ...(faceFinish ? { "face.finish": faceFinish } : {}),
      ...(volumeFinish ? { "volume.finish": volumeFinish } : {}),
    };
    const formulas = runtime.resolveFormulas();
    if (!formulas.ok) {
      return c.json(
        {
          error: "formulas_unavailable",
          reasons: [formulas.reason],
        },
        409,
      );
    }
    const formulaVersionsForType = (typeId: ComponentTypeId) =>
      formulasForTypeFromResolved(typeId, formulas.formulas);
    return c.json({
      composition: omitForbiddenFinancialFields(
        composeProductProcesses(template, values, {
          costEvidenceRows: runtime.listActiveCostEvidence(),
          formulaVersionsForType,
        }),
        financialAccess(c, "commercial"),
      ),
      inspections: lettersProcessCompositionInspections(template),
    });
  });

  app.post("/api/products/:productCode/compile", async (c) => {
    const runtime = getProductSystem(c);
    const productCode = c.req.param("productCode");
    const blocked = refuseDisabledNewWork(runtime, productCode);
    if (blocked) {
      return c.json(blocked.body, blocked.status);
    }
    const presented = runtime.present();
    const template = presented.template(productCode);
    const formSchema = presented.formSchema(productCode);
    if (!template || !formSchema) {
      return c.json({ error: "not_found" }, 404);
    }

    const definition = compileDefinition(
      template,
      formSchema,
      readDraft(productCode, await c.req.json()),
    );
    return c.json({ definition, reviewId: definition.reviewId });
  });

  app.post("/api/products/:productCode/preview", async (c) => {
    const runtime = getProductSystem(c);
    const productCode = c.req.param("productCode");
    const blocked = refuseDisabledNewWork(runtime, productCode);
    if (blocked) {
      return c.json(blocked.body, blocked.status);
    }
    const presented = runtime.present();
    const template = presented.template(productCode);
    const formSchema = presented.formSchema(productCode);
    if (!template || !formSchema) {
      return c.json({ error: "not_found" }, 404);
    }
    const body = await c.req.json().catch(() => null);
    const technical = runtime.resolveTechnicalSettings({
      requiredDefinitions: technicalSettingDefinitionsForTemplate(template),
    });
    if (!technical.ok) {
      return c.json(
        {
          error: "technical_settings_unavailable",
          reasons: [technical.reason],
        },
        409,
      );
    }
    const formulas = runtime.resolveFormulas();
    if (!formulas.ok) {
      return c.json(
        {
          error: "formulas_unavailable",
          reasons: [formulas.reason],
        },
        409,
      );
    }
    const preview = projectConfigurationPreview(
      template,
      formSchema,
      readDraft(productCode, body),
      technical.settings,
      formulas.formulas,
    );
    const previewPolicy = runtime.resolveCommercialPolicy();
    const installationProjection = readInstallationProjection(
      runtime,
      body,
      previewPolicy.ok ? previewPolicy.policy : undefined,
    );
    const presentedInstallation = presentSiteInstallationScope(installationProjection);
    const access = financialAccess(c, "commercial");
    const installationScope = presentedInstallation
      ? scopeSiteInstallationOperatorView(presentedInstallation, access)
      : null;
    return c.json({
      ...preview,
      installation: presentInstallationTransport(installationProjection, installationScope),
    });
  });

  app.post("/api/products/:productCode/confirm", async (c) => {
    const runtime = getProductSystem(c);
    const body = await c.req.json().catch(() => null);
    const compiled = compileAcceptedProduct(
      runtime,
      c.req.param("productCode"),
      body,
    );
    if (!compiled.ok) {
      return c.json(compiled.body, compiled.status);
    }
    const access = financialAccess(c, "commercial");
    const priced = resolveProductCommercialForRequest(
      runtime,
      compiled.eic,
      body,
      isOwner(c),
    );
    if (!priced.ok) {
      if ("error" in priced && priced.error === "invalid_quote_terms") {
        return c.json(
          {
            error: "invalid_quote_terms",
            issues: priced.issues,
            reasons: priced.issues.map((issue) => issue.reason),
          },
          400,
        );
      }
      return c.json(
        {
          error: priced.resolution.error,
          reasons: [priced.resolution.reason],
        },
        422,
      );
    }
    const commercialPrice = priced.commercialPrice;
    const installationProjection = readInstallationProjection(
      runtime,
      body,
      priced.resolution.policy,
    );
    const presentedInstallation = presentSiteInstallationScope(installationProjection);
    const installationScope = presentedInstallation
      ? scopeSiteInstallationOperatorView(presentedInstallation, access)
      : null;
    const jobCommercial =
      installationProjection &&
      installationProjection.eic.completeness !== "COMPLETE"
        ? null
        : projectLiveJobCommercial(
            commercialPrice,
            installationProjection?.commercial,
          );
    return c.json({
      truth: compiled.truth,
      aggregate: compiled.aggregate,
      eic: scopeEic(compiled.eic, access),
      ...(access === "owner"
        ? {
            costCompletenessIssues: projectCostCompletenessIssues(
              compiled.aggregate,
              compiled.composition,
              compiled.costEvidenceRows,
            ),
          }
        : {}),
      commercialPrice: scopeCommercialPrice(commercialPrice, access),
      commercialPolicy: presentResolvedCommercialPolicy(priced.resolution),
      ...(access === "owner"
        ? {
            organizationDefaults: priced.organizationDefaults,
            quoteCommercialTerms: priced.quoteTerms,
            quoteTermsFromDefaults: priced.quoteTermsFromDefaults,
          }
        : {}),
      pricingMethod: priced.pricingMethod,
      calculatedPriceAvailable: priced.calculatedPriceAvailable,
      manualProductPriceAuthorized: priced.manualProductPriceAuthorized,
      commercialExperience: projectCommercialExperience({
        commercialCompleteness: commercialPrice.completeness,
        internalCostCompleteness: compiled.eic.completeness,
        manualProductPriceAuthorized: priced.manualProductPriceAuthorized,
      }),
      installationScope,
      installationPrequoteReady: installationScope
        ? siteInstallationIsPrequoteReady(installationScope)
        : null,
      jobCommercial: access === "workshop" ? null : jobCommercial,
      executionPlanPreview: scopeExecutionPlanPreview(
        projectExecutionPlanPreview(
          compiled.truth,
          compiled.aggregate,
          compiled.composition,
          compiled.eic,
        ),
        access,
      ),
    });
  });

  app.post("/api/products/:productCode/accepted-production-snapshot", async (c) => {
    const runtime = getProductSystem(c);
    const compiled = compileAcceptedProduct(
      runtime,
      c.req.param("productCode"),
      await c.req.json(),
    );
    if (!compiled.ok) {
      return c.json(compiled.body, compiled.status);
    }
    const frozen = freezeAcceptedProductionSnapshot(
      compiled.truth,
      compiled.aggregate,
      compiled.composition,
      compiled.eic,
      {
        costEvidenceRows: compiled.costEvidenceRows,
        technicalSettings: frozenTechnicalSettingsFromResolved(
          compiled.resolvedTechnicalSettings,
        ),
        formulas: compiled.formulaTraces,
      },
    );
    const stored = runtime.acceptProductionSnapshot(frozen);
    return c.json({
      created: stored.created,
      snapshot: omitForbiddenFinancialFields(
        stored.snapshot,
        financialAccess(c, "commercial"),
      ),
    });
  });

  app.post("/api/products/:productCode/quote-snapshots", async (c) => {
    const runtime = getProductSystem(c);
    const body = await c.req.json().catch(() => null);
    const compiled = compileAcceptedProduct(
      runtime,
      c.req.param("productCode"),
      body,
    );
    if (!compiled.ok) {
      return c.json(compiled.body, compiled.status);
    }
    const customerId = readCustomerId(body);
    if (!customerId) {
      return c.json(
        {
          error: "missing_customer",
          reasons: ["Oferta comercială necesită un client înainte de înghețare."],
        },
        422,
      );
    }
    const customer = runtime.getCustomer(customerId);
    if (!customer || customer.status !== "ACTIVE") {
      return c.json(
        {
          error: "customer_unavailable",
          reasons: ["Clientul selectat nu poate fi folosit pentru o ofertă nouă."],
        },
        422,
      );
    }
    const requestId = readRequestId(body);
    if (requestId) {
      const request = runtime.readCommercialRequest(requestId);
      if (!request) {
        return c.json(
          {
            error: "request_unavailable",
            reasons: ["Cererea de ofertă nu este disponibilă."],
          },
          422,
        );
      }
      if (request.status === "CANCELLED") {
        return c.json(
          {
            error: "request_cancelled",
            reasons: ["Cererea anulată nu poate primi o ofertă nouă."],
          },
          422,
        );
      }
      if (request.customerId !== customerId) {
        return c.json(
          {
            error: "request_customer_mismatch",
            reasons: ["Oferta trebuie să folosească același client ca cererea."],
          },
          422,
        );
      }
      const { readiness } = installationReadinessForRequest(runtime, requestId);
      const installationRefusal = siteInstallationFreezeRefusal(
        request.optionalScopeIds,
        readiness,
      );
      if (installationRefusal) {
        return c.json(installationRefusal, 422);
      }
    }
    const priced = resolveProductCommercialForRequest(
      runtime,
      compiled.eic,
      body,
      isOwner(c),
    );
    if (!priced.ok) {
      if ("error" in priced && priced.error === "invalid_quote_terms") {
        return c.json(
          {
            error: "invalid_quote_terms",
            issues: priced.issues,
            reasons: priced.issues.map((issue) => issue.reason),
          },
          400,
        );
      }
      return c.json(
        {
          error: priced.resolution.error,
          reasons: [priced.resolution.reason],
        },
        422,
      );
    }
    const commercialPrice = priced.commercialPrice;
    const seller = runtime.getSellerProfile();
    if (!seller) {
      return c.json(
        {
          error: "seller_unconfigured",
          reasons: ["Datele firmei trebuie configurate înainte de a crea o ofertă."],
        },
        422,
      );
    }
    const installationForFreeze = requestId
      ? projectSiteInstallationScope({
          selected: Boolean(
            runtime
              .readCommercialRequest(requestId)
              ?.optionalScopeIds.includes(SITE_INSTALLATION_SCOPE_ID),
          ),
          ...installationReadinessForRequest(runtime, requestId).readiness,
          policy: priced.resolution.policy,
        })
      : null;
    if (installationForFreeze) {
      return c.json(
        {
          error: SERVICE_QUOTE_FREEZE_NOT_AUTHORIZED,
          reasons: [SERVICE_QUOTE_FREEZE_NOT_AUTHORIZED_REASON],
        },
        422,
      );
    }
    const frozen = freezeQuoteSnapshot(
      compiled.truth,
      compiled.aggregate,
      compiled.composition,
      compiled.eic,
      commercialPrice,
      {
        customer: {
          customerId: customer.customerId,
          displayName: customer.displayName,
        },
        seller,
        costEvidenceRows: compiled.costEvidenceRows,
        technicalSettings: frozenTechnicalSettingsFromResolved(
          compiled.resolvedTechnicalSettings,
        ),
        formulas: compiled.formulaTraces,
      },
    );
    if (!frozen.ok) {
      return c.json(
        { error: frozen.error, reasons: frozen.reasons },
        422,
      );
    }
    const stored = runtime.persistQuoteSnapshot(frozen.snapshot);
    if (!requestId) {
      const access = financialAccess(c, "commercial");
      return c.json({
        created: stored.created,
        quoteSnapshot: scopeQuoteSnapshot(stored.snapshot, access),
        commercialExperience: projectCommercialExperience({
          commercialCompleteness: stored.snapshot.commercial.completeness,
          quote: stored.snapshot,
        }),
      });
    }
    const linked = runtime.linkRequestQuote(requestId, stored.snapshot.quoteSnapshotId);
    const access = financialAccess(c, "commercial");
    const quoteExperience = projectCommercialExperience({
      commercialCompleteness: stored.snapshot.commercial.completeness,
      quote: stored.snapshot,
    });
    if (!linked.ok) {
      return c.json({
        created: stored.created,
        quoteSnapshot: scopeQuoteSnapshot(stored.snapshot, access),
        commercialExperience: quoteExperience,
        requestLinkError: linked.error,
        reasons: ["Oferta a fost creată, dar nu s-a legat de cerere."],
      });
    }
    return c.json({
      created: stored.created,
      quoteSnapshot: scopeQuoteSnapshot(stored.snapshot, access),
      commercialExperience: quoteExperience,
      requestLink: linked.link,
    });
  });

  app.get("/api/products/:productCode/quote-snapshots/:quoteSnapshotId", (c) => {
    const runtime = getProductSystem(c);
    const snapshot = runtime.readQuoteSnapshot(c.req.param("quoteSnapshotId"));
    if (!snapshot || snapshot.productCode !== c.req.param("productCode")) {
      return c.json({ error: "not_found" }, 404);
    }
    const requestLink = runtime
      .listQuoteOverview()
      .quotes.find((quote) => quote.quoteSnapshotId === snapshot.quoteSnapshotId);
    return c.json({
      quoteSnapshot: scopeQuoteSnapshot(snapshot, financialAccess(c, "commercial")),
      request: requestLink?.requestId
        ? {
            requestId: requestLink.requestId,
            href: `/requests/${encodeURIComponent(requestLink.requestId)}`,
            reference: requestLink.requestReference,
          }
        : null,
    });
  });

  app.get(
    "/api/products/:productCode/quote-snapshots/:quoteSnapshotId/document",
    async (c) => {
      const runtime = getProductSystem(c);
      const snapshot = runtime.readQuoteSnapshot(c.req.param("quoteSnapshotId"));
      if (!snapshot || snapshot.productCode !== c.req.param("productCode")) {
        return c.json({ error: "not_found" }, 404);
      }
      if (snapshot.schemaVersion === 2) {
        return c.json(
          {
            error: SERVICE_QUOTE_DOCUMENT_NOT_AUTHORIZED,
            reasons: [SERVICE_QUOTE_DOCUMENT_NOT_AUTHORIZED_REASON],
          },
          422,
        );
      }
      const model = projectQuoteDocument(snapshot);
      const bytes = await renderQuoteDocumentPdf(model);
      return c.body(Buffer.from(bytes), 200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${model.filename}"`,
      });
    },
  );

  app.post(
    "/api/products/:productCode/quote-snapshots/:quoteSnapshotId/acceptance",
    (c) => {
      const runtime = getProductSystem(c);
      const snapshot = runtime.readQuoteSnapshot(c.req.param("quoteSnapshotId"));
      if (!snapshot || snapshot.productCode !== c.req.param("productCode")) {
        return c.json({ error: "not_found" }, 404);
      }
      const recorded = recordQuoteAcceptance(snapshot);
      if (!recorded.ok) {
        return c.json(
          { error: recorded.error, reasons: recorded.reasons },
          422,
        );
      }
      const stored = runtime.persistQuoteAcceptance(recorded.decision);
      return c.json({
        created: stored.created,
        acceptanceDecision: stored.decision,
        quoteSnapshot: scopeQuoteSnapshot(snapshot, financialAccess(c, "commercial")),
      });
    },
  );

  app.get(
    "/api/products/:productCode/quote-snapshots/:quoteSnapshotId/acceptance",
    (c) => {
      const runtime = getProductSystem(c);
      const snapshot = runtime.readQuoteSnapshot(c.req.param("quoteSnapshotId"));
      if (!snapshot || snapshot.productCode !== c.req.param("productCode")) {
        return c.json({ error: "not_found" }, 404);
      }
      const decision = runtime.readQuoteAcceptance(snapshot.quoteSnapshotId);
      if (!decision) {
        return c.json({ error: "not_found" }, 404);
      }
      return c.json({
        acceptanceDecision: decision,
        quoteSnapshot: scopeQuoteSnapshot(snapshot, financialAccess(c, "commercial")),
      });
    },
  );

  app.post(
    "/api/products/:productCode/quote-snapshots/:quoteSnapshotId/order",
    (c) => {
      const runtime = getProductSystem(c);
      const snapshot = runtime.readQuoteSnapshot(c.req.param("quoteSnapshotId"));
      if (!snapshot || snapshot.productCode !== c.req.param("productCode")) {
        return c.json({ error: "not_found" }, 404);
      }
      const acceptance = runtime.readQuoteAcceptance(snapshot.quoteSnapshotId);
      if (!acceptance) {
        return c.json(
          {
            error: "quote_not_accepted",
            reasons: ["Comanda poate fi creată doar dintr-o ofertă acceptată."],
          },
          422,
        );
      }
      const frozen = freezeOrderSnapshot(snapshot, acceptance);
      if (!frozen.ok) {
        return c.json(
          { error: frozen.error, reasons: frozen.reasons },
          422,
        );
      }
      const stored = runtime.persistOrderSnapshot(frozen.snapshot);
      return c.json({
        created: stored.created,
        orderSnapshot: scopeOrderSnapshot(stored.snapshot, financialAccess(c, "commercial")),
        quoteSnapshot: scopeQuoteSnapshot(snapshot, financialAccess(c, "commercial")),
        acceptanceDecision: acceptance,
      });
    },
  );

  app.get(
    "/api/products/:productCode/quote-snapshots/:quoteSnapshotId/order",
    (c) => {
      const runtime = getProductSystem(c);
      const snapshot = runtime.readQuoteSnapshot(c.req.param("quoteSnapshotId"));
      if (!snapshot || snapshot.productCode !== c.req.param("productCode")) {
        return c.json({ error: "not_found" }, 404);
      }
      const orderSnapshot = runtime.readOrderSnapshotByQuote(snapshot.quoteSnapshotId);
      if (!orderSnapshot) {
        return c.json({ error: "not_found" }, 404);
      }
      return c.json({
        orderSnapshot: scopeOrderSnapshot(orderSnapshot, financialAccess(c, "commercial")),
        quoteSnapshot: scopeQuoteSnapshot(snapshot, financialAccess(c, "commercial")),
        acceptanceDecision: runtime.readQuoteAcceptance(snapshot.quoteSnapshotId),
      });
    },
  );

  app.get("/api/products/:productCode/orders/:orderSnapshotId", (c) => {
    const runtime = getProductSystem(c);
    const orderSnapshot = runtime.readOrderSnapshot(c.req.param("orderSnapshotId"));
    if (!orderSnapshot || orderSnapshot.productCode !== c.req.param("productCode")) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({
      orderSnapshot: scopeOrderSnapshot(orderSnapshot, financialAccess(c, "commercial")),
    });
  });

  app.post(
    "/api/products/:productCode/orders/:orderSnapshotId/production-release",
    (c) => {
      const runtime = getProductSystem(c);
      const orderSnapshot = runtime.readOrderSnapshot(c.req.param("orderSnapshotId"));
      if (!orderSnapshot || orderSnapshot.productCode !== c.req.param("productCode")) {
        return c.json({ error: "not_found" }, 404);
      }
      const frozen = freezeProductionReleaseFromOrder(orderSnapshot);
      if (!frozen.ok) {
        return c.json(
          { error: frozen.error, reasons: frozen.reasons },
          422,
        );
      }
      const stored = runtime.acceptProductionSnapshot(frozen.snapshot);
      const access = financialAccess(c, "commercial");
      return c.json({
        created: stored.created,
        snapshot: omitForbiddenFinancialFields(stored.snapshot, access),
        orderSnapshot: scopeOrderSnapshot(orderSnapshot, access),
      });
    },
  );

  app.get(
    "/api/products/:productCode/orders/:orderSnapshotId/production-release",
    (c) => {
      const runtime = getProductSystem(c);
      const orderSnapshot = runtime.readOrderSnapshot(c.req.param("orderSnapshotId"));
      if (!orderSnapshot || orderSnapshot.productCode !== c.req.param("productCode")) {
        return c.json({ error: "not_found" }, 404);
      }
      const snapshot = runtime.readProductionReleaseByOrder(orderSnapshot.orderSnapshotId);
      if (!snapshot) {
        return c.json({ error: "not_found" }, 404);
      }
      const access = financialAccess(c, "commercial");
      return c.json({
        snapshot: omitForbiddenFinancialFields(snapshot, access),
        orderSnapshot: scopeOrderSnapshot(orderSnapshot, access),
      });
    },
  );

  app.get(
    "/api/products/:productCode/accepted-production-snapshots/:snapshotId",
    (c) => {
      const runtime = getProductSystem(c);
      const snapshot = runtime.readProductionSnapshot(c.req.param("snapshotId"));
      if (!snapshot || snapshot.productCode !== c.req.param("productCode")) {
        return c.json({ error: "not_found" }, 404);
      }
      return c.json({
        snapshot: omitForbiddenFinancialFields(snapshot, financialAccess(c, "commercial")),
      });
    },
  );

  app.post(
    "/api/products/:productCode/accepted-production-snapshots/:snapshotId/execution-plan",
    (c) => {
      const runtime = getProductSystem(c);
      const snapshot = runtime.readProductionSnapshot(c.req.param("snapshotId"));
      if (!snapshot || snapshot.productCode !== c.req.param("productCode")) {
        return c.json({ error: "not_found" }, 404);
      }
      const order = snapshot.sourceOrderSnapshotId
        ? runtime.readOrderSnapshot(snapshot.sourceOrderSnapshotId)
        : null;
      const gate = assertOrderReleaseReadyForExecution(snapshot, order);
      if (!gate.ok) {
        return c.json(
          { error: gate.error, reasons: gate.reasons },
          422,
        );
      }
      const stored = runtime.persistExecutionPlan(
        materializeExecutionPlanFromSnapshot(snapshot),
      );
      return c.json({
        created: stored.created,
        executionPlan: presentScopedExecutionPlan(
          c,
          projectPlanView(runtime, stored.record),
        ),
      });
    },
  );

  app.get(
    "/api/products/:productCode/accepted-production-snapshots/:snapshotId/execution-plan",
    (c) => {
      const runtime = getProductSystem(c);
      const snapshot = runtime.readProductionSnapshot(c.req.param("snapshotId"));
      if (!snapshot || snapshot.productCode !== c.req.param("productCode")) {
        return c.json({ error: "not_found" }, 404);
      }
      const record = runtime.readExecutionPlanBySnapshot(snapshot.snapshotId);
      if (!record) {
        return c.json({ error: "not_found" }, 404);
      }
      return c.json({
        executionPlan: presentScopedExecutionPlan(c, projectPlanView(runtime, record)),
      });
    },
  );

  app.get("/api/execution-plans/:planId", (c) => {
    const runtime = getProductSystem(c);
    const record = runtime.readExecutionPlan(
      httpPathIdentity(c.req.path, "/api/execution-plans/"),
    );
    if (!record) {
      return c.json({ error: "not_found" }, 404);
    }
    const session = runtime.resolveOperatorSession(getCookie(c, OPERATOR_SESSION_COOKIE));
    const snapshot = runtime.readProductionSnapshot(record.plan.sourceSnapshotId);
    const assemblyProduction = snapshot
      ? null
      : runtime.readAssemblyProductionBySnapshot(record.plan.sourceSnapshotId);
    const jobId =
      snapshot?.sourceOrderSnapshotId ?? assemblyProduction?.sourceOrderSnapshotId ?? null;
    const job = jobId
      ? runtime.listJobOverview().jobs.find((item) => item.jobId === jobId) ?? null
      : null;
    return c.json({
      executionPlan: presentScopedExecutionPlan(
        c,
        projectPlanView(
          runtime,
          record,
          session.ok ? session.person.personId : null,
        ),
      ),
      job: jobId
        ? {
            jobId,
            href: `/jobs/${encodeURIComponent(jobId)}`,
            label: job?.productLabel ?? null,
            kindLabel: job?.kindLabel ?? null,
            priorityLabel: job?.priorityLabel ?? null,
            targetDateLabel: job?.targetDateLabel ?? null,
          }
        : null,
    });
  });

  app.post("/api/execution-tasks/:taskId/provider", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const providerId = readProviderId(await c.req.json());
    if (!providerId) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const session = runtime.resolveOperatorSession(getCookie(c, OPERATOR_SESSION_COOKIE));
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/provider");
    return respondTaskMutation(
      c,
      runtime,
      runtime.assignExecutionTaskProvider(taskId, providerId),
      {
        taskId,
        operatorId: session.ok ? session.person.personId : null,
      },
    );
  });

  app.post("/api/execution-tasks/:taskId/planned-effort", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const plannedEffortMinutes = readPlannedEffortMinutes(await c.req.json().catch(() => null));
    if (plannedEffortMinutes === undefined) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const session = runtime.resolveOperatorSession(getCookie(c, OPERATOR_SESSION_COOKIE));
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/planned-effort");
    return respondTaskMutation(
      c,
      runtime,
      runtime.setExecutionTaskPlannedEffort(taskId, plannedEffortMinutes),
      {
        taskId,
        operatorId: session.ok ? session.person.personId : null,
      },
    );
  });

  app.post("/api/execution-tasks/:taskId/executor", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const personId = readPersonId(await c.req.json().catch(() => null));
    if (!personId) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const session = runtime.resolveOperatorSession(getCookie(c, OPERATOR_SESSION_COOKIE));
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/executor");
    return respondTaskMutation(
      c,
      runtime,
      runtime.assignExecutionTaskExecutor(taskId, personId),
      {
        taskId,
        operatorId: session.ok ? session.person.personId : null,
      },
    );
  });

  app.post("/api/execution-tasks/:taskId/start", (c) => {
    const runtime = getProductSystem(c);
    const session = runtime.resolveOperatorSession(getCookie(c, OPERATOR_SESSION_COOKIE));
    if (!session.ok) {
      return c.json({ error: "invalid_session" }, 401);
    }
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/start");
    return respondTaskMutation(
      c,
      runtime,
      runtime.claimAndStartExecutionTask(taskId, session.person.personId),
      { taskId, operatorId: session.person.personId },
    );
  });

  app.post("/api/execution-tasks/:taskId/complete", async (c) => {
    const runtime = getProductSystem(c);
    const session = runtime.resolveOperatorSession(getCookie(c, OPERATOR_SESSION_COOKIE));
    if (!session.ok) {
      return c.json({ error: "invalid_session" }, 401);
    }
    const input = readCompletionInput(await c.req.json().catch(() => ({})));
    if (!input) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/complete");
    return respondTaskMutation(
      c,
      runtime,
      runtime.completeExecutionTask(taskId, input, session.person.personId),
      { taskId, operatorId: session.person.personId },
    );
  });
}

function confirmFailure(
  confirmed: {
    ok: false;
    reason: "not_ready" | "review_mismatch" | "review_required";
    definition: ProductDefinition | null;
  },
) {
  if (confirmed.reason === "review_required") {
    return {
      ok: false as const,
      status: 400 as const,
      body: { error: "review_required" as const },
    };
  }
  return {
    ok: false as const,
    status: (confirmed.reason === "review_mismatch" ? 409 : 422) as 409 | 422,
    body: { error: confirmed.reason, definition: confirmed.definition },
  };
}

function refuseDisabledNewWork(
  runtime: ProductSystemRuntime,
  productCode: string,
): { status: 409; body: Record<string, unknown> } | null {
  if (!getProductTemplate(productCode)) {
    return null;
  }
  const resolution = runtime.resolveProductEnablement();
  if (!resolution.ok) {
    return {
      status: 409,
      body: {
        error: resolution.error,
        reasons: [resolution.reason],
      },
    };
  }
  if (!isTemplateEnabledForNewWork(productCode, resolution)) {
    return {
      status: 409,
      body: {
        error: PRODUCT_NOT_ENABLED_FOR_NEW_WORK,
        reasons: [PRODUCT_NOT_ENABLED_FOR_NEW_WORK_REASON],
      },
    };
  }
  return null;
}

export function compileAcceptedProduct(
  runtime: ProductSystemRuntime,
  productCode: string,
  body: unknown,
) {
  noteRuntimePresent();
  const presented = runtime.present();
  const template = presented.template(productCode);
  const formSchema = presented.formSchema(productCode);
  if (!template || !formSchema) {
    return { ok: false as const, status: 404 as const, body: { error: "not_found" } };
  }
  const blocked = refuseDisabledNewWork(runtime, productCode);
  if (blocked) {
    return { ok: false as const, status: blocked.status, body: blocked.body };
  }

  const technical = runtime.resolveTechnicalSettings({
    requiredDefinitions: technicalSettingDefinitionsForTemplate(template),
  });
  if (!technical.ok) {
    return {
      ok: false as const,
      status: 409 as const,
      body: {
        error: "technical_settings_unavailable",
        reasons: [technical.reason],
      },
    };
  }
  const formulas = runtime.resolveFormulas();
  if (!formulas.ok) {
    return {
      ok: false as const,
      status: 409 as const,
      body: {
        error: "formulas_unavailable",
        reasons: [formulas.reason],
      },
    };
  }

  const draft = readReviewedDraft(body);
  const confirmed =
    draft.values && draft.reviewId
      ? confirmReviewedDraft(
          template,
          formSchema,
          { templateCode: productCode, values: draft.values },
          draft.reviewId,
          undefined,
          technical.settings,
          formulas.formulas,
        )
      : {
          ok: false as const,
          reason: "review_required" as const,
          definition: null,
        };

  if ("ok" in confirmed) {
    return confirmFailure(confirmed);
  }

  noteRuntimeLabels();
  noteListActiveCostEvidence();
  const compiled = compileAcceptedProductEvaluation({
    truth: confirmed,
    template,
    formSchema,
    labels: runtime.labels(),
    costEvidenceRows: runtime.listActiveCostEvidence(),
    technicalSettingsForType: technicalSettingsLookupFromResolved(technical.settings),
    formulaVersionsForType: (typeId) =>
      formulasForTypeFromResolved(typeId, formulas.formulas),
  });
  return {
    ok: true as const,
    ...compiled,
    resolvedTechnicalSettings: technical.settings,
    resolvedFormulas: formulas.formulas,
  };
}

function readCompletionInput(body: unknown): TaskCompletionInput | null {
  if (body === undefined || body === null) {
    return {};
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const record = body as {
    completedQuantity?: unknown;
    note?: unknown;
    actualConsumption?: unknown;
  };
  if (
    "completedQuantity" in record &&
    record.completedQuantity !== undefined &&
    typeof record.completedQuantity !== "number"
  ) {
    return null;
  }
  if ("note" in record && record.note !== undefined && typeof record.note !== "string") {
    return null;
  }
  const actualConsumption =
    "actualConsumption" in record && record.actualConsumption !== undefined
      ? readActualConsumption(record.actualConsumption)
      : undefined;
  if (actualConsumption === null) {
    return null;
  }
  return {
    ...(typeof record.completedQuantity === "number"
      ? { completedQuantity: record.completedQuantity }
      : {}),
    ...(typeof record.note === "string" ? { note: record.note } : {}),
    ...(actualConsumption ? { actualConsumption } : {}),
  };
}

function readActualConsumption(value: unknown): ActualConsumptionLineInput[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const lines: ActualConsumptionLineInput[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return null;
    }
    const row = item as {
      resourceId?: unknown;
      actualQuantity?: unknown;
      unit?: unknown;
      note?: unknown;
    };
    if (typeof row.resourceId !== "string" || row.resourceId.trim().length === 0) {
      return null;
    }
    if (typeof row.actualQuantity !== "number") {
      return null;
    }
    if (row.unit !== undefined && typeof row.unit !== "string") {
      return null;
    }
    if (row.note !== undefined && typeof row.note !== "string") {
      return null;
    }
    lines.push({
      resourceId: row.resourceId,
      actualQuantity: row.actualQuantity,
      ...(typeof row.unit === "string" ? { unit: row.unit } : {}),
      ...(typeof row.note === "string" ? { note: row.note } : {}),
    });
  }
  return lines;
}

function readProviderId(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("providerId" in body)) {
    return null;
  }
  const value = (body as { providerId: unknown }).providerId;
  if (typeof value !== "string") {
    return null;
  }
  const providerId = value.trim();
  return providerId.length > 0 ? providerId : null;
}

function mutationHttpStatus(error: TaskMutationError): 404 | 409 | 422 {
  switch (error) {
    case "not_found":
      return 404;
    case "ineligible_provider":
    case "missing_assignment":
    case "missing_executor":
    case "provider_unavailable":
    case "executor_unavailable":
    case "unknown_person":
    case "retired_person":
    case "unavailable_person":
    case "ineligible_executor":
    case "wrong_executor":
    case "invalid_quantity":
    case "invalid_unit":
    case "invalid_resource":
    case "invalid_note":
    case "invalid_planned_effort":
      return 422;
    case "reassignment_locked":
    case "effort_frozen":
    case "already_started_by_other":
    case "dependencies_incomplete":
    case "invalid_transition":
      return 409;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

function readPlannedEffortMinutes(body: unknown): unknown {
  if (typeof body !== "object" || body === null || !("plannedEffortMinutes" in body)) {
    return undefined;
  }
  return (body as { plannedEffortMinutes: unknown }).plannedEffortMinutes;
}

function readPersonId(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("personId" in body)) {
    return null;
  }
  const value = (body as { personId: unknown }).personId;
  if (typeof value !== "string") {
    return null;
  }
  const personId = value.trim();
  return personId.length > 0 ? personId : null;
}

function projectPlanView(
  runtime: ProductSystemRuntime,
  record: ExecutionPlanRecord,
  currentOperatorId: string | null = null,
) {
  return projectExecutionPlanView(
    record,
    runtime.listPeople(),
    runtime.readProductionSnapshot(record.plan.sourceSnapshotId),
    runtime.peopleEligibilityContext(),
    currentOperatorId,
    runtime.providerRegistry,
  );
}

function respondTaskMutation(
  c: ApiContext,
  runtime: ProductSystemRuntime,
  result: TaskMutationResult,
  options: { taskId?: string; operatorId?: string | null } = {},
) {
  const operatorId = options.operatorId ?? null;
  if (!result.ok) {
    const body: Record<string, unknown> = { error: result.error };
    if (
      (result.error === "already_started_by_other" || result.error === "wrong_executor") &&
      options.taskId
    ) {
      const plan = getPlanForTask(runtime, options.taskId);
      const task = plan?.tasks.find((item) => item.taskId === options.taskId);
      if (task?.assignedExecutor) {
        body.startedBy = {
          personId: task.assignedExecutor.id,
          displayName: task.assignedExecutor.label,
        };
      }
    }
    return c.json(body, mutationHttpStatus(result.error));
  }
  return c.json({
    alreadyApplied: result.alreadyApplied,
    executionPlan: presentScopedExecutionPlan(
      c,
      projectPlanView(runtime, result.record, operatorId),
    ),
  });
}

function presentScopedExecutionPlan(
  c: ApiContext,
  view: ReturnType<typeof projectPlanView>,
) {
  return presentExecutionPlanForViewer(
    scopeExecutionPlanView(view, financialAccess(c, "workshop")),
    viewerCanAssignProvider(c),
  );
}

function getPlanForTask(runtime: ProductSystemRuntime, taskId: string): ExecutionPlanRecord | null {
  return runtime.readExecutionPlanByTaskId(taskId);
}
