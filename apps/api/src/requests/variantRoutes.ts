import {
  approvalViewFor,
  deriveQuoteVariantAction,
  deriveQuoteVariantState,
  evaluateOfferingPolicy,
  journalChannelLabel,
  journalEntryKindLabel,
  journalVatBasisLabel,
  priceApprovalStatusLabel,
  projectConfigurationPreview,
  projectLiveJobCommercial,
  quoteVariantActionLabel,
  quoteVariantNeedsActor,
  quoteVariantStateLabel,
  technicalSettingDefinitionsForTemplate,
  validateJournalEntryInput,
  type ApprovalView,
  type OfferingOutcome,
  type QuoteVariantState,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { can, getProductSystem, type ApiContext, type ApiEnv } from "../cloud/context.js";
import { requireCapability } from "../cloud/middleware.js";
import { refuseNewQuoteIfClosed } from "../commercial/closureStore.js";
import { actorIdentity, effectiveOfferingPriceRight } from "../commercial/offeringAccess.js";
import {
  asDraftValues,
  assessOffering,
  compileAcceptedProduct,
  presentOffering,
  readInstallationProjection,
  refuseDisabledNewWork,
  resolveProductCommercialForRequest,
} from "../product.js";
import type { ProductSystemRuntime } from "../productSystem/runtime.js";
import { presentVariantConflict } from "./variantContext.js";
import {
  appendJournalEntry,
  appendVariantEvent,
  createVariant,
  listJournalEntries,
  listRequestVariantEvents,
  listRequestVariants,
  readJournalEntry,
  readVariant,
  saveVariantDraft,
  setVariantLifecycle,
  setVariantPrice,
  variantsAvailable,
  type JournalEntryRecord,
  type VariantRecord,
  type VariantWriteFailure,
} from "./variantStore.js";

/**
 * Commercial Continuity V2 · quote variants of a request and the commercial journal.
 * The state label and the single action of a variant are decided here, on the server, for the
 * signed-in actor. Internal cost, margins and rules never leave this module for a role without
 * financial access: only the outcome of the policy does.
 */

const NOTES_MAX_LENGTH = 1000;
const PRICE_MAX = 100_000_000;

export type VariantStaleCause = "CONFIGURATION" | "PRODUCT_PRICE" | "INSTALLATION_PRICE" | "POLICY";

function staleCauseLabel(cause: VariantStaleCause): string {
  switch (cause) {
    case "CONFIGURATION":
      return "Aprobarea nu mai acoperă această variantă: configurația a fost modificată.";
    case "PRODUCT_PRICE":
      return "Aprobarea nu mai acoperă această variantă: prețul produsului s-a schimbat.";
    case "INSTALLATION_PRICE":
      return "Aprobarea nu mai acoperă această variantă: prețul montajului s-a schimbat.";
    case "POLICY":
      return "Aprobarea nu mai acoperă această variantă: regulile de ofertare ale firmei s-au schimbat.";
    default: {
      const _exhaustive: never = cause;
      return _exhaustive;
    }
  }
}

function indexLabel(index: number): string {
  return String(index).padStart(2, "0");
}

function inscriptionOf(variant: VariantRecord): string | null {
  const value = variant.values["root.inscription"];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function authorActor(role: "owner" | "member" | null) {
  return { canSetPriceByRole: role === "owner", mayUseOfferingPolicy: true };
}

export type VariantDescription = ReturnType<typeof describeVariant>;

/**
 * Everything the interface shows about a variant, for the current actor. Compiles the saved
 * values with the engine; nothing is derived in the browser.
 */
export function describeVariant(
  c: ApiContext,
  runtime: ProductSystemRuntime,
  variant: VariantRecord,
  siblings: readonly VariantRecord[],
) {
  const presented = runtime.present();
  const template = presented.template(variant.productCode);
  const formSchema = presented.formSchema(variant.productCode);
  const productAvailable = Boolean(template && formSchema) && !refuseDisabledNewWork(runtime, variant.productCode);
  const right = effectiveOfferingPriceRight(c, runtime);
  const actor = actorIdentity(c);
  const canConfigure = can(c, "quotes.create");
  const canApprove = can(c, "quotes.price_exception.approve");
  // The official price is shown to whoever may set it, and to the Owner. A role without the price
  // right does not see a price before the quote is issued (R2 K6, pending an Owner decision).
  const priceVisible = right.right.canSetPrice || actor.role === "owner";

  let missingCount = 0;
  let currentReviewId: string | null = null;
  if (template && formSchema) {
    const technical = runtime.resolveTechnicalSettings({
      requiredDefinitions: technicalSettingDefinitionsForTemplate(template),
    });
    const formulas = runtime.resolveFormulas();
    if (technical.ok && formulas.ok) {
      const preview = projectConfigurationPreview(
        template,
        formSchema,
        { templateCode: variant.productCode, values: asDraftValues(variant.values) },
        technical.settings,
        formulas.formulas,
      );
      missingCount = preview.missing.length;
      currentReviewId = preview.reviewId;
    }
  }
  const confirmed = variant.confirmedReviewId !== null;
  const confirmationValid = confirmed && currentReviewId !== null && currentReviewId === variant.confirmedReviewId;
  const pricePresent = variant.productNetPrice !== null;
  const priceForConfirmedConfiguration = pricePresent && confirmed && variant.priceReviewId === variant.confirmedReviewId;

  let actorOutcome: OfferingOutcome | null = null;
  let priceAuthorOutcome: OfferingOutcome | null = null;
  let bindingHash: string | null = null;
  let offering: ReturnType<typeof presentOffering> | null = null;
  let totals: { netPrice: number; vatAmount: number; grossPrice: number; currency: string } | null = null;
  let installationNetPrice: number | null = null;
  let latest = runtime.readLatestPriceApproval(variant.requestId, variant.productCode, variant.variantId);

  if (!variant.quoteSnapshotId && variant.lifecycle === "ACTIVE" && productAvailable && confirmationValid) {
    const body = {
      values: variant.values,
      reviewId: variant.confirmedReviewId,
      requestId: variant.requestId,
      ...(priceForConfirmedConfiguration ? { manualProductNetPrice: variant.productNetPrice } : {}),
    };
    const compiled = compileAcceptedProduct(runtime, variant.productCode, body);
    if (compiled.ok) {
      // The stored price was authorized when it was saved; it is evaluated as stored.
      const priced = resolveProductCommercialForRequest(runtime, compiled.eic, body, true);
      if (priced.ok) {
        const installation = readInstallationProjection(runtime, body, priced.resolution.policy);
        installationNetPrice = installation?.commercial.netPrice ?? null;
        const assessed = assessOffering(c, runtime, {
          truth: compiled.truth,
          productCode: compiled.truth.templateCode,
          requestId: variant.requestId,
          variantId: variant.variantId,
          commercialPrice: priced.commercialPrice,
          eic: compiled.eic,
          installation: installation ? { commercial: installation.commercial, eic: installation.eic } : null,
        });
        bindingHash = assessed.bindingHash;
        latest = assessed.latest ?? latest;
        actorOutcome = assessed.evaluation?.outcome ?? null;
        offering = presentOffering(assessed, variant.requestId);
        if (assessed.inputs) {
          priceAuthorOutcome = evaluateOfferingPolicy({
            policy: assessed.policy,
            actor: authorActor(variant.priceSetByRole),
            netPrice: assessed.inputs.netPrice,
            internalCost: assessed.inputs.internalCost,
            internalCostComplete: assessed.inputs.internalCostComplete,
          }).outcome;
        }
        const product = priced.commercialPrice;
        if (product.completeness === "COMPLETE" && product.netPrice !== null && product.grossPrice != null && product.vatAmount != null) {
          const combined = installation ? projectLiveJobCommercial(product, installation.commercial) : null;
          totals = combined
            ? {
                netPrice: combined.netPrice,
                vatAmount: combined.vatAmount,
                grossPrice: combined.grossPrice,
                currency: product.currency,
              }
            : installation
              ? null
              : {
                  netPrice: product.netPrice,
                  vatAmount: product.vatAmount,
                  grossPrice: product.grossPrice,
                  currency: product.currency,
                };
        }
      }
    }
  }

  // An approval whose subject changed is stale even when the variant can no longer be bound.
  let approval: ApprovalView = approvalViewFor(latest, bindingHash);
  if (
    latest &&
    bindingHash === null &&
    !variant.quoteSnapshotId &&
    (latest.status === "REQUESTED" || latest.status === "APPROVED")
  ) {
    approval = { ...approval, status: "STALE", statusLabel: priceApprovalStatusLabel("STALE") };
  }
  let staleCause: VariantStaleCause | null = null;
  if (approval.status === "STALE" && latest) {
    const policyVersion = right.policy.version;
    staleCause =
      latest.policyVersion !== policyVersion
        ? "POLICY"
        : !confirmationValid || !priceForConfirmedConfiguration
          ? "CONFIGURATION"
          : latest.netPrice !== variant.productNetPrice
            ? "PRODUCT_PRICE"
            : latest.installationNetPrice !== installationNetPrice
              ? "INSTALLATION_PRICE"
              : "CONFIGURATION";
  }

  const state: QuoteVariantState = deriveQuoteVariantState({
    lifecycle: variant.lifecycle,
    issued: variant.quoteSnapshotId !== null,
    productAvailable,
    missingCount,
    confirmed,
    confirmationValid,
    pricePresent,
    priceForConfirmedConfiguration,
    priceAuthorOutcome,
    approvalStatus: approval.status,
  });
  const action = deriveQuoteVariantAction(state, {
    canConfigure,
    canSetPrice: right.right.canSetPrice,
    canApprove,
    outcome: actorOutcome,
  });
  const origin = variant.alternativeOfVariantId
    ? siblings.find((item) => item.variantId === variant.alternativeOfVariantId) ?? null
    : null;

  return {
    variantId: variant.variantId,
    requestId: variant.requestId,
    index: variant.registrationIndex,
    indexLabel: indexLabel(variant.registrationIndex),
    productCode: variant.productCode,
    productLabel: template?.label ?? variant.productCode,
    inscription: inscriptionOf(variant),
    alternativeOf: origin
      ? { variantId: origin.variantId, indexLabel: indexLabel(origin.registrationIndex) }
      : null,
    lifecycle: variant.lifecycle,
    version: variant.version,
    state,
    stateLabel: quoteVariantStateLabel(state, missingCount),
    action,
    actionLabel: quoteVariantActionLabel(action),
    needsAction: quoteVariantNeedsActor(action),
    missingCount,
    confirmation: confirmed
      ? { confirmedAt: variant.confirmedAt, confirmedByLabel: variant.confirmedByLabel, valid: confirmationValid }
      : null,
    priceVisible,
    price:
      priceVisible && pricePresent
        ? {
            netPrice: variant.productNetPrice,
            forConfirmedConfiguration: priceForConfirmedConfiguration,
            setAt: variant.priceSetAt,
            setByLabel: variant.priceSetByLabel,
            setByRole: variant.priceSetByRole,
          }
        : null,
    canSetPrice: right.right.canSetPrice,
    priceBlockedReason: right.right.blockedReason,
    totals: priceVisible ? totals : null,
    installationNetPrice: priceVisible ? installationNetPrice : null,
    offering,
    approval: {
      ...approval,
      staleCause,
      staleReason: staleCause ? staleCauseLabel(staleCause) : null,
      approvalId: canApprove && latest ? latest.approvalId : null,
      requestNote: latest?.requestNote ?? null,
    },
    notes: variant.notes,
    quoteSnapshotId: variant.quoteSnapshotId,
    issuedAt: variant.issuedAt,
    issuedByLabel: variant.issuedByLabel,
    createdAt: variant.createdAt,
    createdByLabel: variant.createdByLabel,
    updatedAt: variant.updatedAt,
    updatedByLabel: variant.updatedByLabel,
    /** Server-side only: stripped by `presentVariant` before any response. */
    bindingHash,
  };
}

function presentVariant(description: VariantDescription) {
  const { bindingHash: _bindingHash, ...rest } = description;
  return rest;
}

/** The binding the Owner's decision must match (F15): the variant as it is stored now. */
export function currentVariantBindingHash(
  c: ApiContext,
  runtime: ProductSystemRuntime,
  variantId: string,
): { variant: VariantRecord; bindingHash: string | null } | null {
  const db = runtime.assemblyPlane().db;
  const variant = readVariant(db, variantId);
  if (!variant) return null;
  const description = describeVariant(c, runtime, variant, listRequestVariants(db, variant.requestId));
  return { variant, bindingHash: description.bindingHash };
}

function writeFailure(failure: VariantWriteFailure): { status: 404 | 409 | 422; body: Record<string, unknown> } {
  switch (failure.error) {
    case "not_found":
      return { status: 404, body: { error: "not_found" } };
    case "version_conflict":
      return { status: 409, body: presentVariantConflict(failure.current) };
    case "variant_issued":
      return {
        status: 409,
        body: {
          error: "variant_issued",
          reasons: [
            `Oferta acestei variante a fost emisă de ${failure.current.issuedByLabel ?? "altcineva"}. Varianta nu mai poate fi modificată.`,
          ],
          quoteSnapshotId: failure.current.quoteSnapshotId,
        },
      };
    case "variant_withdrawn":
      return { status: 409, body: { error: "variant_withdrawn", reasons: ["Varianta este retrasă. Reia-o înainte de a continua."] } };
    case "not_confirmed":
      return {
        status: 422,
        body: { error: "variant_not_confirmed", reasons: ["Configurația trebuie confirmată înainte de preț."] },
      };
    default: {
      const _exhaustive: never = failure;
      return _exhaustive;
    }
  }
}

function readExpectedVersion(body: Record<string, unknown> | null): number | null {
  const value = body?.expectedVersion;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

function loadVariant(c: ApiContext, runtime: ProductSystemRuntime) {
  const db = runtime.assemblyPlane().db;
  const variant = readVariant(db, c.req.param("variantId") ?? "");
  if (!variant || variant.requestId !== c.req.param("requestId")) return null;
  return variant;
}

function presentJournal(
  c: ApiContext,
  runtime: ProductSystemRuntime,
  requestId: string,
) {
  const db = runtime.assemblyPlane().db;
  const variants = listRequestVariants(db, requestId);
  const labelOf = (variantId: string | null) => {
    const variant = variantId ? variants.find((item) => item.variantId === variantId) : null;
    return variant ? indexLabel(variant.registrationIndex) : null;
  };
  const entries = listJournalEntries(db, requestId);
  const rectifiedBy = new Map<string, JournalEntryRecord>();
  for (const entry of entries) {
    if (entry.rectifiesEntryId) rectifiedBy.set(entry.rectifiesEntryId, entry);
  }
  const right = effectiveOfferingPriceRight(c, runtime).right;
  const officialAmountsVisible = right.canSetPrice || actorIdentity(c).role === "owner";
  const manual = entries.map((entry) => {
    const correction = rectifiedBy.get(entry.entryId) ?? null;
    return {
      source: "PERSON" as const,
      entryId: entry.entryId,
      kind: entry.kind,
      kindLabel: journalEntryKindLabel(entry.kind),
      // A discussed price is never an offer; the interface always shows this next to it.
      binding: entry.kind === "DISCUSSED_PRICE" ? "fără angajament" : null,
      occurredAt: entry.discussedAt,
      recordedAt: entry.recordedAt,
      authorLabel: entry.authorLabel,
      channel: entry.channel,
      channelLabel: journalChannelLabel(entry.channel),
      interlocutor: entry.interlocutor,
      amountMin: entry.amountMin,
      amountMax: entry.amountMax,
      currency: entry.currency,
      vatBasis: entry.vatBasis,
      vatBasisLabel: entry.vatBasis ? journalVatBasisLabel(entry.vatBasis) : null,
      notes: entry.notes,
      variantId: entry.variantId,
      variantIndexLabel: labelOf(entry.variantId),
      rectifiesEntryId: entry.rectifiesEntryId,
      rectificationReason: entry.rectificationReason,
      rectifiedBy: correction
        ? { entryId: correction.entryId, authorLabel: correction.authorLabel, recordedAt: correction.recordedAt }
        : null,
    };
  });
  const official = listRequestVariantEvents(db, requestId).flatMap((event) => {
    const kind =
      event.kind === "PRICE_SET"
        ? event.detail === "SET"
          ? ("PRICE_SET" as const)
          : ("PRICE_PROPOSED" as const)
        : event.kind === "APPROVAL_REQUESTED"
          ? ("APPROVAL_REQUESTED" as const)
          : event.kind === "APPROVED"
            ? ("PRICE_APPROVED" as const)
            : event.kind === "REJECTED"
              ? ("APPROVAL_REJECTED" as const)
              : event.kind === "ISSUED"
                ? ("QUOTE_ISSUED" as const)
                : null;
    if (!kind) return [];
    const kindLabel =
      kind === "PRICE_SET"
        ? "Preț stabilit"
        : kind === "PRICE_PROPOSED"
          ? "Preț propus"
          : kind === "APPROVAL_REQUESTED"
            ? "Trimisă spre aprobare"
            : kind === "PRICE_APPROVED"
              ? "Preț aprobat"
              : kind === "APPROVAL_REJECTED"
                ? "Respinsă"
                : "Ofertă emisă";
    return [
      {
        source: "APPLICATION" as const,
        entryId: event.eventId,
        kind,
        kindLabel,
        occurredAt: event.occurredAt,
        authorLabel: event.actorLabel,
        // The official price of an unissued variant follows the price visibility of the variant.
        netPrice: officialAmountsVisible || kind === "QUOTE_ISSUED" ? event.netPrice : null,
        currency: "EUR",
        variantId: event.variantId,
        variantIndexLabel: labelOf(event.variantId),
      },
    ];
  });
  return { entries: manual, officialEvents: official };
}

export function registerVariantRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/requests/:requestId/variants", requireCapability("quotes.create"), (c) => {
    const runtime = getProductSystem(c);
    const requestId = c.req.param("requestId");
    if (!runtime.readCommercialRequest(requestId)) return c.json({ error: "not_found" }, 404);
    const db = runtime.assemblyPlane().db;
    const variants = listRequestVariants(db, requestId);
    return c.json({
      available: variantsAvailable(db),
      variants: variants.map((variant) => presentVariant(describeVariant(c, runtime, variant, variants))),
    });
  });

  app.post("/api/requests/:requestId/variants", requireCapability("quotes.create"), async (c) => {
    const runtime = getProductSystem(c);
    const requestId = c.req.param("requestId");
    const request = runtime.readCommercialRequest(requestId);
    if (!request) return c.json({ error: "not_found" }, 404);
    const db = runtime.assemblyPlane().db;
    if (!variantsAvailable(db)) {
      return c.json({ error: "variants_unavailable", reasons: ["Variantele de ofertă nu sunt disponibile pe acest mediu."] }, 409);
    }
    if (request.status === "CANCELLED") {
      return c.json({ error: "request_cancelled", reasons: ["Cererea anulată nu poate primi o variantă nouă."] }, 422);
    }
    const closed = refuseNewQuoteIfClosed(db, requestId);
    if (closed) return c.json({ error: closed.error, reasons: closed.reasons }, 409);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const siblings = listRequestVariants(db, requestId);
    const copyFromId = typeof body?.copyFromVariantId === "string" ? body.copyFromVariantId : null;
    const copyFrom = copyFromId ? siblings.find((item) => item.variantId === copyFromId) ?? null : null;
    if (copyFromId && !copyFrom) return c.json({ error: "not_found" }, 404);
    const productCode = copyFrom?.productCode ?? (typeof body?.productCode === "string" ? body.productCode : "");
    const presented = runtime.present();
    if (!productCode || !presented.template(productCode) || !presented.formSchema(productCode)) {
      return c.json({ error: "invalid_product", reasons: ["Alege un produs oferit de firmă."] }, 400);
    }
    const blocked = refuseDisabledNewWork(runtime, productCode);
    if (blocked) return c.json(blocked.body, blocked.status);
    const alternativeOfId =
      typeof body?.alternativeOfVariantId === "string" ? body.alternativeOfVariantId : (copyFrom?.variantId ?? null);
    if (alternativeOfId && !siblings.some((item) => item.variantId === alternativeOfId)) {
      return c.json({ error: "invalid_alternative", reasons: ["Alternativa trebuie să fie a unei variante din aceeași cerere."] }, 400);
    }
    const created = createVariant(
      db,
      {
        requestId,
        productCode,
        alternativeOfVariantId: alternativeOfId,
        // A copy carries the technical values only: never the price, confirmation or approval.
        values: copyFrom ? copyFrom.values : asDraftValues(body?.values ?? {}),
      },
      actorIdentity(c),
    );
    const all = listRequestVariants(db, requestId);
    return c.json({ variant: presentVariant(describeVariant(c, runtime, created, all)), values: created.values }, 201);
  });

  app.get("/api/requests/:requestId/variants/:variantId", requireCapability("quotes.create"), (c) => {
    const runtime = getProductSystem(c);
    const variant = loadVariant(c, runtime);
    if (!variant) return c.json({ error: "not_found" }, 404);
    const db = runtime.assemblyPlane().db;
    return c.json({
      variant: presentVariant(describeVariant(c, runtime, variant, listRequestVariants(db, variant.requestId))),
      values: variant.values,
      confirmedReviewId: variant.confirmedReviewId,
    });
  });

  app.patch("/api/requests/:requestId/variants/:variantId", requireCapability("quotes.create"), async (c) => {
    const runtime = getProductSystem(c);
    const variant = loadVariant(c, runtime);
    if (!variant) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const expectedVersion = readExpectedVersion(body);
    if (!body || expectedVersion === null) {
      return c.json({ error: "invalid_payload", reasons: ["Versiunea variantei lipsește."] }, 400);
    }
    let notes: string | null | undefined;
    if ("notes" in body) {
      if (body.notes === null) notes = null;
      else if (typeof body.notes === "string" && body.notes.length <= NOTES_MAX_LENGTH) notes = body.notes.trim() || null;
      else return c.json({ error: "invalid_notes", reasons: [`Observațiile au cel mult ${NOTES_MAX_LENGTH} de caractere.`] }, 400);
    }
    const db = runtime.assemblyPlane().db;
    const saved = saveVariantDraft(
      db,
      {
        variantId: variant.variantId,
        expectedVersion,
        ...("values" in body ? { values: asDraftValues(body.values) } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
      actorIdentity(c),
    );
    if (!saved.ok) {
      const failure = writeFailure(saved);
      return c.json(failure.body, failure.status);
    }
    return c.json({
      changed: saved.changed,
      variant: presentVariant(describeVariant(c, runtime, saved.variant, listRequestVariants(db, variant.requestId))),
    });
  });

  app.put("/api/requests/:requestId/variants/:variantId/price", requireCapability("offering.policy.use"), async (c) => {
    const runtime = getProductSystem(c);
    const variant = loadVariant(c, runtime);
    if (!variant) return c.json({ error: "not_found" }, 404);
    // The price right is checked on every save: role, or role and the organization policy.
    const right = effectiveOfferingPriceRight(c, runtime).right;
    if (!right.canSetPrice) {
      return c.json({ error: "forbidden", reasons: [right.blockedReason ?? "Rolul tău nu poate stabili prețul."] }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const expectedVersion = readExpectedVersion(body);
    if (!body || expectedVersion === null || !("netPrice" in body)) {
      return c.json({ error: "invalid_payload", reasons: ["Prețul sau versiunea variantei lipsește."] }, 400);
    }
    const raw = body.netPrice;
    if (raw !== null && (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0 || raw > PRICE_MAX)) {
      return c.json({ error: "invalid_price", reasons: ["Prețul net trebuie să fie un număr pozitiv."] }, 400);
    }
    const actor = actorIdentity(c);
    const db = runtime.assemblyPlane().db;
    const saved = setVariantPrice(
      db,
      {
        variantId: variant.variantId,
        expectedVersion,
        netPrice: raw === null ? null : Math.round((raw as number) * 100) / 100,
        role: actor.role,
        deferPriceEvent: true,
      },
      actor,
    );
    if (!saved.ok) {
      const failure = writeFailure(saved);
      return c.json(failure.body, failure.status);
    }
    const described = describeVariant(c, runtime, saved.variant, listRequestVariants(db, variant.requestId));
    if (saved.changed && saved.variant.productNetPrice !== null) {
      // The trail says what the price is under the policy of this moment: a price its author may
      // issue is "set"; one that waits for the Owner is "proposed".
      appendVariantEvent(db, saved.variant, "PRICE_SET", actor, saved.variant.priceSetAt ?? new Date().toISOString(), {
        netPrice: saved.variant.productNetPrice,
        detail: described.state === "PRICE_SET" ? "SET" : "PROPOSED",
      });
    }
    return c.json({ changed: saved.changed, variant: presentVariant(described) });
  });

  app.post("/api/requests/:requestId/variants/:variantId/lifecycle", requireCapability("quotes.create"), async (c) => {
    const runtime = getProductSystem(c);
    const variant = loadVariant(c, runtime);
    if (!variant) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const expectedVersion = readExpectedVersion(body);
    const lifecycle = body?.lifecycle;
    if (expectedVersion === null || (lifecycle !== "ACTIVE" && lifecycle !== "WITHDRAWN")) {
      return c.json({ error: "invalid_payload", reasons: ["Alege retragerea sau reluarea variantei."] }, 400);
    }
    const db = runtime.assemblyPlane().db;
    const saved = setVariantLifecycle(db, { variantId: variant.variantId, expectedVersion, lifecycle }, actorIdentity(c));
    if (!saved.ok) {
      const failure = writeFailure(saved);
      return c.json(failure.body, failure.status);
    }
    return c.json({
      changed: saved.changed,
      variant: presentVariant(describeVariant(c, runtime, saved.variant, listRequestVariants(db, variant.requestId))),
    });
  });

  // The journal holds customer amounts, so it follows the right to read client prices.
  app.get("/api/requests/:requestId/journal", requireCapability("prices.client.read"), (c) => {
    const runtime = getProductSystem(c);
    const requestId = c.req.param("requestId");
    if (!runtime.readCommercialRequest(requestId)) return c.json({ error: "not_found" }, 404);
    return c.json({ available: variantsAvailable(runtime.assemblyPlane().db), ...presentJournal(c, runtime, requestId) });
  });

  app.post("/api/requests/:requestId/journal", requireCapability("quotes.create"), async (c) => {
    const runtime = getProductSystem(c);
    const requestId = c.req.param("requestId");
    if (!runtime.readCommercialRequest(requestId)) return c.json({ error: "not_found" }, 404);
    const db = runtime.assemblyPlane().db;
    if (!variantsAvailable(db)) {
      return c.json({ error: "journal_unavailable", reasons: ["Jurnalul comercial nu este disponibil pe acest mediu."] }, 409);
    }
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return c.json({ error: "invalid_payload" }, 400);
    const validated = validateJournalEntryInput(body, new Date().toISOString());
    if (!validated.ok) {
      return c.json(
        { error: "invalid_entry", issues: validated.issues, reasons: validated.issues.map((issue) => issue.reason) },
        400,
      );
    }
    if (validated.entry.variantId) {
      const linked = readVariant(db, validated.entry.variantId);
      if (!linked || linked.requestId !== requestId) {
        return c.json({ error: "invalid_variant", reasons: ["Varianta indicată nu aparține acestei cereri."] }, 400);
      }
    }
    let rectification: { entryId: string; reason: string } | null = null;
    if (body.rectifies !== undefined && body.rectifies !== null) {
      const raw = body.rectifies as Record<string, unknown>;
      const entryId = typeof raw?.entryId === "string" ? raw.entryId : "";
      const reason = typeof raw?.reason === "string" ? raw.reason.trim() : "";
      const target = entryId ? readJournalEntry(db, entryId) : null;
      if (!target || target.requestId !== requestId) return c.json({ error: "not_found" }, 404);
      if (reason.length === 0 || reason.length > 500) {
        return c.json({ error: "invalid_reason", reasons: ["Motivul rectificării este obligatoriu (maximum 500 de caractere)."] }, 400);
      }
      if (listJournalEntries(db, requestId).some((entry) => entry.rectifiesEntryId === entryId)) {
        return c.json({ error: "already_rectified", reasons: ["Intrarea a fost deja rectificată. Rectifică intrarea cea mai nouă."] }, 409);
      }
      rectification = { entryId, reason };
    }
    const entry = appendJournalEntry(db, requestId, validated.entry, rectification, actorIdentity(c));
    return c.json({ entryId: entry.entryId, ...presentJournal(c, runtime, requestId) }, 201);
  });
}
