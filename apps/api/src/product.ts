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
  isTrustedFrozenQuoteV2ForOrder,
  projectQuoteDocument,
  CODE_DEFAULT_POLICY_GUIDANCE,
  commercialPolicySourceLabel,
  MANUAL_FIXED_PRODUCT_STRATEGY,
  PRODUCT_COST_PLUS_STRATEGY,
  organizationCommercialDefaultsFromPolicy,
  projectManualFixedProductPrice,
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
  SITE_INSTALLATION_SCOPE_ID,
  siteInstallationEvidenceFromRows,
  siteInstallationFreezeRefusal,
  requestStandaloneQuoteRefusal,
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
  assessRateAcknowledgement,
  decideRateAcknowledgement,
  scopeRateAcknowledgementRequirement,
  type CommercialPriceProjection,
  type FrozenRateAcknowledgement,
  type RateAcknowledgementError,
  type CommercialRequestLinkResult,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { ProductSystemRuntime } from "./productSystem/runtime.js";
import { getProductSystem, type ApiContext, type ApiEnv, can } from "./cloud/context.js";
import { checkAlternativeAcceptance, readAlternativeAcceptanceConfirmed } from "./commercial/alternativeAcceptance.js";
import { incompleteCostExceptionFromBody } from "./commercial/incompleteCostException.js";
import { completePendingCommonInstallation, holderInstallationStartBlocked, skipSiteInstallationForOrder } from "./commercial/installationCommitmentStore.js";
import { checkInstallationAcceptance, readInstallationDecision } from "./commercial/installationGuard.js";
import {
  presentExecutionPlanForViewer,
  viewerCanAssignProvider,
} from "./execution/presentExecutionPlan.js";
import { financialAccess } from "./financial/access.js";
import { requireCapability } from "./cloud/middleware.js";
import {
  refuseAcceptIfDispositioned,
  refuseNewQuoteIfClosed,
} from "./commercial/closureStore.js";
import { httpPathIdentity } from "./httpPathIdentity.js";
import { getCommercialRequestQuoteLinkByQuote } from "./requests/store.js";
import { presentVariantConflict, resolveVariantRouteBody } from "./requests/variantContext.js";
import { appendVariantEvent, confirmVariant, listRequestVariants, markVariantIssued } from "./requests/variantStore.js";
import { OPERATOR_SESSION_COOKIE } from "./operator/store.js";
import { renderQuoteDocumentPdf } from "./quoteDocument/renderQuoteDocumentPdf.js";
import {
  actorIdentity,
  effectiveOfferingPriceRight,
  evaluateOfferingForActor,
  presentPolicyForCommercial,
} from "./commercial/offeringAccess.js";
import {
  approvalViewFor,
  commercialOfferingView,
  decideOfferingFreeze,
  frozenOfferingRecordFor,
  priceApprovalBindingHash,
  type OfferingEvaluation,
} from "@workos-final/domain";


class RequestLinkedQuoteRollback extends Error {
  readonly failure: {
    error: string;
    reasons: readonly string[];
    status: 400 | 404 | 409 | 422;
  };

  constructor(failure: {
    error: string;
    reasons: readonly string[];
    status: 400 | 404 | 409 | 422;
  }) {
    super(failure.error);
    this.name = "RequestLinkedQuoteRollback";
    this.failure = failure;
  }
}

function presentRequestQuoteLinkFailure(
  linked: Extract<CommercialRequestLinkResult, { ok: false }>,
): RequestLinkedQuoteRollback["failure"] {
  if ("reasons" in linked) {
    return { error: linked.error, reasons: linked.reasons, status: 422 };
  }
  switch (linked.error) {
    case "customer_mismatch":
      return {
        error: linked.error,
        reasons: ["Oferta trebuie să folosească același client ca cererea."],
        status: 400,
      };
    case "request_cancelled":
      return {
        error: linked.error,
        reasons: ["Cererea anulată nu poate primi o ofertă nouă."],
        status: 400,
      };
    case "not_found":
      return {
        error: linked.error,
        reasons: ["Cererea de ofertă nu este disponibilă."],
        status: 404,
      };
    case "quote_unavailable":
      return {
        error: linked.error,
        reasons: ["Oferta nu s-a putut lega de cerere."],
        status: 404,
      };
    case "quote_already_linked":
      return {
        error: linked.error,
        reasons: ["Oferta este deja legată de altă cerere."],
        status: 409,
      };
    case "commercial_request_closed":
      return {
        error: linked.error,
        reasons: ["Cererea are urmărirea comercială încheiată."],
        status: 409,
      };
    default: {
      const _exhaustive: never = linked;
      return _exhaustive;
    }
  }
}

