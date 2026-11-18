import {
  existingCommercialWork,
  loadAssemblyMember,
  presentSavedAssemblyMember,
  SEPARATE_QUOTE_INTENT,
  type ConfirmedAssemblyMember,
} from "../api/assemblies";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { presentConfirm, rateAcknowledgementSatisfied } from "../adapters/confirmAdapter";
import { presentOfferingView } from "../adapters/commercialFinancialAdapter";
import { requestPriceApproval } from "../api/commercialFinancial";
import "../styles/surfaces/commercial-financial.css";
import {
  valuesBeforeSchema,
  valuesForTransport,
} from "../adapters/formSchemaAdapter";
import { presentPreview } from "../adapters/previewAdapter";
import { presentQuoteSnapshot } from "../adapters/quoteAdapter";
import { postConfigurationConfirm } from "../api/confirm";
import { TransportError, postJson, readTransportErrorCode, readTransportReasons } from "../api/http";
import { postConfigurationPreview } from "../api/preview";
import { postQuoteSnapshot } from "../api/quote";
import { ConfigurationSections, type ConfigurationSectionsHandle } from "../components/ConfigurationSections";
import { ConfiguratorPresetBar } from "../features/catalog/ConfiguratorPresetBar";
import { ConfigurationReview } from "../components/ConfigurationReview";
import { ConfigurationWorkAreas, type ConfigurationWorkArea } from "../components/ConfigurationWorkAreas";
import { ConfiguratorReadinessIndicator } from "../components/ConfiguratorReadinessIndicator";
import { ConfiguratorStateBar } from "../components/ConfiguratorStateBar";
import { LoadingFloor } from "../components/LoadingFloor";
import "../styles/surfaces/commercial.css";
import "../styles/surfaces/configuration-workbench.css";
import { SellerSetupPanel } from "../components/SellerSetupPanel";
import { ExtendRequestProduct } from "../components/ExtendRequestProduct";
import {
  invalidateAfterAssemblyMemberChange,
  invalidateAfterFreezeQuote,
  invalidateAfterRequestDetailChange,
} from "../data/invalidation";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadSellerConfigured } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import type {
  ConfirmTransport,
  DraftValues,
  PresentedFormSchema,
  PreviewTransport,
} from "../api/types";
import { Button } from "../components/Button";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { OwnerPricingHandoff } from "../components/OwnerPricingHandoff";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { SectionLabel } from "../components/SectionLabel";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { SlicePage } from "../layout/SlicePage";
import { presentContextMeta } from "../presentation/contextMeta";
import { formatMoney, formatTimestamp } from "../presentation/format";
import { CommercialPricePanel } from "../presentation/commercialPrice";
import { CostCompletenessIssues } from "../presentation/costCompleteness";
import { presentCostLine, selectLineByResource } from "../presentation/costLine";
import { RateAcknowledgementNotice } from "../presentation/rateAcknowledgement";
import { ALUMINIUM_RETURN_PROFILE_RESOURCE_ID } from "../reference/lettersProduct";
import { assemblyHref, requestProductHref, requestHref, quoteHref } from "../routing/appRoute";
import { configuratorReturnHref } from "../routing/configuratorReturn";
import {
  labelsMatchingContext,
  lastQuoteOwnedByContext,
  ownedDraftsForContext,
  configuratorContextKey,
  readConfiguratorSession,
  workbenchNavigationForContext,
  writeConfiguratorSession,
  type ConfiguratorContext,
  type FrozenQuoteRef,
} from "../session/configuratorSession";
import {
  buildWorkbenchSections,
  workbenchCompletion,
  workbenchMissingEntries,
  type WorkbenchNavigationState,
} from "../configuration/workbenchModel";
import {
  resolveConfiguratorReadiness,
  resolveConfiguratorWorkState,
} from "../configuration/configuratorWorkState";

function commercialResultKey(input: {
  manualNetDraft: string;
  reviewId: string | null;
}): string {
  return JSON.stringify(input);
}

type PreviewState = "idle" | "pending" | "ready" | "error";
type ActionState = "idle" | "pending" | "error";

function ConfirmedMemberPrice({ member, current }: { member: ConfirmedAssemblyMember; current: boolean }) {
  const confirmedLabel = formatTimestamp(member.confirmedAt);
  return (
    <div className="stack" data-testid="confirmed-member-price">
      <p>
        Ultima confirmare acceptată în ansamblu{confirmedLabel ? ` · ${confirmedLabel}` : ""}.
      </p>
      {member.customerPrice ? (
        <dl>
          <InfoRow label="Preț net" value={formatMoney(member.customerPrice.netPrice, member.customerPrice.currency)} />
          <InfoRow label="TVA" value={formatMoney(member.customerPrice.vatAmount, member.customerPrice.currency)} />
          <InfoRow label="Preț client cu TVA" value={formatMoney(member.customerPrice.grossPrice, member.customerPrice.currency)} />
          <InfoRow label="Adaos" value={`${member.customerPrice.markupPercent}%`} />
          <InfoRow label="Discount" value={`${member.customerPrice.discountPercent}%`} />
          <InfoRow label="Ajustare" value={formatMoney(member.customerPrice.adjustmentAmount, member.customerPrice.currency)} />
        </dl>
      ) : (
        <p>Ultima confirmare nu are un preț client complet.</p>
      )}
      {!current ? (
        <InlineAlert tone="pending" title="Configurația a fost modificată">
          Valorile afișate aparțin ultimei confirmări. Reconfirmă configurația pentru a calcula prețul valorilor noi.
        </InlineAlert>
      ) : null}
    </div>
  );
}

export type AssemblyMemberRole = "SUPPORT_PANEL" | "SIGNAGE_LETTERS" | "SIGNAGE_LOGO";

export function assemblyMemberContextLabel(role: AssemblyMemberRole | null): string | null {
  switch (role) {
    case "SUPPORT_PANEL":
      return "Membru ansamblu: panou ACM";
    case "SIGNAGE_LETTERS":
      return "Membru ansamblu: litere volumetrice";
    case "SIGNAGE_LOGO":
      return "Membru ansamblu: logo volumetric";
    default:
      return null;
  }
}

export function readAssemblyMemberRole(value: string | null): AssemblyMemberRole | null {
  switch (value) {
    case "SUPPORT_PANEL":
    case "SIGNAGE_LETTERS":
    case "SIGNAGE_LOGO":
      return value;
    default:
      return null;
  }
}

export function withAssemblyLettersMountingDrafts(
  drafts: Record<string, string>,
): Record<string, string> {
  const next = { ...drafts };
  if (next["constructive.mountingContext"] !== "acm_panel") {
    next["constructive.mountingContext"] = "acm_panel";
  }
  if (!next["back.supportKind"]) {
    next["back.supportKind"] = "PANEL";
  }
  return next;
}

export type ConfiguratorPageProps = ConfiguratorContext & {
  assemblyId?: string | null;
  memberRole?: AssemblyMemberRole | null;
  /** Assembly member opened from „Stabilește prețul”: start on the price step, not on the values. */
  openPriceStep?: boolean;
};

export const INITIAL_PREVIEW_DEBOUNCE_MS = 0;
export const EDIT_PREVIEW_DEBOUNCE_MS = 250;

function schemaTransportDiffers(sent: DraftValues, corrected: DraftValues): boolean {
  const keys = new Set([...Object.keys(sent), ...Object.keys(corrected)]);
  for (const key of keys) {
    if ((sent[key] ?? null) !== (corrected[key] ?? null)) {
      return true;
    }
  }
  return false;
}

function profilePresentation(lines: ConfirmTransport["lines"]) {
  const line = selectLineByResource(lines, ALUMINIUM_RETURN_PROFILE_RESOURCE_ID);
  return line ? presentCostLine(line) : null;
}

function presentFreezeError(error: unknown): string {
  if (!(error instanceof TransportError)) {
    return "Înghețarea ofertei a eșuat.";
  }
  const reasons = readTransportReasons(error.body);
  if (reasons[0]) {
    return reasons[0];
  }
  const code = readTransportErrorCode(error.body);
  switch (code) {
    case "seller_unconfigured":
      return "Datele firmei trebuie configurate înainte de a crea oferta.";
    case "missing_customer":
      return "Selectează un client înainte de a crea oferta.";
    case "request_unavailable":
      return "Cererea de ofertă nu este disponibilă.";
    case "request_cancelled":
      return "Cererea anulată nu poate primi o ofertă nouă.";
    case "request_customer_mismatch":
      return "Oferta trebuie să folosească același client ca cererea.";
    case "review_mismatch":
    case "review_required":
      return "Configurația s-a schimbat. Reia previzualizarea.";
    case "service_quote_freeze_not_authorized":
      return "Oferta cu montaj nu poate fi înghețată în această etapă.";
    case "rate_acknowledgement_required":
      return "Acceptă explicit tarifele neconfirmate înainte de înghețare.";
    case "rate_acknowledgement_forbidden":
      return "Tarifele neconfirmate pot fi acceptate doar de un utilizator cu acces financiar.";
    case "rate_acknowledgement_stale":
      return "Oferta sau tarifele s-au schimbat după acceptare. Recalculează prețul și acceptă din nou.";
    default:
      return "Înghețarea ofertei a eșuat.";
  }
}