export function asDraftValues(value: unknown): DraftValues {
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

function readCommercialIntent(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("commercialIntent" in body)) {
    return null;
  }
  const value = (body as { commercialIntent: unknown }).commercialIntent;
  return typeof value === "string" ? value : null;
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

export function readInstallationProjection(
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
  // R-001A applies only to new quote creation. Historical cost-plus snapshots
  // continue to be read by their original immutable commercial contract.
  const requestedMethod = readPricingMethod(body);
  if (requestedMethod === PRODUCT_COST_PLUS_STRATEGY) {
    return {
      ok: false as const,
      error: "pricing_method_not_allowed" as const,
      reasons: [
        "Prețul calculat din costuri nu mai este permis pentru ofertele noi. Introdu un preț net manual.",
      ],
    };
  }
  if (
    body !== null &&
    typeof body === "object" &&
    "pricingMethod" in body &&
    requestedMethod === null
  ) {
    return {
      ok: false as const,
      error: "invalid_pricing_method" as const,
      reasons: ["Metoda de preț pentru oferta nouă nu este validă."],
    };
  }
  const commercialPrice = projectManualFixedProductPrice(
    {
      netPrice: authorized ? readManualProductNetPrice(body) : null,
      currency: eic.currency,
      internalCost: eic.total,
      internalCostCurrency: eic.currency,
      internalCostCompleteness: eic.completeness,
    },
    resolution.policy,
  );
  const organizationDefaults = organizationCommercialDefaultsFromPolicy(resolution.policy);
  return {
    ok: true as const,
    resolution,
    commercialPrice,
    quoteTerms,
    organizationDefaults,
    quoteTermsFromDefaults: quoteCommercialTermsMatchDefaults(quoteTerms, organizationDefaults),
    pricingMethod: MANUAL_FIXED_PRODUCT_STRATEGY,
    calculatedPriceAvailable: false,
    manualProductPriceAuthorized: authorized,
  };
}

type OfferingAssessment = {
  policy: ReturnType<typeof effectiveOfferingPriceRight>["policy"];
  right: ReturnType<typeof effectiveOfferingPriceRight>["right"];
  evaluation: OfferingEvaluation | null;
  bindingHash: string | null;
  latest: ReturnType<ProductSystemRuntime["readLatestPriceApproval"]>;
  internalCostComplete: boolean | null;
  /** The figures the policy was evaluated on. Server-side only; never sent to a client. */
  inputs: { netPrice: number; internalCost: number; internalCostComplete: boolean } | null;
};

/**
 * Commercial & Financial V1 · evaluates the organization offering policy for the current actor on
 * the exact confirmed configuration and client price. The Comercial view carries the outcome only.
 */
export function assessOffering(
  c: ApiContext,
  runtime: ProductSystemRuntime,
  input: {
    truth: Parameters<typeof priceApprovalBindingHash>[0]["truth"];
    productCode: string;
    requestId: string | null;
    /** The saved quote variant, when the offer is one (Commercial Continuity V2). */
    variantId?: string | null;
    commercialPrice: { completeness: string; netPrice: number | null };
    eic: { total: number; completeness: string };
    installation: {
      commercial: { completeness: string; netPrice: number | null };
      eic: { total: number; completeness: string };
    } | null;
  },
): OfferingAssessment {
  const { policy, right } = effectiveOfferingPriceRight(c, runtime);
  const priceReady =
    input.commercialPrice.completeness === "COMPLETE" &&
    input.commercialPrice.netPrice !== null &&
    (!input.installation ||
      (input.installation.commercial.completeness === "COMPLETE" && input.installation.commercial.netPrice !== null));
  const variantId = input.variantId ?? null;
  if (!priceReady) {
    return { policy, right, evaluation: null, bindingHash: null, latest: null, internalCostComplete: null, inputs: null };
  }
  const installationNet = input.installation?.commercial.netPrice ?? null;
  const netPrice = roundMoneyValue((input.commercialPrice.netPrice as number) + (installationNet ?? 0));
  const internalCostComplete =
    input.eic.completeness === "COMPLETE" &&
    (!input.installation || input.installation.eic.completeness === "COMPLETE");
  const internalCost = roundMoneyValue(input.eic.total + (input.installation?.eic.total ?? 0));
  const evaluation = evaluateOfferingForActor(c, policy, { netPrice, internalCost, internalCostComplete });
  const bindingHash = input.requestId
    ? priceApprovalBindingHash({
        subject: {
          kind: "PRODUCT_QUOTE",
          organizationId: runtime.organizationId ?? "single-plane",
          requestId: input.requestId,
          productCode: input.productCode,
          ...(variantId ? { variantId } : {}),
        },
        truth: input.truth,
        netPrice: input.commercialPrice.netPrice as number,
        installationNetPrice: installationNet,
        policyVersion: policy.version,
      })
    : null;
  const latest = input.requestId
    ? runtime.readLatestPriceApproval(input.requestId, input.productCode, variantId)
    : null;
  return {
    policy,
    right,
    evaluation,
    bindingHash,
    latest,
    internalCostComplete,
    inputs: { netPrice, internalCost, internalCostComplete },
  };
}

export function presentOffering(assessed: OfferingAssessment, requestId: string | null) {
  return {
    policy: presentPolicyForCommercial(assessed.policy, assessed.right),
    outcome: assessed.evaluation ? commercialOfferingView(assessed.evaluation) : null,
    approval:
      assessed.evaluation?.outcome === "APPROVAL_REQUIRED" || assessed.latest
        ? approvalViewFor(assessed.latest, assessed.bindingHash)
        : null,
    canRequestApproval: assessed.evaluation?.outcome === "APPROVAL_REQUIRED" && requestId !== null,
  };
}

function roundMoneyValue(value: number): number {
  return Math.round(value * 100) / 100;
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

export function readRateAcknowledgementBindingHash(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("rateAcknowledgement" in body)) {
    return null;
  }
  const raw = (body as { rateAcknowledgement: unknown }).rateAcknowledgement;
  if (typeof raw !== "object" || raw === null || !("bindingHash" in raw)) {
    return null;
  }
  const value = (raw as { bindingHash: unknown }).bindingHash;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function assessProductRateAcknowledgement(
  runtime: ProductSystemRuntime,
  compiled: Extract<ReturnType<typeof compileAcceptedProduct>, { ok: true }>,
  commercialPrice: CommercialPriceProjection,
  requestId: string | null,
) {
  return assessRateAcknowledgement({
    organizationId: runtime.organizationId ?? "single-plane",
    requestId,
    truth: compiled.truth,
    aggregate: compiled.aggregate,
    composition: compiled.composition,
    costEvidenceRows: compiled.costEvidenceRows,
    commercial: commercialPrice,
  });
}

export function rateAcknowledgementHttpStatus(error: RateAcknowledgementError): 403 | 409 | 422 {
  switch (error) {
    case "rate_acknowledgement_forbidden":
      return 403;
    case "rate_acknowledgement_stale":
      return 409;
    case "rate_acknowledgement_required":
      return 422;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
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
    const rawBody = await c.req.json().catch(() => null);
    const variantRoute = resolveVariantRouteBody(c, runtime, c.req.param("productCode"), rawBody, "CONFIRM");
    if (variantRoute && !variantRoute.ok) {
      return c.json(variantRoute.body, variantRoute.status);
    }
    const body = variantRoute ? variantRoute.context.body : rawBody;
    const compiled = compileAcceptedProduct(
      runtime,
      c.req.param("productCode"),
      body,
    );
    if (!compiled.ok) {
      return c.json(compiled.body, compiled.status);
    }
    // The confirmation of a saved variant is kept with its author; re-reading it writes nothing.
    let confirmedVariant: { variantId: string; version: number; confirmedAt: string | null; confirmedByLabel: string | null } | null = null;
    if (variantRoute) {
      const { variant, expectedVersion } = variantRoute.context;
      if (expectedVersion === null) {
        confirmedVariant = variant;
      } else {
        const stored = confirmVariant(
          runtime.assemblyPlane().db,
          // The review the person confirmed: the same id the preview of the saved values returns.
          { variantId: variant.variantId, expectedVersion, reviewId: String(body.reviewId ?? "") },
          actorIdentity(c),
        );
        if (!stored.ok) {
          return stored.error === "version_conflict"
            ? c.json(presentVariantConflict(stored.current), 409)
            : c.json({ error: stored.error }, stored.error === "not_found" ? 404 : 409);
        }
        confirmedVariant = stored.variant;
      }
    }
    const access = financialAccess(c, "commercial");
    const priced = resolveProductCommercialForRequest(
      runtime,
      compiled.eic,
      body,
      effectiveOfferingPriceRight(c, runtime).right.canSetPrice,
    );
    if (!priced.ok) {
      if ("error" in priced) {
        return c.json(
          priced.error === "invalid_quote_terms"
            ? {
                error: priced.error,
                issues: priced.issues,
                reasons: priced.issues.map((issue) => issue.reason),
              }
            : { error: priced.error, reasons: priced.reasons },
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
      rateAcknowledgement: scopeRateAcknowledgementRequirement(
        assessProductRateAcknowledgement(
          runtime,
          compiled,
          commercialPrice,
          readRequestId(body),
        ),
        access,
        can(c, "costs.internal.manage"),
      ),
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
      ...(confirmedVariant
        ? {
            variant: {
              variantId: confirmedVariant.variantId,
              version: confirmedVariant.version,
              confirmedAt: confirmedVariant.confirmedAt,
              confirmedByLabel: confirmedVariant.confirmedByLabel,
            },
          }
        : {}),
      offering: presentOffering(
        assessOffering(c, runtime, {
          truth: compiled.truth,
          productCode: compiled.truth.templateCode,
          requestId: readRequestId(body),
          variantId: confirmedVariant?.variantId ?? null,
          commercialPrice,
          eic: compiled.eic,
          installation: installationProjection
            ? { commercial: installationProjection.commercial, eic: installationProjection.eic }
            : null,
        }),
        readRequestId(body),
      ),
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

  /**
   * Commercial & Financial V1 · the Comercial role asks the Owner to approve the exact confirmed
   * configuration and client price when the organization policy requires it.
   */
  app.post(
    "/api/products/:productCode/price-approval-requests",
    requireCapability("offering.policy.use"),
    async (c) => {
      const runtime = getProductSystem(c);
      const rawBody = await c.req.json().catch(() => null);
      const variantRoute = resolveVariantRouteBody(c, runtime, c.req.param("productCode"), rawBody, "APPROVAL");
      if (variantRoute && !variantRoute.ok) {
        return c.json(variantRoute.body, variantRoute.status);
      }
      const body = variantRoute ? variantRoute.context.body : rawBody;
      const approvalVariant = variantRoute ? variantRoute.context.variant : null;
      const requestId = readRequestId(body);
      if (!requestId || !runtime.readCommercialRequest(requestId)) {
        return c.json(
          { error: "request_unavailable", reasons: ["Aprobarea se cere pentru o cerere de ofertă existentă."] },
          422,
        );
      }
      const compiled = compileAcceptedProduct(runtime, c.req.param("productCode"), body);
      if (!compiled.ok) {
        return c.json(compiled.body, compiled.status);
      }
      const { right } = effectiveOfferingPriceRight(c, runtime);
      const priced = resolveProductCommercialForRequest(runtime, compiled.eic, body, right.canSetPrice);
      if (!priced.ok) {
        return c.json({ error: "price_unavailable", reasons: ["Prețul ofertei nu este valid."] }, 422);
      }
      const installationProjection = readInstallationProjection(runtime, body, priced.resolution.policy);
      const assessed = assessOffering(c, runtime, {
        truth: compiled.truth,
        productCode: compiled.truth.templateCode,
        requestId,
        variantId: approvalVariant?.variantId ?? null,
        commercialPrice: priced.commercialPrice,
        eic: compiled.eic,
        installation: installationProjection
          ? { commercial: installationProjection.commercial, eic: installationProjection.eic }
          : null,
      });
      if (!assessed.evaluation || !assessed.bindingHash) {
        return c.json(
          { error: "price_unavailable", reasons: ["Introdu și confirmă prețul înainte de a cere aprobarea."] },
          422,
        );
      }
      if (assessed.evaluation.outcome !== "APPROVAL_REQUIRED") {
        return c.json(
          {
            error: "approval_not_required",
            reasons: [commercialOfferingView(assessed.evaluation).message],
            offering: presentOffering(assessed, requestId),
          },
          409,
        );
      }
      const note = readApprovalNote(body);
      if (note === false) {
        return c.json({ error: "invalid_note", reasons: ["Nota trebuie să aibă cel mult 500 de caractere."] }, 400);
      }
      const actor = actorIdentity(c);
      const stored = runtime.requestPriceApproval(
        {
          requestId,
          productCode: compiled.truth.templateCode,
          variantId: approvalVariant?.variantId ?? null,
          bindingHash: assessed.bindingHash,
          policyVersion: assessed.evaluation.policyVersion,
          policyMode: assessed.evaluation.policyMode,
          netPrice: priced.commercialPrice.netPrice as number,
          installationNetPrice: installationProjection?.commercial.netPrice ?? null,
          internalCostComplete: Boolean(assessed.internalCostComplete),
          triggeredRules: assessed.evaluation.triggeredRules,
          note,
        },
        actor,
      );
      if (!stored.ok) {
        return c.json(
          {
            error: stored.error,
            reasons: ["Proprietarul a decis deja această variantă. Modifică oferta pentru o solicitare nouă."],
            offering: presentOffering({ ...assessed, latest: stored.approval }, requestId),
          },
          409,
        );
      }
      if (approvalVariant && !stored.alreadyRequested) {
        appendVariantEvent(runtime.assemblyPlane().db, approvalVariant, "APPROVAL_REQUESTED", actor, stored.approval.requestedAt, {
          netPrice: stored.approval.netPrice,
          detail: stored.approval.approvalId,
        });
      }
      return c.json(
        {
          created: !stored.alreadyRequested,
          offering: presentOffering({ ...assessed, latest: stored.approval }, requestId),
        },
        stored.alreadyRequested ? 200 : 201,
      );
    },
  );

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
    const rawBody = await c.req.json().catch(() => null);
    const variantRoute = resolveVariantRouteBody(c, runtime, c.req.param("productCode"), rawBody, "ISSUE");
    if (variantRoute && !variantRoute.ok) {
      return c.json(variantRoute.body, variantRoute.status);
    }
    const body = variantRoute ? variantRoute.context.body : rawBody;
    const issuedVariant = variantRoute ? variantRoute.context : null;
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
      const closed = refuseNewQuoteIfClosed(runtime.assemblyPlane().db, requestId);
      if (closed) {
        return c.json({ error: closed.error, reasons: closed.reasons }, 409);
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
      const overlap = requestStandaloneQuoteRefusal({
        productCode: compiled.truth.templateCode,
        assemblies: runtime.readRequestAssemblyWork(requestId),
        intent: readCommercialIntent(body),
      });
      if (overlap) {
        return c.json(overlap, 409);
      }
      if (!issuedVariant && listRequestVariants(runtime.assemblyPlane().db, requestId).length > 0) {
        return c.json(
          {
            error: "variant_required",
            reasons: [
              "Cererea are variante salvate. Emite oferta din varianta păstrată pe server, nu pe calea veche de înghețare.",
            ],
          },
          409,
        );
      }
    }
    const offeringRight = effectiveOfferingPriceRight(c, runtime);
    if (!offeringRight.right.canSetPrice) {
      return c.json(
        { error: "offering_not_permitted", reasons: [offeringRight.right.blockedReason ?? "Rolul tău nu poate îngheța oferta."] },
        403,
      );
    }
    const priced = resolveProductCommercialForRequest(
      runtime,
      compiled.eic,
      body,
      offeringRight.right.canSetPrice,
    );
    if (!priced.ok) {
      if ("error" in priced) {
        return c.json(
          priced.error === "invalid_quote_terms"
            ? {
                error: priced.error,
                issues: priced.issues,
                reasons: priced.issues.map((issue) => issue.reason),
              }
            : { error: priced.error, reasons: priced.reasons },
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
    const installationReadiness = requestId
      ? installationReadinessForRequest(runtime, requestId)
      : null;
    const installationForFreeze = installationReadiness
      ? projectSiteInstallationScope({
          selected: Boolean(
            installationReadiness.request?.optionalScopeIds.includes(
              SITE_INSTALLATION_SCOPE_ID,
            ),
          ),
          ...installationReadiness.readiness,
          policy: priced.resolution.policy,
        })
      : null;
    const installationFacts = installationReadiness?.readiness.facts ?? null;
    const installationMode = installationReadiness?.readiness.providerMode ?? null;
    const installationEvidence =
      installationMode === "INTERNAL"
        ? installationReadiness?.readiness.evidence?.internalLabor
        : installationReadiness?.readiness.evidence?.subcontract;
    if (
      installationForFreeze &&
      (!installationFacts || !installationMode || !installationEvidence)
    ) {
      return c.json(
        {
          error: "incomplete_offer",
          reasons: ["Montajul selectat nu are faptele necesare pentru înghețare."],
        },
        422,
      );
    }
    const frozenAt = new Date().toISOString();
    const assessed = assessOffering(c, runtime, {
      truth: compiled.truth,
      productCode: compiled.truth.templateCode,
      requestId,
      variantId: issuedVariant?.variant.variantId ?? null,
      commercialPrice,
      eic: compiled.eic,
      installation: installationForFreeze
        ? { commercial: installationForFreeze.commercial, eic: installationForFreeze.eic }
        : null,
    });
    let offeringRecord: ReturnType<typeof frozenOfferingRecordFor> | null = null;
    if (assessed.evaluation) {
      const offeringDecision = decideOfferingFreeze({
        evaluation: assessed.evaluation,
        bindingHash: assessed.bindingHash ?? "",
        latestApproval: assessed.bindingHash ? assessed.latest : null,
      });
      if (!offeringDecision.ok) {
        return c.json(
          {
            error: offeringDecision.error,
            reasons: offeringDecision.reasons,
            offering: presentOffering(assessed, requestId),
          },
          offeringDecision.error === "offering_not_permitted" ? 403 : 409,
        );
      }
      const actor = actorIdentity(c);
      // Pre-V1 behaviour is kept byte-for-byte for the Owner under the platform default policy.
      if (actor.role !== "owner" || assessed.policy.source === "ORGANIZATION") {
        offeringRecord = frozenOfferingRecordFor({
          evaluation: assessed.evaluation,
          pricedByUserId: actor.userId,
          pricedByRole: actor.role,
          approval: offeringDecision.approval,
        });
      }
    }
    let rateAcknowledgement: FrozenRateAcknowledgement | null = null;
    if (commercialPrice.completeness === "COMPLETE") {
      const requirement = assessProductRateAcknowledgement(
        runtime,
        compiled,
        commercialPrice,
        requestId,
      );
      const decision = decideRateAcknowledgement(requirement, {
        authorized: can(c, "costs.internal.manage"),
        submittedBindingHash: readRateAcknowledgementBindingHash(body),
        actorUserId: actorUserId(c),
        acknowledgedAt: frozenAt,
      });
      if (!decision.ok) {
        return c.json(
          {
            error: decision.error,
            reasons: decision.reasons,
            rateAcknowledgement: scopeRateAcknowledgementRequirement(
              requirement,
              financialAccess(c, "commercial"),
              can(c, "costs.internal.manage"),
            ),
          },
          rateAcknowledgementHttpStatus(decision.error),
        );
      }
      rateAcknowledgement = decision.acknowledgement;
    }
    const frozen = freezeQuoteSnapshot(
      compiled.truth,
      compiled.aggregate,
      compiled.composition,
      compiled.eic,
      commercialPrice,
      {
        createdAt: frozenAt,
        ...(rateAcknowledgement ? { rateAcknowledgement } : {}),
        ...(offeringRecord ? { offering: offeringRecord } : {}),
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
        ...(installationForFreeze &&
        installationFacts &&
        installationMode &&
        installationEvidence &&
        requestId
          ? {
              installation: {
                label: installationForFreeze.label,
                eic: installationForFreeze.eic,
                commercial: installationForFreeze.commercial,
                providerMode: installationMode,
                requestId,
                facts: installationFacts,
                evidence: installationEvidence,
              },
            }
          : {}),
      },
    );
    if (!frozen.ok) {
      return c.json(
        { error: frozen.error, reasons: frozen.reasons },
        422,
      );
    }
    const plane = runtime.assemblyPlane();
    let outcome: {
      ok: true;
      stored: ReturnType<ProductSystemRuntime["persistQuoteSnapshot"]>;
      linked: Extract<CommercialRequestLinkResult, { ok: true }> | null;
    } | {
      ok: false;
      error: string;
      reasons: readonly string[];
    };
    try {
      outcome = plane.db.transaction(() => {
        if (requestId) {
          const closed = refuseNewQuoteIfClosed(plane.db, requestId);
          if (closed) {
            return { ok: false as const, error: closed.error, reasons: closed.reasons };
          }
        }
        const stored = runtime.persistQuoteSnapshot(frozen.snapshot);
        if (!requestId) {
          return { ok: true as const, stored, linked: null };
        }
        const linked = runtime.linkRequestQuote(requestId, stored.snapshot.quoteSnapshotId);
        if (!linked.ok) {
          // Returning {ok:false} would commit persistQuoteSnapshot. Throw to roll back
          // a request-linked freeze so an unlinked snapshot cannot remain.
          throw new RequestLinkedQuoteRollback(presentRequestQuoteLinkFailure(linked));
        }
        if (issuedVariant) {
          // The variant becomes the issued quote in the same transaction: a quote can never be
          // frozen from a variant that someone else changed in the meantime.
          const marked = markVariantIssued(
            plane.db,
            {
              variantId: issuedVariant.variant.variantId,
              expectedVersion: issuedVariant.expectedVersion ?? issuedVariant.variant.version,
              quoteSnapshotId: stored.snapshot.quoteSnapshotId,
            },
            actorIdentity(c),
            frozenAt,
          );
          if (!marked.ok) {
            throw new RequestLinkedQuoteRollback(
              marked.error === "version_conflict"
                ? {
                    error: "version_conflict",
                    reasons: presentVariantConflict(marked.current).reasons,
                    status: 409,
                  }
                : { error: marked.error, reasons: ["Varianta nu mai poate fi emisă în starea curentă."], status: 409 },
            );
          }
        }
        return { ok: true as const, stored, linked };
      }).immediate();
    } catch (caught) {
      if (caught instanceof RequestLinkedQuoteRollback) {
        return c.json(
          { error: caught.failure.error, reasons: caught.failure.reasons },
          caught.failure.status,
        );
      }
      throw caught;
    }
    if (!outcome.ok) {
      return c.json({ error: outcome.error, reasons: outcome.reasons }, 409);
    }
    const access = financialAccess(c, "commercial");
    const quoteExperience = projectCommercialExperience({
      commercialCompleteness: outcome.stored.snapshot.commercial.completeness,
      quote: outcome.stored.snapshot,
    });
    if (!requestId) {
      return c.json({
        created: outcome.stored.created,
        quoteSnapshot: scopeQuoteSnapshot(outcome.stored.snapshot, access),
        commercialExperience: quoteExperience,
      });
    }
    if (!outcome.linked) {
      return c.json({
        error: "quote_unavailable",
        reasons: ["Oferta nu s-a putut lega de cerere."],
      }, 404);
    }
    return c.json({
      created: outcome.stored.created,
      quoteSnapshot: scopeQuoteSnapshot(outcome.stored.snapshot, access),
      commercialExperience: quoteExperience,
      requestLink: outcome.linked.link,
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
      if (snapshot.schemaVersion === 2 && !isTrustedFrozenQuoteV2ForOrder(snapshot)) {
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
    "/api/products/:productCode/quote-snapshots/:quoteSnapshotId/confirm-order",
    requireCapability("quotes.accept"),
    async (c) => {
      const runtime = getProductSystem(c);
      const snapshot = runtime.readQuoteSnapshot(c.req.param("quoteSnapshotId"));
      if (!snapshot || snapshot.productCode !== c.req.param("productCode")) {
        return c.json({ error: "not_found" }, 404);
      }
      const body = await c.req.json().catch(() => null);
      const exception = incompleteCostExceptionFromBody(c, body);
      if (exception === "forbidden") {
        return c.json({ error: "forbidden", reasons: ["Doar Proprietarul poate accepta o ofertă cu cost intern incomplet."] }, 403);
      }
      // Validate both frozen contracts before storing either record.
      const recorded = recordQuoteAcceptance(snapshot, { incompleteCost: exception });
      if (!recorded.ok) return c.json({ error: recorded.error, reasons: recorded.reasons }, 422);
      const existingAcceptance = runtime.readQuoteAcceptance(snapshot.quoteSnapshotId);
      const acceptance = existingAcceptance ?? recorded.decision;
      const frozen = freezeOrderSnapshot(snapshot, acceptance);
      if (!frozen.ok) return c.json({ error: frozen.error, reasons: frozen.reasons }, 422);
      const plane = runtime.assemblyPlane();
      const alternativeCheck = checkAlternativeAcceptance({
        db: plane.db,
        organizationId: plane.organizationId,
        quoteSnapshotId: snapshot.quoteSnapshotId,
        alreadyAccepted: existingAcceptance !== null,
        confirmed: readAlternativeAcceptanceConfirmed(body),
      });
      if (!alternativeCheck.ok) return c.json(alternativeCheck.body, alternativeCheck.status);
      const installationLine = snapshot.lines?.find((line) => line.kind === "SITE_INSTALLATION");
      const installationCheck = checkInstallationAcceptance({
        runtime,
        db: plane.db,
        organizationId: plane.organizationId,
        requestId: getCommercialRequestQuoteLinkByQuote(plane.db, snapshot.quoteSnapshotId)?.requestId,
        quoteSnapshotId: snapshot.quoteSnapshotId,
        quoteHasInstallation: Boolean(installationLine),
        quoteInstallationNet:
          installationLine && "commercial" in installationLine ? (installationLine.commercial?.netPrice ?? null) : null,
        alreadyAccepted: existingAcceptance !== null,
        decision: readInstallationDecision(body),
        actor: actorIdentity(c),
      });
      if (!installationCheck.ok) return c.json(installationCheck.body, installationCheck.status);
      const stored = plane.db.transaction(() => {
        const link = getCommercialRequestQuoteLinkByQuote(plane.db, snapshot.quoteSnapshotId);
        const refusal = refuseAcceptIfDispositioned(
          plane.db,
          plane.organizationId,
          link?.requestId,
          snapshot.quoteSnapshotId,
        );
        if (refusal) {
          return { blocked: true as const, error: refusal.error, reasons: refusal.reasons };
        }
        installationCheck.record?.();
        runtime.persistQuoteAcceptance(acceptance);
        const order = runtime.persistOrderSnapshot(frozen.snapshot);
        installationCheck.onOrderCreated?.(order.snapshot.orderSnapshotId);
        return { blocked: false as const, order };
      }).immediate();
      if (stored.blocked) {
        return c.json({ error: stored.error, reasons: stored.reasons }, 422);
      }
      return c.json({ created: stored.order.created,
        orderSnapshot: scopeOrderSnapshot(stored.order.snapshot, financialAccess(c, "commercial")) });
    },
  );

  app.post(
    "/api/products/:productCode/quote-snapshots/:quoteSnapshotId/acceptance",
    requireCapability("quotes.accept"),
    async (c) => {
      const runtime = getProductSystem(c);
      const snapshot = runtime.readQuoteSnapshot(c.req.param("quoteSnapshotId"));
      if (!snapshot || snapshot.productCode !== c.req.param("productCode")) {
        return c.json({ error: "not_found" }, 404);
      }
      const body = await c.req.json().catch(() => null);
      const exception = incompleteCostExceptionFromBody(c, body);
      if (exception === "forbidden") {
        return c.json({ error: "forbidden", reasons: ["Doar Proprietarul poate accepta o ofertă cu cost intern incomplet."] }, 403);
      }
      const recorded = recordQuoteAcceptance(snapshot, { incompleteCost: exception });
      if (!recorded.ok) {
        return c.json(
          { error: recorded.error, reasons: recorded.reasons },
          422,
        );
      }
      const plane = runtime.assemblyPlane();
      const alreadyAccepted = runtime.readQuoteAcceptance(snapshot.quoteSnapshotId) !== null;
      const alternativeCheck = checkAlternativeAcceptance({
        db: plane.db,
        organizationId: plane.organizationId,
        quoteSnapshotId: snapshot.quoteSnapshotId,
        alreadyAccepted,
        confirmed: readAlternativeAcceptanceConfirmed(body),
      });
      if (!alternativeCheck.ok) return c.json(alternativeCheck.body, alternativeCheck.status);
      const installationLine = snapshot.lines?.find((line) => line.kind === "SITE_INSTALLATION");
      const installationCheck = checkInstallationAcceptance({
        runtime,
        db: plane.db,
        organizationId: plane.organizationId,
        requestId: getCommercialRequestQuoteLinkByQuote(plane.db, snapshot.quoteSnapshotId)?.requestId,
        quoteSnapshotId: snapshot.quoteSnapshotId,
        quoteHasInstallation: Boolean(installationLine),
        quoteInstallationNet:
          installationLine && "commercial" in installationLine ? (installationLine.commercial?.netPrice ?? null) : null,
        alreadyAccepted,
        decision: readInstallationDecision(body),
        actor: actorIdentity(c),
      });
      if (!installationCheck.ok) return c.json(installationCheck.body, installationCheck.status);
      const stored = plane.db.transaction(() => {
        const link = getCommercialRequestQuoteLinkByQuote(plane.db, snapshot.quoteSnapshotId);
        const refusal = refuseAcceptIfDispositioned(
          plane.db,
          plane.organizationId,
          link?.requestId,
          snapshot.quoteSnapshotId,
        );
        if (refusal) {
          return { blocked: true as const, error: refusal.error, reasons: refusal.reasons };
        }
        installationCheck.record?.();
        return { blocked: false as const, acceptance: runtime.persistQuoteAcceptance(recorded.decision) };
      }).immediate();
      if (stored.blocked) {
        return c.json({ error: stored.error, reasons: stored.reasons }, 422);
      }
      return c.json({
        created: stored.acceptance.created,
        acceptanceDecision: stored.acceptance.decision,
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
    requireCapability("quotes.accept"),
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
      const plane = runtime.assemblyPlane();
      const stored = plane.db.transaction(() => {
        const order = runtime.persistOrderSnapshot(frozen.snapshot);
        completePendingCommonInstallation(
          plane.db,
          snapshot.quoteSnapshotId,
          order.snapshot.orderSnapshotId,
          actorIdentity(c),
        );
        return order;
      }).immediate();
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
    requireCapability("production.release"),
    (c) => {
      const runtime = getProductSystem(c);
      const orderSnapshot = runtime.readOrderSnapshot(c.req.param("orderSnapshotId"));
      if (!orderSnapshot || orderSnapshot.productCode !== c.req.param("productCode")) {
        return c.json({ error: "not_found" }, 404);
      }
      const plane = runtime.assemblyPlane();
      const requestId = getCommercialRequestQuoteLinkByQuote(plane.db, orderSnapshot.sourceQuoteSnapshotId)?.requestId;
      const frozen = freezeProductionReleaseFromOrder(orderSnapshot, {
        skipSiteInstallationOperation: skipSiteInstallationForOrder(plane.db, requestId, orderSnapshot.orderSnapshotId),
      });
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
    requireCapability("production.release"),
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
      canConfirmMaterial: can(c, "execution.supervise"),
      executionPlan: presentScopedExecutionPlan(
        c,
        projectPlanView(
          runtime,
          record,
          session.ok ? session.person.personId : null,
          can(c, "planning.manage"),
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
      siteInstallation: snapshot?.siteInstallation ?? assemblyProduction?.siteInstallation ?? null,
    });
  });

  app.post("/api/execution-tasks/:taskId/provider", requireCapability("planning.manage"), async (c) => {
    const runtime = getProductSystem(c);
    const providerId = readProviderId(await c.req.json());
    if (!providerId) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const session = runtime.resolveOperatorSession(getCookie(c, OPERATOR_SESSION_COOKIE));
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/provider");
    const boundAt = new Date().toISOString();
    return respondTaskMutation(
      c,
      runtime,
      runtime.assignExecutionTaskProvider(taskId, providerId, {
        source: "MANUAL",
        boundAt,
        accountId: actorUserId(c),
        operatorId: session.ok ? session.person.personId : null,
      }),
      {
        taskId,
        operatorId: session.ok ? session.person.personId : null,
      },
    );
  });

  app.post("/api/execution-tasks/:taskId/bind-unique-provider", (c) => {
    const runtime = getProductSystem(c);
    const session = runtime.resolveOperatorSession(getCookie(c, OPERATOR_SESSION_COOKIE));
    if (!session.ok && !can(c, "planning.manage")) {
      return c.json({ error: "invalid_session" }, 403);
    }
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/bind-unique-provider");
    return respondTaskMutation(
      c,
      runtime,
      runtime.bindUniqueExecutionProvider(taskId, {
        source: "AUTO_UNIQUE",
        boundAt: new Date().toISOString(),
        accountId: actorUserId(c),
        operatorId: session.ok ? session.person.personId : null,
      }),
      { taskId, operatorId: session.ok ? session.person.personId : null },
    );
  });

  app.post("/api/execution-tasks/:taskId/planned-effort", requireCapability("planning.manage"), async (c) => {
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

  app.post("/api/execution-tasks/:taskId/executor", requireCapability("planning.manage"), async (c) => {
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
    const plan = runtime.readExecutionPlanByTaskId(taskId);
    const task = plan?.tasks.find((item) => item.taskId === taskId);
    if (plan && task) {
      const plane = runtime.assemblyPlane();
      const blocked = holderInstallationStartBlocked(plane.db, plane.organizationId, plan.plan.sourceSnapshotId, task.processId);
      if (blocked.blocked) {
        return c.json({ error: "installation_group_not_ready", reasons: blocked.reasons }, 409);
      }
    }
    const boundAt = new Date().toISOString();
    return respondTaskMutation(
      c,
      runtime,
      runtime.claimAndStartExecutionTask(taskId, session.person.personId, {
        source: "AUTO_UNIQUE",
        boundAt,
        accountId: actorUserId(c),
        operatorId: session.person.personId,
      }),
      { taskId, operatorId: session.person.personId },
    );
  });

  app.post("/api/execution-tasks/:taskId/leave", (c) => {
    const runtime = getProductSystem(c);
    const session = runtime.resolveOperatorSession(getCookie(c, OPERATOR_SESSION_COOKIE));
    if (!session.ok) return c.json({ error: "invalid_session" }, 401);
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/leave");
    return respondTaskMutation(c, runtime, runtime.leaveExecutionWork(taskId, session.person.personId, new Date().toISOString()),
      { taskId, operatorId: session.person.personId });
  });

  app.post("/api/execution-tasks/:taskId/quality-fail", async (c) => {
    const runtime = getProductSystem(c);
    const session = runtime.resolveOperatorSession(getCookie(c, OPERATOR_SESSION_COOKIE));
    if (!session.ok) {
      return c.json({ error: "invalid_session" }, 401);
    }
    const note = readOptionalNote(await c.req.json().catch(() => ({})));
    if (note === false) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/quality-fail");
    return respondTaskMutation(
      c,
      runtime,
      runtime.recordQualityFail(taskId, session.person.personId, note, new Date().toISOString()),
      { taskId, operatorId: session.person.personId },
    );
  });

  app.post("/api/execution-tasks/:taskId/quality-pass", async (c) => {
    const runtime = getProductSystem(c);
    const session = runtime.resolveOperatorSession(getCookie(c, OPERATOR_SESSION_COOKIE));
    if (!session.ok) {
      return c.json({ error: "invalid_session" }, 401);
    }
    const note = readOptionalNote(await c.req.json().catch(() => ({})));
    if (note === false) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/quality-pass");
    return respondTaskMutation(
      c,
      runtime,
      runtime.recordQualityPass(taskId, session.person.personId, note, new Date().toISOString()),
      { taskId, operatorId: session.person.personId },
    );
  });

  app.post("/api/execution-tasks/:taskId/rework-close", requireCapability("execution.supervise"), async (c) => {
    const runtime = getProductSystem(c);
    const note = readOptionalNote(await c.req.json().catch(() => ({})));
    if (note === false) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/rework-close");
    return respondTaskMutation(
      c,
      runtime,
      runtime.closeQualityReworkEpisode(taskId, note, actorUserId(c), new Date().toISOString()),
      { taskId },
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

  app.post("/api/execution-tasks/:taskId/external", requireCapability("planning.manage"), (c) => {
    const runtime = getProductSystem(c);
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/external");
    return respondTaskMutation(
      c,
      runtime,
      runtime.markExecutionTaskExternal(taskId, actorUserId(c), new Date().toISOString()),
      { taskId },
    );
  });

  app.post("/api/execution-tasks/:taskId/external-provider", requireCapability("planning.manage"), async (c) => {
    const runtime = getProductSystem(c);
    const providerId = readProviderId(await c.req.json().catch(() => null));
    if (!providerId) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/external-provider");
    return respondTaskMutation(
      c,
      runtime,
      runtime.assignExternalProductionProvider(taskId, providerId),
      { taskId },
    );
  });

  app.post("/api/execution-tasks/:taskId/hand-off", requireCapability("planning.manage"), (c) => {
    const runtime = getProductSystem(c);
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/hand-off");
    return respondTaskMutation(
      c,
      runtime,
      runtime.handOffExternalExecutionTask(taskId, actorUserId(c), new Date().toISOString()),
      { taskId },
    );
  });

  app.post("/api/execution-tasks/:taskId/external-return", requireCapability("planning.manage"), (c) => {
    const runtime = getProductSystem(c);
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/external-return");
    return respondTaskMutation(
      c,
      runtime,
      runtime.recordExternalExecutionReturn(taskId, actorUserId(c), new Date().toISOString()),
      { taskId },
    );
  });

  app.post("/api/execution-tasks/:taskId/machine-runs/start", (c) => {
    const runtime = getProductSystem(c);
    const session = runtime.resolveOperatorSession(getCookie(c, OPERATOR_SESSION_COOKIE));
    if (!session.ok) {
      return c.json({ error: "invalid_session" }, 401);
    }
    const taskId = httpPathIdentity(c.req.path, "/api/execution-tasks/", "/machine-runs/start");
    return respondTaskMutation(
      c,
      runtime,
      runtime.startMachineRun(taskId, session.person.personId),
      { taskId, operatorId: session.person.personId },
    );
  });

  app.post("/api/execution-machine-runs/:machineRunId/stop", (c) => {
    const runtime = getProductSystem(c);
    const session = runtime.resolveOperatorSession(getCookie(c, OPERATOR_SESSION_COOKIE));
    if (!session.ok) {
      return c.json({ error: "invalid_session" }, 401);
    }
    const machineRunId = httpPathIdentity(c.req.path, "/api/execution-machine-runs/", "/stop");
    return respondTaskMutation(
      c,
      runtime,
      runtime.stopMachineRun(machineRunId, session.person.personId),
      { operatorId: session.person.personId },
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

export function refuseDisabledNewWork(
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

function readOptionalNote(body: unknown): unknown | false {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return false;
  }
  if (!("note" in body)) {
    return undefined;
  }
  const note = (body as { note: unknown }).note;
  if (note !== undefined && note !== null && typeof note !== "string") {
    return false;
  }
  return note;
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
    actualDurationMinutes?: unknown;
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
  if (
    "actualDurationMinutes" in record &&
    record.actualDurationMinutes !== undefined &&
    record.actualDurationMinutes !== null &&
    typeof record.actualDurationMinutes !== "number"
  ) {
    return null;
  }
  return {
    ...(typeof record.completedQuantity === "number"
      ? { completedQuantity: record.completedQuantity }
      : {}),
    ...(typeof record.note === "string" ? { note: record.note } : {}),
    ...(actualConsumption ? { actualConsumption } : {}),
    ...("actualDurationMinutes" in record
      ? { actualDurationMinutes: record.actualDurationMinutes as number | null }
      : {}),
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
    case "machine_run_not_found":
    case "external_provider_not_found":
      return 404;
    case "ineligible_provider":
    case "missing_assignment":
    case "no_eligible_provider":
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
    case "invalid_actual_duration":
      return 422;
    case "reassignment_locked":
    case "effort_frozen":
    case "already_started_by_other":
    case "dependencies_incomplete":
    case "material_not_ready":
    case "invalid_transition":
    case "machine_run_not_allowed":
    case "machine_run_active":
    case "machine_busy":
    case "active_work_elsewhere":
    case "active_participants":
    case "machine_run_closed":
    case "external_production_disabled":
    case "task_not_planned":
    case "task_not_external":
    case "task_not_outside":
    case "external_provider_inactive":
    case "explicit_provider_choice_required":
      return 409;
    case "external_provider_required":
      return 422;
    case "quality_result_required":
    case "quality_correction_open":
    case "quality_control_not_externalizable":
      return 409;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

/**
 * AUD-PRICING-002: `incompleteCostAcceptance: { confirm: true, reason }` in the body. The actor
 * comes from the authenticated session; the capability is separate from price-exception approval.
 */
function readApprovalNote(body: unknown): string | null | false {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>).approvalNote : undefined;
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.length > 500 ? false : trimmed;
}

export function actorUserId(c: ApiContext): string {
  return c.get("cloudUser")?.userId ?? "local";
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
  viewerIsOwner = false,
) {
  return projectExecutionPlanView(
    record,
    runtime.listPeople(),
    runtime.readProductionSnapshot(record.plan.sourceSnapshotId),
    runtime.peopleEligibilityContext(),
    currentOperatorId,
    runtime.providerRegistry,
    runtime.materialReadinessContext(),
    runtime.externalProductionContext(),
    runtime.qualityControlProjection(record.plan.planId, viewerIsOwner),
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
      projectPlanView(runtime, result.record, operatorId, can(c, "planning.manage")),
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