export function ConfiguratorPage({
  customerId,
  requestId,
  productCode,
  assemblyId = null,
  memberRole = null,
  openPriceStep = false,
}: ConfiguratorPageProps) {
  const context: ConfiguratorContext = { customerId, requestId, productCode, ...(assemblyId ? { assemblyId } : {}) };
  const stored = readConfiguratorSession();
  const [workbenchNavigation, setWorkbenchNavigation] = useState<
    Record<string, WorkbenchNavigationState>
  >(() => stored.workbenchNavigation ?? {});
  const [hadOwnedDrafts] = useState(() => Object.keys(ownedDraftsForContext(stored, context)).length > 0);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const owned = ownedDraftsForContext(stored, context);
    if (assemblyId && memberRole === "SIGNAGE_LETTERS") {
      return withAssemblyLettersMountingDrafts(owned);
    }
    return owned;
  });
  const [workArea, setWorkArea] = useState<ConfigurationWorkArea>(
    openPriceStep && assemblyId && memberRole ? "commercial" : "configuration",
  );
  const workAreaRef = useRef<ConfigurationWorkArea>(workArea);
  useEffect(() => { workAreaRef.current = workArea; }, [workArea]);
  const sectionsHandle = useRef<ConfigurationSectionsHandle>(null);
  const costDetails = useRef<HTMLDetailsElement>(null);
  const [preview, setPreview] = useState<PreviewTransport | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ActionState>("idle");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmTransport | null>(null);
  const [pricedResultKey, setPricedResultKey] = useState<string | null>(null);
  const [extensionPending, setExtensionPending] = useState(false);
  const [freezeState, setFreezeState] = useState<ActionState>("idle");
  const [freezeError, setFreezeError] = useState<string | null>(null);
  const [acknowledgedRateBinding, setAcknowledgedRateBinding] = useState<string | null>(null);
  const [overlapAssemblyId, setOverlapAssemblyId] = useState<string | null>(null);
  const [manualNetDraft, setManualNetDraft] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalState, setApprovalState] = useState<"idle" | "pending" | "error">("idle");
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [frozenResultKey, setFrozenResultKey] = useState<string | null>(null);
  const seller = useResource(resourceKeys.seller(), loadSellerConfigured);
  const sellerConfigured = seller.status === "success" ? seller.data : null;
  const [lastQuote, setLastQuote] = useState<FrozenQuoteRef | null>(() =>
    lastQuoteOwnedByContext(stored.lastQuote, context),
  );

  const member = useResource(assemblyId && memberRole ? `assembly-member:${assemblyId}:${memberRole}` : null, () => loadAssemblyMember({ assemblyId: assemblyId!, role: memberRole!, customerId, requestId, productCode }));
  const [seedApplied, setSeedApplied] = useState(false);
  if (member.data && !seedApplied) {
    if (!hadOwnedDrafts && Object.keys(member.data.values).length > 0) {
      const seeded =
        memberRole === "SIGNAGE_LETTERS" && assemblyId
          ? withAssemblyLettersMountingDrafts(member.data.values)
          : member.data.values;
      setDrafts(seeded);
    }
    setSeedApplied(true);
  }
  const confirmedMember = member.data?.confirmed ?? null;
  const memberConsultOnly = Boolean(assemblyId && memberRole && member.data && !member.data.membersEditable);
  const memberDraftsMatchConfirmed = Boolean(
    member.data &&
      Object.entries(member.data.values).every(([key, value]) => drafts[key] === value),
  );
  const showConfirmedMember = Boolean(confirmedMember && !confirmation);

  const schemaRef = useRef<PresentedFormSchema | null>(null);
  const draftsDirtyRef = useRef(false);
  const confirmGeneration = useRef(0);
  const draftKey = JSON.stringify(drafts);
  const activeProduct = preview?.product.code ?? productCode;
  const visibleLastQuote = lastQuoteOwnedByContext(lastQuote, context);

  function parsedManualNet(): number | null {
    const parsed = Number(manualNetDraft.replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function commercialPayload(): {
    pricingMethod: "MANUAL_FIXED_PRODUCT";
    manualProductNetPrice?: number;
  } {
    const net = parsedManualNet();
    return {
      pricingMethod: "MANUAL_FIXED_PRODUCT",
      ...(net !== null ? { manualProductNetPrice: net } : {}),
    };
  }

  function currentTransportValues(): DraftValues {
    return schemaRef.current
      ? valuesForTransport(drafts, schemaRef.current)
      : valuesBeforeSchema(drafts);
  }

  function currentCommercialResultKey(reviewId: string | null = preview?.reviewId ?? null): string {
    return commercialResultKey({ manualNetDraft, reviewId });
  }
  useEffect(() => () => { confirmGeneration.current += 1; }, []);

  useEffect(() => {
    const stored = readConfiguratorSession();
    writeConfiguratorSession({
      drafts,
      draftContext: { customerId, requestId, productCode, ...(assemblyId ? { assemblyId } : {}) },
      customerId,
      requestId,
      productCode,
      lastQuote,
      workbenchNavigation,
      ...labelsMatchingContext(stored, { customerId, requestId }),
    });
  }, [assemblyId, customerId, drafts, lastQuote, productCode, requestId, workbenchNavigation]);

  useEffect(() => {
    if (!productCode || (assemblyId && memberRole && !seedApplied)) {
      return;
    }
    let cancelled = false;
    const delay = draftsDirtyRef.current
      ? EDIT_PREVIEW_DEBOUNCE_MS
      : INITIAL_PREVIEW_DEBOUNCE_MS;
    const handle = window.setTimeout(() => {
      void (async () => {
        setPreviewState((current) => (current === "ready" ? current : "pending"));
        setPreviewError(null);
        try {
          const values = schemaRef.current
            ? valuesForTransport(drafts, schemaRef.current)
            : valuesBeforeSchema(drafts);
          let presented = presentPreview(
            await postConfigurationPreview(productCode, {
              values,
              ...(requestId ? { requestId } : {}),
            }),
          );
          if (cancelled) {
            return;
          }
          if (!presented) {
            setPreviewState("error");
            setPreviewError("Previzualizarea nu poate fi prezentată.");
            return;
          }
          if (presented.formSchema) {
            schemaRef.current = presented.formSchema;
            const corrected = valuesForTransport(drafts, presented.formSchema);
            if (schemaTransportDiffers(values, corrected)) {
              presented = presentPreview(
                await postConfigurationPreview(productCode, {
                  values: corrected,
                  ...(requestId ? { requestId } : {}),
                }),
              );
              if (cancelled) {
                return;
              }
              if (!presented) {
                setPreviewState("error");
                setPreviewError("Previzualizarea nu poate fi prezentată.");
                return;
              }
              if (presented.formSchema) {
                schemaRef.current = presented.formSchema;
              }
            }
          }
          setPreview(presented);
          setPreviewState("ready");
        } catch (error) {
          if (!cancelled) {
            setPreviewState("error");
            setPreviewError(
              error instanceof TransportError
                ? (readTransportReasons(error.body)[0] ??
                    "Previzualizarea nu este disponibilă.")
                : "Previzualizarea nu este disponibilă.",
            );
          }
        }
      })();
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [draftKey, drafts, productCode, requestId, assemblyId, memberRole, seedApplied, previewAttempt]);

  function invalidateStaleCommercialDraft(): void {
    confirmGeneration.current += 1;
    draftsDirtyRef.current = true;
    setPreviewState("pending");
    setConfirmation(null);
    setPricedResultKey(null);
    setConfirmState("idle");
    setFreezeState("idle");
  }

  function updateField(fieldId: string, value: string): void {
    invalidateStaleCommercialDraft();
    setDrafts((current) => ({ ...current, [fieldId]: value }));
  }

  async function confirm(): Promise<void> {
    if (!preview?.reviewId || !activeProduct) {
      return;
    }
    const fromTechnicalReview = workArea === "review";
    const generation = ++confirmGeneration.current;
    const sentKey = currentCommercialResultKey(preview.reviewId);
    setConfirmState("pending");
    setConfirmError(null);
    try {
      let presented = presentConfirm(
        await postConfigurationConfirm(activeProduct, {
          values: currentTransportValues(),
          reviewId: preview.reviewId,
          ...(requestId ? { requestId } : {}),
          ...commercialPayload(),
        }),
        preview.reviewId,
      );
      if (generation !== confirmGeneration.current) {
        return;
      }
      if (!presented) {
        setConfirmState("error");
        setConfirmError("Confirmarea nu poate fi prezentată.");
        return;
      }
      if (assemblyId && memberRole) {
        const savedPayload = await postJson(`/api/assemblies/${encodeURIComponent(assemblyId)}/members`, {
          role: memberRole,
          values: currentTransportValues(),
          reviewId: preview.reviewId,
          ...(requestId ? { requestId } : {}),
          ...commercialPayload(),
        });
        if (generation !== confirmGeneration.current) {
          return;
        }
        const saved = presentSavedAssemblyMember(savedPayload, assemblyId, memberRole);
        if (!saved || (parsedManualNet() !== null && !saved.customerPrice)) {
          setConfirmState("error");
          setConfirmError("Salvarea prețului în ansamblu nu a fost confirmată. Reîncearcă înainte de a continua.");
          return;
        }
        if (saved.customerPrice && presented.commercial && parsedManualNet() !== null) {
          presented = { ...presented, commercial: { ...presented.commercial, ...saved.customerPrice } };
        }
        invalidateAfterAssemblyMemberChange(assemblyId, memberRole);
        if (requestId) invalidateAfterRequestDetailChange(requestId);
      }
      setConfirmation(presented);
      setPricedResultKey(sentKey);
      setConfirmState("idle");
      if (fromTechnicalReview && workAreaRef.current === "review") setWorkArea("commercial");
    } catch (error) {
      if (generation !== confirmGeneration.current) {
        return;
      }
      setConfirmState("error");
      setConfirmError(
        error instanceof TransportError
          ? (readTransportReasons(error.body)[0] ??
              (error.status === 409
                ? "Configurația s-a schimbat. Reia previzualizarea."
                : "Confirmarea a eșuat."))
          : "Confirmarea a eșuat.",
      );
    }
  }

  /** Commercial & Financial V1: ask the Owner to approve this exact configuration and price. */
  async function requestApproval(): Promise<void> {
    if (!preview?.reviewId || !confirmation || !activeProduct || !requestId || !customerId) {
      return;
    }
    setApprovalState("pending");
    setApprovalError(null);
    const result = await requestPriceApproval(activeProduct, {
      values: currentTransportValues(),
      reviewId: preview.reviewId,
      customerId,
      requestId,
      ...commercialPayload(),
      ...(approvalNote.trim() ? { approvalNote: approvalNote.trim() } : {}),
    });
    const offering = presentOfferingView((result.body as { offering?: unknown } | null)?.offering);
    if (offering) {
      setConfirmation((current) => (current ? { ...current, offering } : current));
    }
    if (result.ok) {
      setApprovalState("idle");
      setApprovalNote("");
      return;
    }
    setApprovalState("error");
    setApprovalError(readTransportReasons(result.body).join(" ") || "Solicitarea de aprobare nu a putut fi trimisă.");
  }

  async function freeze(options: { separateQuote?: boolean } = {}): Promise<void> {
    if (!preview?.reviewId || !confirmation || !activeProduct) {
      return;
    }
    setOverlapAssemblyId(null);
    if (sellerConfigured !== true) {
      setFreezeState("error");
      setFreezeError(
        seller.status === "error"
          ? "Nu am putut verifica datele firmei emitente."
          : "Datele firmei emitente lipsesc. Completează denumirea legală în zona de mai sus sau în setările comerciale ale organizației.",
      );
      return;
    }
    if (!customerId) {
      setFreezeState("error");
      setFreezeError("Selectează un client înainte de a crea oferta.");
      return;
    }
    if (confirmState === "pending" || pricedResultKey !== currentCommercialResultKey()) {
      setFreezeState("error");
      setFreezeError("Calculează din nou prețul înainte de a îngheța oferta.");
      return;
    }
    const customerPriceReady =
      confirmation.commercial?.completeness === "COMPLETE" &&
      confirmation.commercial.netPrice !== null &&
      confirmation.commercial.unavailableReasons.length === 0;
    if (!customerPriceReady) {
      setFreezeState("error");
      setFreezeError("Prețul clientului nu este gata pentru înghețare.");
      return;
    }
    const requirement = confirmation.rateAcknowledgement;
    if (!rateAcknowledgementSatisfied(requirement, acknowledgedRateBinding)) {
      setFreezeState("error");
      setFreezeError("Acceptă explicit tarifele neconfirmate înainte de înghețare.");
      return;
    }
    const rateAcknowledgement =
      requirement?.status === "REQUIRED" && requirement.bindingHash
        ? { rateAcknowledgement: { bindingHash: requirement.bindingHash } }
        : {};
    setFreezeState("pending");
    setFreezeError(null);
    try {
      const presented = presentQuoteSnapshot(
        await postQuoteSnapshot(activeProduct, {
          values: currentTransportValues(),
          reviewId: preview.reviewId,
          customerId,
          ...(requestId ? { requestId } : {}),
          ...(options.separateQuote ? { commercialIntent: SEPARATE_QUOTE_INTENT } : {}),
          ...commercialPayload(),
          ...rateAcknowledgement,
        }),
      );
      if (!presented) {
        setFreezeState("error");
        setFreezeError("Oferta înghețată nu poate fi prezentată.");
        return;
      }
      setLastQuote({
        productCode: presented.productCode,
        quoteSnapshotId: presented.quoteSnapshotId,
        customerId,
        requestId,
      });
      setFrozenResultKey(currentCommercialResultKey());
      invalidateAfterFreezeQuote(requestId);
      setFreezeState("idle");
    } catch (error) {
      setFreezeState("error");
      const overlap = existingCommercialWork(error);
      if (overlap) {
        setOverlapAssemblyId(overlap.assemblyId);
        setFreezeError(overlap.reason || "Produsul face deja parte dintr-un ansamblu al cererii.");
        return;
      }
      if (
        error instanceof TransportError &&
        readTransportErrorCode(error.body) === "rate_acknowledgement_stale"
      ) {
        setAcknowledgedRateBinding(null);
        setPricedResultKey(null);
      }
      setFreezeError(presentFreezeError(error));
    }
  }

  const profile = confirmation ? profilePresentation(confirmation.lines) : null;
  const ready = previewState === "ready" && preview?.readiness === "ready" && preview.reviewId !== null;
  const confirmPending = confirmState === "pending";
  const freezePending = freezeState === "pending";
  const priceIsCurrent =
    pricedResultKey !== null && pricedResultKey === currentCommercialResultKey();
  const serverCustomerPriceReady =
    confirmation?.commercial?.completeness === "COMPLETE" &&
    confirmation.commercial.netPrice !== null &&
    confirmation.commercial.unavailableReasons.length === 0;
  const validCustomerPrice = Boolean(serverCustomerPriceReady && priceIsCurrent);
  const rateRequirement = confirmation?.rateAcknowledgement ?? null;
  const ratesAcknowledged = rateAcknowledgementSatisfied(rateRequirement, acknowledgedRateBinding);
  const offering = confirmation?.offering ?? null;
  // Commercial & Financial V1: an exception waits for the Owner; the server re-checks on freeze.
  const approvalPending =
    offering?.outcome === "APPROVAL_REQUIRED" && offering.approvalStatus !== "APPROVED";
  const freezeBlocked =
    sellerConfigured !== true ||
    customerId === null ||
    confirmPending ||
    !validCustomerPrice ||
    !ratesAcknowledged ||
    approvalPending ||
    offering?.outcome === "NOT_PERMITTED";
  const priceNotReady = Boolean(confirmation && !validCustomerPrice);
  const sections = preview ? buildWorkbenchSections(preview) : [];
  const missingEntries = preview ? workbenchMissingEntries(sections, preview.missing) : [];
  const completion = preview ? workbenchCompletion(sections, preview.missing, drafts) : null;
  const confirmed = Boolean(confirmation) && !confirmPending;
  const frozen = Boolean(visibleLastQuote && frozenResultKey !== null && frozenResultKey === currentCommercialResultKey());
  const workState = resolveConfiguratorWorkState({ evaluated: previewState === "ready", confirmed, frozen });
  const readiness = resolveConfiguratorReadiness({
    hasProduct: Boolean(productCode),
    previewState,
    readiness: preview?.readiness ?? null,
    missingCount: missingEntries.length,
    missingParts: [...new Set(missingEntries.map((entry) => `${entry.sectionNumber} ${entry.sectionTitle}`))],
    confirmed,
    frozen,
  });
  const backHref = requestId ? requestHref(requestId) : "/cereri";
  const backLabel = requestId ? "Înapoi la cerere" : "Înapoi la cereri";
  const stateNote = assemblyId
    ? workState === "CONFIRMED_CONFIGURATION" ? "Confirmarea a salvat această parte în ansamblu. Oferta comună se îngheață din ansamblu." : null
    : workState === "CONFIRMED_CONFIGURATION" && manualNetDraft.trim()
      ? "Prețul manual nu este salvat. Se păstrează numai la înghețarea ofertei."
      : null;

  function goToFirstMissing(): void {
    const first = missingEntries[0];
    if (!first) return;
    setWorkArea("configuration");
    window.requestAnimationFrame(() => sectionsHandle.current?.focusField(first.fieldId));
  }

  function retryPreview(): void {
    setPreviewState("pending");
    setPreviewAttempt((attempt) => attempt + 1);
  }

  const adminReturnHref = configuratorReturnHref({
    customerId,
    requestId,
    productCode,
    assemblyId,
    memberRole,
  });
  function previewRecoveryAlert(): ReactNode {
    if (!previewError) {
      return null;
    }
    return (
      <InlineAlert
        tone="error"
        title={
          previewError.includes("nu este oferit")
            ? "Produsul nu este oferit"
            : "Previzualizare indisponibilă"
        }
      >
        {previewError}
        <Button variant="secondary" onClick={retryPreview}>
          Reîncearcă previzualizarea
        </Button>
      </InlineAlert>
    );
  }

  return (
    <SlicePage
      contextLabel="Configurator"
      currentHref="/configurator"
      workspace="configuration"
      surface="configuration-workbench"
      headerVariant="default"
      status={
        <ConfiguratorReadinessIndicator
          readiness={readiness}
          onGoToFirst={readiness.tone === "attention" && missingEntries.length > 0 ? goToFirstMissing : undefined}
        />
      }
      eyebrow="Configurare · Produs"
      title={preview?.product.label ?? "Configurator"}
      lead=""
      meta={presentContextMeta([
        labelsMatchingContext(stored, context).customerLabel,
        labelsMatchingContext(stored, context).requestLabel,
        assemblyMemberContextLabel(memberRole),
      ])}
    >
      <ConfigurationWorkAreas
        selected={workArea}
        onSelect={setWorkArea}
        disabled={freezePending || extensionPending}
        notes={{
          configuration: completion ? `${completion.settled} din ${completion.total} părți complete` : undefined,
          review: confirmed ? "confirmată" : ready ? "gata de confirmare" : "după completare",
          commercial: frozen ? "înghețată în ofertă" : confirmed ? "pasul următor" : "după confirmare",
        }}
      />
          {customerId === null || requestId === null ? (
            <InlineAlert tone="blocked" title="Context comercial incomplet">
              Completează clientul și cererea pentru a continua traseul asistat către ofertă.
              Draftul tehnic local rămâne disponibil.
              {productCode ? (
                <a className="text-link" href="/cereri/noua">Creează o cerere</a>
              ) : null}
            </InlineAlert>
          ) : null}
      {member.status === "error" && <InlineAlert tone="error" title="Configurația din ansamblu nu a putut fi citită"><Button variant="secondary" onClick={() => invalidateResources(`assembly-member:${assemblyId}:${memberRole}`)}>Reîncearcă citirea configurației</Button></InlineAlert>}
      {memberConsultOnly && assemblyId ? (
        <InlineAlert tone="blocked" title="Doar consultare">
          Ansamblul are o comandă acceptată. Configurația confirmată poate fi consultată, dar nu
          modificată. Pentru modificări creează o variantă comercială nouă din cerere.{" "}
          <a className="text-link" href={assemblyHref(assemblyId)}>Înapoi la ansamblu</a>
        </InlineAlert>
      ) : null}
      <fieldset className="configuration-lock" disabled={extensionPending || freezePending || memberConsultOnly || Boolean(assemblyId && memberRole && !seedApplied)}>
        <legend className="u-visually-hidden">Configurație și preț</legend>
      <section id="configuration-area-configuration" role="tabpanel" aria-labelledby="configuration-tab-configuration" hidden={workArea !== "configuration"}>
      <div id="configuratie" className="configuration-editor">
      <SurfacePanel
        variant="flush"
        label="Configurare"
        busy={previewState === "pending" && !preview}
      >
        {!productCode ? (
          <InlineAlert tone="blocked" title="Produsul nu este ales">
            Alege produsul în cererea pentru care lucrezi.{" "}
            <a
              className="text-link"
              href={requestId ? requestProductHref(requestId) : "/cereri/noua"}
            >
              Alege produsul în cerere
            </a>
          </InlineAlert>
        ) : null}
        {previewState === "pending" && !preview ? (
          <LoadingFloor variant="form" label="Se citește formularul produsului" />
        ) : null}
        {workArea === "configuration" ? previewRecoveryAlert() : null}
        {preview ? (
          <>
            {productCode ? (
              <ConfiguratorPresetBar
                productCode={productCode}
                drafts={drafts}
                onApply={(next) => {
                  invalidateStaleCommercialDraft();
                  setDrafts(next);
                }}
              />
            ) : null}
            <ConfigurationSections
            ref={sectionsHandle}
            key={`${customerId}:${requestId}:${productCode}:${assemblyId}:${memberRole}`}
            preview={preview}
            drafts={drafts}
            onChange={updateField}
            technicalState={
              previewState === "ready" ? "current" : previewState === "pending" ? "pending" : "unavailable"
            }
            initialNavigation={workbenchNavigationForContext({ workbenchNavigation }, context)}
            onNavigationChange={(navigation) => {
              setWorkbenchNavigation((current) => ({
                ...current,
                [configuratorContextKey(context)]: navigation,
              }));
            }}
            adminReturnHref={adminReturnHref}
            footnote={
              <p className="configuration-persistence" data-testid="configuration-persistence">
                {assemblyId
                  ? "Modificări locale, în această filă. Confirmarea salvează partea în ansamblu; oferta comună apare numai după înghețare."
                  : "Modificări locale, în această filă. Verificarea întreabă serverul și nu creează oferta. Oferta apare doar când o îngheți; închiderea filei poate pierde valorile."}
              </p>
            }
          />
          </>
        ) : null}
      </SurfacePanel>
      </div>
      </section>
      <section id="configuration-area-review" role="tabpanel" aria-labelledby="configuration-tab-review" hidden={workArea !== "review"}>
        {workArea === "review" ? previewRecoveryAlert() : null}
        {preview ? <ConfigurationReview preview={preview} drafts={drafts} technicalState={previewState === "ready" ? "current" : previewState === "pending" ? "pending" : "unavailable"} adminReturnHref={adminReturnHref} onEdit={(fieldId) => {
          setWorkArea("configuration");
          window.requestAnimationFrame(() => sectionsHandle.current?.focusField(fieldId));
        }} /> : <p>Rezumatul apare după citirea configurației produsului.</p>}
      <div className="stack configuration-review">
        <SurfacePanel variant="quiet" title="Stare și acțiune" label="Stare">
          {previewState === "pending" ? (
            <LoadingIndicator label="Se actualizează previzualizarea" />
          ) : null}
          {preview?.readiness === "blocked" ? (
            <InlineAlert tone="blocked" title="Lipsesc fapte">
              {preview.missing.map((item) => item.label).join(", ") ||
                "Configurația nu este gata."}
            </InlineAlert>
          ) : null}
          {ready ? (
            <InlineAlert tone="pending" title="Gata de confirmare">
              Verifică valorile introduse, apoi confirmă configurația pentru calculul costului și pregătirea prețului.
            </InlineAlert>
          ) : null}
          {preview?.selectedComponents.length ? (
            <dl>
              <InfoRow
                label="Componente"
                value={preview.selectedComponents.map((item) => item.label).join(", ")}
              />
            </dl>
          ) : null}
          {confirmPending ? <LoadingIndicator label="Se confirmă configurația" /> : null}
          {confirmError ? (
            <InlineAlert tone="error" title="Confirmarea a eșuat">
              {confirmError}
            </InlineAlert>
          ) : null}
        </SurfacePanel>
      </div>
      </section>
      <section id="configuration-area-commercial" role="tabpanel" aria-labelledby="configuration-tab-commercial" hidden={workArea !== "commercial"}>
      <div id="pregatire-oferta" className="configuration-commercial" onClick={(event) => {
        const target = event.target as HTMLElement;
        const href = target.closest("a")?.getAttribute("href");
        if (href === "#configuratie") {
          event.preventDefault();
          setWorkArea("configuration");
        } else if (href?.startsWith("#cost-intern-")) {
          if (costDetails.current) costDetails.current.open = true;
        }
      }}>
          {seller.status === "error" ? (
            <InlineAlert tone="error" title="Nu am putut verifica datele firmei emitente">
              Emiterea ofertei așteaptă verificarea. Consultarea și pregătirea tehnică pot continua.
              <Button
                variant="secondary"
                onClick={() => invalidateResources(resourceKeys.seller())}
              >
                Reîncearcă
              </Button>
            </InlineAlert>
          ) : null}
          {sellerConfigured === false ? (
            <SellerSetupPanel />
          ) : null}

        <div className="configuration-commercial__heading">
          <h2 id="pregatire-oferta-title">Pregătire ofertă</h2>
          <p>Termenii și prețul clientului pentru configurația confirmată.</p>
        </div>
        {confirmError ? <InlineAlert tone="error" title="Confirmarea a eșuat">{confirmError}</InlineAlert> : null}
        <div className="configuration-commercial__grid">
        <SurfacePanel title="Cum stabilești prețul acestei oferte" label="Preț">
          {!confirmation && showConfirmedMember ? (
            <div className="stack">
              <p>Prețul acestei părți este cel din ultima confirmare acceptată în ansamblu. Consultarea nu modifică ansamblul.</p>
              {!memberConsultOnly ? (
                <div className="stack" data-testid="member-price-only">
                  <p>
                    Poți stabili sau schimba doar prețul: configurația confirmată rămâne neschimbată și ansamblul
                    rămâne confirmat. O ofertă înghețată înainte își pierde valabilitatea și trebuie înghețată din nou.
                  </p>
                  <div className="cluster">
                    <Button
                      disabled={confirmState === "pending" || !preview?.reviewId}
                      onClick={() => void confirm()}
                    >
                      {confirmState === "pending" ? "Se pregătește prețul…" : "Stabilește prețul"}
                    </Button>
                    <Button variant="secondary" onClick={() => setWorkArea("configuration")}>Modifică configurația</Button>
                  </div>
                  <p className="ui-note">
                    „Modifică configurația” redeschide valorile produsului. Doar o valoare schimbată cere
                    revizuirea și reconfirmarea ansamblului.
                  </p>
                </div>
              ) : null}
            </div>
          ) : !confirmation ? (
            <div className="stack"><p>După confirmarea configurației introduci prețul net pentru această ofertă. Costul intern rămâne separat.</p><Button variant="secondary" onClick={() => setWorkArea("review")}>Verifică și confirmă configurația</Button></div>
          ) : (
            <>
              <div className="stack" data-testid="manual-price-method">
                <p><strong>Preț net stabilit manual</strong></p>
                <p>Prețul clientului este introdus și confirmat de un utilizator autorizat.
                  Nu se calculează din costuri de producție, manoperă sau ore lucrate.</p>
              </div>
              {confirmation.manualProductPriceAuthorized ? (
                <div className="stack" data-testid="manual-product-price">
                  <TextField
                    id="manualProductNetPrice"
                    label="Preț net al produsului, fără TVA"
                    value={manualNetDraft}
                    inputMode="decimal"
                    hint="Introdu prețul net al produsului. TVA se calculează separat; montajul și serviciile au preț distinct."
                    onChange={setManualNetDraft}
                  />
                </div>
              ) : (
                <OwnerPricingHandoff
                  reason={confirmation.offering?.blockedReason ?? null}
                  backHref={assemblyId ? null : backHref}
                  backLabel={backLabel}
                />
              )}
              {confirmation.completeness !== "COMPLETE" && confirmation.financialVisible ? (
                <InlineAlert tone="pending" title="Cost intern incomplet">
                  Poți pregăti prețul comercial independent de aceste costuri.
                  Acceptarea și comanda rămân supuse verificărilor interne existente.{" "}
                  {confirmation.costCompletenessIssues.length > 0 ? (
                    <a className="text-link" href="#cost-intern-gaps">
                      Vezi ce lipsește
                    </a>
                  ) : null}
                </InlineAlert>
              ) : null}
              {confirmation.manualProductPriceAuthorized ? (
                <Button
                  disabled={confirmPending}
                  onClick={() => {
                    void confirm();
                  }}
                >
                  {serverCustomerPriceReady ? "Actualizează prețul" : "Confirmă prețul"}
                </Button>
              ) : null}
            </>
          )}
        </SurfacePanel>
        <SurfacePanel title="Preț client" label="Rezultat">
          {confirmation ? (
            <CommercialPricePanel
              commercial={confirmation.commercial}
              internalTotal={null}
              internalCurrency={confirmation.currency}
              showInternalCost={false}
              showCustomerPrice
            />
          ) : showConfirmedMember && confirmedMember ? (
            <ConfirmedMemberPrice member={confirmedMember} current={memberDraftsMatchConfirmed} />
          ) : (
            <p>Prețul clientului apare după calculul de pe server.</p>
          )}
          {confirmation && serverCustomerPriceReady && !priceIsCurrent ? (
            <InlineAlert tone="blocked" title="Preț neactualizat">
              Prețul manual s-a schimbat față de ultima confirmare.
              Actualizează prețul înainte de a îngheța oferta.
            </InlineAlert>
          ) : null}
          {priceNotReady && priceIsCurrent && confirmation?.manualProductPriceAuthorized ? (
            <InlineAlert tone="blocked" title="Prețul nu este gata">
              Introdu și confirmă un preț net manual valid înainte de a îngheța oferta.
            </InlineAlert>
          ) : null}
          {rateRequirement && validCustomerPrice && !assemblyId ? (
            <RateAcknowledgementNotice
              requirement={rateRequirement}
              acknowledged={ratesAcknowledged}
              disabled={freezePending}
              onAcknowledgedChange={(acknowledged) => {
                setAcknowledgedRateBinding(acknowledged ? rateRequirement.bindingHash : null);
              }}
            />
          ) : null}
          {offering && validCustomerPrice && !assemblyId && offering.outcome ? (
            <OfferingDecision
              offering={offering}
              note={approvalNote}
              pending={approvalState === "pending"}
              error={approvalState === "error" ? approvalError : null}
              canRequest={offering.canRequestApproval && Boolean(requestId)}
              onNoteChange={setApprovalNote}
              onRequest={() => {
                void requestApproval();
              }}
            />
          ) : null}
          {confirmation && !confirmation.manualProductPriceAuthorized && !assemblyId ? (
            <p className="ui-note" data-testid="owner-pricing-pending">
              Prețul clientului apare aici după ce Proprietarul îl stabilește și îngheață oferta.
            </p>
          ) : null}
          {confirmation && !assemblyId && confirmation.manualProductPriceAuthorized ? (
            <Button
              disabled={freezePending || freezeBlocked}
              onClick={() => {
                void freeze();
              }}
            >
              Îngheață oferta
            </Button>
          ) : null}
          {assemblyId && confirmation ? (
            <p>
              <a className="text-link" href={assemblyHref(assemblyId)}>
                Înapoi la ansamblu
              </a>
            </p>
          ) : null}
          {freezePending ? <LoadingIndicator label="Se îngheață oferta" /> : null}
          {freezeError && overlapAssemblyId ? (
            <InlineAlert tone="blocked" title="Produsul este deja în ansamblul cererii">
              {freezeError}{" "}
              <a className="text-link" href={assemblyHref(overlapAssemblyId)}>Deschide ansamblul existent</a>
              <Button
                variant="secondary"
                disabled={freezePending || freezeBlocked}
                onClick={() => {
                  void freeze({ separateQuote: true });
                }}
              >
                Îngheață ca ofertă separată
              </Button>
            </InlineAlert>
          ) : freezeError ? (
            <InlineAlert tone="error" title="Înghețarea a eșuat">
              {freezeError}
            </InlineAlert>
          ) : null}
          {visibleLastQuote ? (
            <section className="quote-result" aria-label="Ultima ofertă înghețată">
              <h3>Ultima ofertă înghețată</h3>
              <p>Această versiune rămâne neschimbată când editezi configurația.</p>
              <a
                className="pilot-create"
                href={quoteHref(visibleLastQuote.productCode, visibleLastQuote.quoteSnapshotId)}
              >
                Deschide oferta înghețată
              </a>
            </section>
          ) : null}
        </SurfacePanel>
      </div>
      <div className="configuration-cost">
        <SurfacePanel title="Cost intern" label="Cost">
          {!confirmation && showConfirmedMember && confirmedMember?.internalCost ? (
            <dl>
              <InfoRow
                label="Cost intern cunoscut (ultima confirmare)"
                value={formatMoney(confirmedMember.internalCost.total, confirmedMember.internalCost.currency)}
              />
              <InfoRow label="Completitudine" value={confirmedMember.internalCost.completenessLabel} />
            </dl>
          ) : !confirmation && showConfirmedMember ? (
            <p>Costul intern este vizibil doar pentru rolul cu acces financiar.</p>
          ) : !confirmation ? (
            <p>Confirmă configurația pentru a citi costul intern cunoscut.</p>
          ) : null}
          {confirmation && !confirmation.financialVisible ? (
            <p className="ui-note" data-testid="internal-cost-owner-only">
              Costul intern este vizibil doar Proprietarului. Prețul clientului nu depinde de el.
            </p>
          ) : null}
          {confirmation ? (
            <CommercialPricePanel
              commercial={confirmation.commercial}
              internalTotal={confirmation.total}
              internalCurrency={confirmation.currency}
              internalCompleteness={confirmation.completeness}
              calculationStatus={confirmation.calculationStatus}
              verificationStatus={confirmation.verificationStatus}
              showCustomerPrice={false}
            />
          ) : null}
          {confirmation?.financialVisible ? <details className="configuration-cost-details" ref={costDetails}>
            <summary>Detalii de calcul și verificare{confirmation.costCompletenessIssues.length > 0 ? ` · ${confirmation.costCompletenessIssues.length}` : ""}</summary>
          {profile ? (
            <div className="stack">
              {confirmation?.completeness !== "COMPLETE" ? (
                <SectionLabel>Linii cunoscute</SectionLabel>
              ) : null}
              <div className="equation" data-testid="profile-cost">
                <p className="equation__label">{profile.label}</p>
                <p className="equation__value">{profile.equationLabel}</p>
              </div>
            </div>
          ) : null}
          {confirmation?.financialVisible &&
          confirmation.costCompletenessIssues.length > 0 ? (
            <CostCompletenessIssues issues={confirmation.costCompletenessIssues} />
          ) : null}
          </details> : null}
        </SurfacePanel>
      </div>
      </div>
      </section>
      <ConfiguratorStateBar state={workState} assembly={Boolean(assemblyId)} note={stateNote}>
        <a className="hit configuration-state-bar__back" href={backHref}>
          <span className="button button--ghost">{backLabel}</span>
        </a>
        {workArea === "configuration" ? (
          <Button disabled={!preview || previewState !== "ready" || confirmPending} onClick={() => setWorkArea("review")}>
            Verifică configurația
          </Button>
        ) : workArea === "review" ? (
          <>
            <Button variant="secondary" onClick={() => setWorkArea("configuration")}>Editează configurația</Button>
            <Button disabled={!ready || confirmPending || !productCode} onClick={() => void confirm()}>Confirmă configurația</Button>
          </>
        ) : null}
      </ConfiguratorStateBar>
      </fieldset>
      <div className="configuration-extension">
      {!assemblyId && customerId && requestId && activeProduct && <ExtendRequestProduct key={`${requestId}:${activeProduct}`} customerId={customerId} requestId={requestId} productCode={activeProduct} reviewId={preview?.reviewId ?? null} values={preview?.formSchema ? valuesForTransport(drafts, preview.formSchema) : valuesBeforeSchema(drafts)} drafts={drafts} confirmed={Boolean(confirmation && priceIsCurrent && !confirmPending && !freezePending && previewState !== "pending")} commercial={commercialPayload()} onPending={setExtensionPending} />}
      </div>
    </SlicePage>
  );
}

/** Commercial & Financial V1 · the offering policy outcome and approval, as the server reports it. */
function OfferingDecision({
  offering,
  note,
  pending,
  error,
  canRequest,
  onNoteChange,
  onRequest,
}: {
  offering: NonNullable<ConfirmTransport["offering"]>;
  note: string;
  pending: boolean;
  error: string | null;
  canRequest: boolean;
  onNoteChange: (value: string) => void;
  onRequest: () => void;
}) {
  // Within the policy there is nothing to decide: the freeze button is the next action.
  if (offering.outcome !== "APPROVAL_REQUIRED") {
    return null;
  }
  const status = offering.approvalStatus;
  return (
    <div className="cfc-offering" data-testid="offering-approval">
      {status === "APPROVED" ? (
        <InlineAlert tone="success" title="Aprobată de Proprietar">
          Varianta aceasta de configurație și preț a fost aprobată
          {offering.approvalDecidedByLabel ? ` de ${offering.approvalDecidedByLabel}` : ""}. Poți îngheța oferta.
        </InlineAlert>
      ) : status === "REQUESTED" ? (
        <InlineAlert tone="pending" title="Așteaptă aprobarea Proprietarului">
          Proprietarul a primit solicitarea. Oferta poate fi înghețată după aprobare; dacă modifici prețul sau configurația, ceri din nou.
        </InlineAlert>
      ) : status === "REJECTED" ? (
        <InlineAlert tone="blocked" title="Respinsă de Proprietar">
          {offering.approvalDecisionReason ? `Motiv: ${offering.approvalDecisionReason}. ` : ""}Modifică prețul sau configurația și cere din nou aprobarea.
        </InlineAlert>
      ) : (
        <InlineAlert tone="blocked" title="Necesită aprobarea Proprietarului">
          {status === "STALE"
            ? "Oferta s-a schimbat după solicitarea anterioară. Cere din nou aprobarea pentru varianta curentă."
            : offering.outcomeMessage ?? "Oferta necesită aprobarea Proprietarului înainte de înghețare."}
        </InlineAlert>
      )}
      {status !== "APPROVED" && status !== "REQUESTED" && canRequest ? (
        <div className="cfc-offering__note">
          <label htmlFor="approval-note">Notă pentru Proprietar (opțional)</label>
          <textarea id="approval-note" rows={2} maxLength={500} value={note} disabled={pending} onChange={(event) => onNoteChange(event.target.value)} />
          <Button variant="secondary" disabled={pending} onClick={onRequest}>
            {pending ? "Se trimite…" : "Trimite spre aprobare"}
          </Button>
        </div>
      ) : null}
      {error ? (
        <InlineAlert tone="error" title="Solicitarea nu a fost trimisă">
          {error}
        </InlineAlert>
      ) : null}
    </div>
  );
}
