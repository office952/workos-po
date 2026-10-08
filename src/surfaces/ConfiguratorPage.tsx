import { loadAssemblyMember } from "../api/assemblies";
import { useEffect, useRef, useState } from "react";
import { presentConfirm } from "../adapters/confirmAdapter";
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
import { ConfigurationSections } from "../components/ConfigurationSections";
import { LoadingFloor } from "../components/LoadingFloor";
import "../styles/surfaces/commercial.css";
import "../styles/surfaces/configuration-workbench.css";
import { SellerSetupPanel } from "../components/SellerSetupPanel";
import { ExtendRequestProduct } from "../components/ExtendRequestProduct";
import { invalidateAfterFreezeQuote } from "../data/invalidation";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadSellerConfigured } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import type {
  ConfirmTransport,
  DraftValues,
  PresentedFormSchema,
  PreviewTransport,
  QuoteCommercialTermsTransport,
} from "../api/types";
import { Button } from "../components/Button";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { SectionLabel } from "../components/SectionLabel";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { SlicePage } from "../layout/SlicePage";
import { presentContextMeta } from "../presentation/contextMeta";
import { CommercialPricePanel } from "../presentation/commercialPrice";
import { CostCompletenessIssues } from "../presentation/costCompleteness";
import { presentCostLine, selectLineByResource } from "../presentation/costLine";
import { ALUMINIUM_RETURN_PROFILE_RESOURCE_ID } from "../reference/lettersProduct";
import { requestProductHref, requestHref, quoteHref } from "../routing/appRoute";
import {
  labelsMatchingContext,
  lastQuoteOwnedByContext,
  ownedDraftsForContext,
  readConfiguratorSession,
  writeConfiguratorSession,
  type ConfiguratorContext,
  type FrozenQuoteRef,
} from "../session/configuratorSession";

function commercialResultKey(input: {
  pricingMethod: "PRODUCT_COST_PLUS" | "MANUAL_FIXED_PRODUCT";
  markupDraft: string;
  discountDraft: string;
  adjustmentDraft: string;
  manualNetDraft: string;
  reviewId: string | null;
}): string {
  return JSON.stringify(input);
}

type PreviewState = "idle" | "pending" | "ready" | "error";
type ActionState = "idle" | "pending" | "error";

export type AssemblyMemberRole = "SUPPORT_PANEL" | "SIGNAGE_LETTERS" | "SIGNAGE_LOGO";

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

export type ConfiguratorPageProps = ConfiguratorContext & {
  assemblyId?: string | null;
  memberRole?: AssemblyMemberRole | null;
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
}: ConfiguratorPageProps) {
  const context: ConfiguratorContext = { customerId, requestId, productCode, ...(assemblyId ? { assemblyId } : {}) };
  const stored = readConfiguratorSession();
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    ownedDraftsForContext(stored, context),
  );
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
  const [manualNetDraft, setManualNetDraft] = useState("");
  const [pricingMethod, setPricingMethod] = useState<
    "PRODUCT_COST_PLUS" | "MANUAL_FIXED_PRODUCT"
  >("PRODUCT_COST_PLUS");
  const [quoteMarkupDraft, setQuoteMarkupDraft] = useState("");
  const [quoteDiscountDraft, setQuoteDiscountDraft] = useState("");
  const [quoteAdjustmentDraft, setQuoteAdjustmentDraft] = useState("");
  const [termsOrigin, setTermsOrigin] = useState<"defaults" | "quote">("defaults");
  const seller = useResource(resourceKeys.seller(), loadSellerConfigured);
  const sellerConfigured = seller.status === "success" ? seller.data : null;
  const [lastQuote, setLastQuote] = useState<FrozenQuoteRef | null>(() =>
    lastQuoteOwnedByContext(stored.lastQuote, context),
  );

  const member = useResource(assemblyId && memberRole ? `assembly-member:${assemblyId}:${memberRole}` : null, () => loadAssemblyMember({ assemblyId: assemblyId!, role: memberRole!, customerId, requestId, productCode }));
  const [seedApplied, setSeedApplied] = useState(false);
  if (member.data && !seedApplied) {
    if (Object.keys(drafts).length === 0) setDrafts(member.data);
    setSeedApplied(true);
  }

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

  function parseCommercialNumber(value: string): number | null {
    const trimmed = value.trim().replace(",", ".");
    if (trimmed === "") {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function applyQuoteTerms(terms: QuoteCommercialTermsTransport, fromDefaults: boolean): void {
    setQuoteMarkupDraft(String(terms.markupPercent));
    setQuoteDiscountDraft(String(terms.discountPercent));
    setQuoteAdjustmentDraft(String(terms.adjustmentAmount));
    setTermsOrigin(fromDefaults ? "defaults" : "quote");
  }

  function currentQuoteTerms(): QuoteCommercialTermsTransport | null {
    const markupPercent = parseCommercialNumber(quoteMarkupDraft);
    const discountPercent = parseCommercialNumber(quoteDiscountDraft);
    const adjustmentAmount = parseCommercialNumber(quoteAdjustmentDraft);
    if (markupPercent === null || discountPercent === null || adjustmentAmount === null) {
      return null;
    }
    return { markupPercent, discountPercent, adjustmentAmount };
  }

  function commercialPayload(): {
    pricingMethod: "PRODUCT_COST_PLUS" | "MANUAL_FIXED_PRODUCT";
    quoteCommercialTerms?: QuoteCommercialTermsTransport;
    manualProductNetPrice?: number;
  } {
    const net = parsedManualNet();
    const terms = currentQuoteTerms();
    return {
      pricingMethod,
      ...(terms ? { quoteCommercialTerms: terms } : {}),
      ...(pricingMethod === "MANUAL_FIXED_PRODUCT" && net !== null
        ? { manualProductNetPrice: net }
        : {}),
    };
  }

  function currentTransportValues(): DraftValues {
    return schemaRef.current
      ? valuesForTransport(drafts, schemaRef.current)
      : valuesBeforeSchema(drafts);
  }

  function currentCommercialResultKey(reviewId: string | null = preview?.reviewId ?? null): string {
    return commercialResultKey({
      pricingMethod,
      markupDraft: quoteMarkupDraft,
      discountDraft: quoteDiscountDraft,
      adjustmentDraft: quoteAdjustmentDraft,
      manualNetDraft: pricingMethod === "MANUAL_FIXED_PRODUCT" ? manualNetDraft : "",
      reviewId,
    });
  }
  const latestResultKey = useRef("");
  useEffect(() => { latestResultKey.current = currentCommercialResultKey(); });
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
      ...labelsMatchingContext(stored, { customerId, requestId }),
    });
  }, [assemblyId, customerId, drafts, lastQuote, productCode, requestId]);

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

  function updateField(fieldId: string, value: string): void {
    confirmGeneration.current += 1;
    draftsDirtyRef.current = true;
    setPreviewState("pending");
    setDrafts((current) => ({ ...current, [fieldId]: value }));
    setConfirmation(null);
    setPricedResultKey(null);
    setConfirmState("idle");
    setFreezeState("idle");
  }

  async function confirm(): Promise<void> {
    if (!preview?.reviewId || !activeProduct) {
      return;
    }
    const generation = ++confirmGeneration.current;
    const sentKey = currentCommercialResultKey(preview.reviewId);
    setConfirmState("pending");
    setConfirmError(null);
    try {
      const presented = presentConfirm(
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
      setConfirmation(presented);
      const editedDuringFlight = latestResultKey.current !== sentKey;
      if (editedDuringFlight) {
        setPricedResultKey(sentKey);
      } else {
        const nextMethod = presented.pricingMethod ?? pricingMethod;
        const nextTerms = presented.quoteCommercialTerms ??
          presented.organizationDefaults ??
          currentQuoteTerms();
        if (presented.pricingMethod) {
          setPricingMethod(presented.pricingMethod);
        }
        if (presented.quoteCommercialTerms) {
          applyQuoteTerms(presented.quoteCommercialTerms, presented.quoteTermsFromDefaults);
        } else if (presented.organizationDefaults) {
          applyQuoteTerms(presented.organizationDefaults, true);
        }
        setPricedResultKey(
          commercialResultKey({
            pricingMethod: nextMethod,
            markupDraft: nextTerms ? String(nextTerms.markupPercent) : quoteMarkupDraft,
            discountDraft: nextTerms ? String(nextTerms.discountPercent) : quoteDiscountDraft,
            adjustmentDraft: nextTerms ? String(nextTerms.adjustmentAmount) : quoteAdjustmentDraft,
            manualNetDraft:
              nextMethod === "MANUAL_FIXED_PRODUCT"
                ? String(presented.commercial?.netPrice ?? manualNetDraft)
                : "",
            reviewId: preview.reviewId,
          }),
        );
      }
      if (assemblyId && memberRole) {
        await postJson(`/api/assemblies/${encodeURIComponent(assemblyId)}/members`, {
          role: memberRole,
          values: currentTransportValues(),
          reviewId: preview.reviewId,
          ...(requestId ? { requestId } : {}),
          ...commercialPayload(),
        });
        if (generation !== confirmGeneration.current) {
          return;
        }
        invalidateResources(`assembly:${assemblyId}`);
      }
      setConfirmState("idle");
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

  async function freeze(): Promise<void> {
    if (!preview?.reviewId || !confirmation || !activeProduct) {
      return;
    }
    if (sellerConfigured !== true) {
      setFreezeState("error");
      setFreezeError(
        seller.status === "error"
          ? "Nu am putut verifica datele firmei emitente."
          : "Datele firmei emitente lipsesc.",
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
    setFreezeState("pending");
    setFreezeError(null);
    try {
      const presented = presentQuoteSnapshot(
        await postQuoteSnapshot(activeProduct, {
          values: currentTransportValues(),
          reviewId: preview.reviewId,
          customerId,
          ...(requestId ? { requestId } : {}),
          ...commercialPayload(),
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
      invalidateAfterFreezeQuote();
      setFreezeState("idle");
    } catch (error) {
      setFreezeState("error");
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
  const freezeBlocked =
    sellerConfigured !== true ||
    customerId === null ||
    confirmPending ||
    !validCustomerPrice;
  const calculatedUnavailable = Boolean(
    confirmation && !confirmation.calculatedPriceAvailable,
  );
  const verificationIssues =
    confirmation?.costCompletenessIssues.filter(
      (issue) => issue.impact === "REQUIRES_VERIFICATION",
    ) ?? [];
  const blockingIssues =
    confirmation?.costCompletenessIssues.filter(
      (issue) => issue.impact === "BLOCKS_CALCULATION",
    ) ?? [];
  const priceNotReady = Boolean(confirmation && !validCustomerPrice);
  const organizationDefaults = confirmation?.organizationDefaults;
  return (
    <SlicePage
      contextLabel="Configurator"
      currentHref="/configurator"
      workspace="configuration"
      surface="configuration-workbench"
      headerVariant="default"
      eyebrow="Pregătire produs"
      title="Configurator"
      lead="Configurează produsul, verifică datele și pregătește oferta pentru această cerere."
      meta={presentContextMeta([
        labelsMatchingContext(stored, context).customerLabel,
        labelsMatchingContext(stored, context).requestLabel,
        "Costul intern nu este preț de vânzare.",
      ])}
    >
      <div className="commercial-toolbar">
        <a className="text-link" href={requestId ? requestHref(requestId) : "/cereri"}>← Înapoi la cerere</a>
        <nav className="configuration-jump" aria-label="Etapele configurării">
          <a href="#configuratie">Configurație</a>
          <a href="#pregatire-oferta">Pregătire ofertă</a>
        </nav>
      </div>
      {member.status === "error" && <InlineAlert tone="error" title="Configurația din ansamblu nu a putut fi citită"><Button variant="secondary" onClick={() => invalidateResources(`assembly-member:${assemblyId}:${memberRole}`)}>Reîncearcă citirea configurației</Button></InlineAlert>}
      <fieldset className="configuration-lock" disabled={extensionPending || freezePending || Boolean(assemblyId && memberRole && !seedApplied)}>
        <legend className="sr-only">Configurație și preț</legend>
      <div className="configuration-construction">
      <div id="configuratie" className="configuration-editor">
      <SurfacePanel
        title={preview?.product.label ?? "Configurație"}
        label="Configurare"
        status={
          <StatusBadge
            label={
              !productCode
                ? "Fără produs"
                : previewState === "pending"
                  ? "Se actualizează"
                  : previewState === "error"
                    ? "Verificare indisponibilă"
                : preview?.readiness === "ready"
                  ? "Pregătit"
                  : preview?.readiness === "blocked"
                    ? "Incomplet"
                    : "Se citește"
            }
            tone={
              previewState !== "ready"
                ? "pending"
                : preview?.readiness === "ready"
                ? "ready"
                : preview?.readiness === "blocked" || !productCode
                  ? "incomplete"
                  : "pending"
            }
          />
        }
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
        {previewError ? (
          <InlineAlert
            tone="error"
            title={
              previewError.includes("nu este oferit")
                ? "Produsul nu este oferit"
                : "Previzualizare indisponibilă"
            }
          >
            {previewError}
            <Button variant="secondary" onClick={() => {
              setPreviewState("pending");
              setPreviewAttempt((attempt) => attempt + 1);
            }}>
              Reîncearcă previzualizarea
            </Button>
          </InlineAlert>
        ) : null}
        {preview ? (
          <ConfigurationSections key={`${customerId}:${requestId}:${productCode}:${assemblyId}:${memberRole}`}
            preview={preview} drafts={drafts} onChange={updateField} />
        ) : null}
      </SurfacePanel>
      </div>
      <div className="stack configuration-review">
        <SurfacePanel variant="quiet" title="Stare și acțiune" label="Stare">
          {previewState === "pending" ? (
            <LoadingIndicator label="Se actualizează previzualizarea" />
          ) : null}
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
            <SellerSetupPanel
              onSaved={() => {
                setFreezeError(null);
              }}
            />
          ) : null}
          {customerId === null || requestId === null ? (
            <InlineAlert tone="blocked" title="Context comercial incomplet">
              Completează clientul și cererea pentru a continua traseul asistat către ofertă.
              Draftul tehnic local rămâne disponibil.
              {productCode ? (
                <a className="text-link" href="/cereri/noua">Creează o cerere</a>
              ) : null}
            </InlineAlert>
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
          <Button
            disabled={!ready || confirmPending || !productCode}
            onClick={() => void confirm()}
          >
            Confirmă configurația
          </Button>
        </SurfacePanel>
        <SurfacePanel title="Cost intern" label="Cost">
          {!confirmation ? (
            <p>Confirmă configurația pentru a citi costul intern cunoscut.</p>
          ) : null}
          {confirmation && !confirmation.financialVisible ? (
            <InlineAlert tone="blocked" title="Cost intern indisponibil">
              Contextul financiar nu este vizibil pentru acest rol.
            </InlineAlert>
          ) : null}
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
          {confirmation?.financialVisible &&
          confirmation.costCompletenessIssues.length > 0 ? (
            <CostCompletenessIssues issues={confirmation.costCompletenessIssues} />
          ) : null}
        </SurfacePanel>
      </div>
      </div>
      <section id="pregatire-oferta" className="configuration-commercial" aria-labelledby="pregatire-oferta-title">
        <div className="configuration-commercial__heading">
          <h2 id="pregatire-oferta-title">Pregătire ofertă</h2>
          <p>Termenii și prețul clientului pentru configurația confirmată.</p>
        </div>
        <div className="configuration-commercial__grid">
        <SurfacePanel title="Cum stabilești prețul acestei oferte" label="Preț">
          {!confirmation ? (
            <p>După confirmarea configurației alegi metoda de preț pentru această ofertă.</p>
          ) : (
            <>
              <fieldset className="fieldset">
                <legend className="fieldset__legend">Cum stabilești prețul acestei oferte?</legend>
                <div className="choice-stack">
                  <label
                    className={`choice-card${
                      pricingMethod === "PRODUCT_COST_PLUS" ? " choice-card--selected" : ""
                    }${calculatedUnavailable ? " choice-card--unavailable" : ""}`}
                    htmlFor="pricingMethodCalculated"
                  >
                    <input
                      id="pricingMethodCalculated"
                      type="radio"
                      name="pricingMethod"
                      value="PRODUCT_COST_PLUS"
                      checked={pricingMethod === "PRODUCT_COST_PLUS"}
                      disabled={calculatedUnavailable}
                      onChange={() => setPricingMethod("PRODUCT_COST_PLUS")}
                    />
                    <span>
                      <p className="choice-card__title">Calculat din costuri</p>
                      <p className="choice-card__copy">
                        WorkOS calculează prețul pornind de la costul intern și termenii
                        comerciali ai acestei oferte.
                      </p>
                      {calculatedUnavailable ? (
                        <p className="choice-card__status">Indisponibil momentan</p>
                      ) : null}
                    </span>
                  </label>
                  <label
                    className={`choice-card${
                      pricingMethod === "MANUAL_FIXED_PRODUCT" ? " choice-card--selected" : ""
                    }`}
                    htmlFor="pricingMethodManual"
                  >
                    <input
                      id="pricingMethodManual"
                      type="radio"
                      name="pricingMethod"
                      value="MANUAL_FIXED_PRODUCT"
                      checked={pricingMethod === "MANUAL_FIXED_PRODUCT"}
                      onChange={() => setPricingMethod("MANUAL_FIXED_PRODUCT")}
                    />
                    <span>
                      <p className="choice-card__title">Preț net negociat manual</p>
                      <p className="choice-card__copy">
                        Introdu suma netă pe care vrei să o oferi clientului pentru acest
                        produs. TVA se aplică automat.
                      </p>
                    </span>
                  </label>
                </div>
              </fieldset>
              {calculatedUnavailable ? (
                <InlineAlert tone="pending" title="Calculul automat nu este disponibil">
                  Calculul automat nu este disponibil deoarece costul intern este
                  incomplet.{" "}
                  {confirmation.financialVisible && blockingIssues.length > 0 ? (
                    <a className="text-link" href="#cost-intern-gaps">
                      Vezi ce lipsește
                    </a>
                  ) : null}
                </InlineAlert>
              ) : null}
              {!calculatedUnavailable && verificationIssues.length > 0 ? (
                <InlineAlert tone="pending" title="Necesită verificare">
                  {verificationIssues.length === 1
                    ? "Calculul folosește 1 valoare care necesită verificare."
                    : `Calculul folosește ${verificationIssues.length} valori care necesită verificare.`}
                </InlineAlert>
              ) : null}
              {confirmation.financialVisible &&
              pricingMethod === "PRODUCT_COST_PLUS" &&
              !calculatedUnavailable ? (
                <div className="stack" data-testid="quote-commercial-terms">
                  <p>Termeni comerciali ai acestei oferte</p>
                  <p>
                    {termsOrigin === "defaults"
                      ? "Pornit din valorile implicite ale firmei."
                      : "Valorile au fost schimbate doar pentru această ofertă."}
                  </p>
                  <TextField
                    id="quoteMarkupPercent"
                    label="Adaos pentru această ofertă (%)"
                    value={quoteMarkupDraft}
                    inputMode="decimal"
                    hint="Procentul de adaos se aplică doar acestei oferte, nu politicii firmei."
                    onChange={(value) => {
                      setQuoteMarkupDraft(value);
                      setTermsOrigin("quote");
                    }}
                  />
                  <TextField
                    id="quoteDiscountPercent"
                    label="Discount pentru această ofertă (%)"
                    value={quoteDiscountDraft}
                    inputMode="decimal"
                    hint="Discountul este net, înainte de TVA, și doar pentru această ofertă."
                    onChange={(value) => {
                      setQuoteDiscountDraft(value);
                      setTermsOrigin("quote");
                    }}
                  />
                  <TextField
                    id="quoteAdjustmentAmount"
                    label="Ajustare netă (+/- EUR)"
                    value={quoteAdjustmentDraft}
                    inputMode="decimal"
                    hint="Sumă netă, fără TVA, adăugată sau scăzută doar din această ofertă."
                    onChange={(value) => {
                      setQuoteAdjustmentDraft(value);
                      setTermsOrigin("quote");
                    }}
                  />
                  {organizationDefaults ? (
                    <button
                      type="button"
                      className="quiet-action"
                      onClick={() => {
                        applyQuoteTerms(organizationDefaults, true);
                      }}
                    >
                      Revino la valorile implicite
                    </button>
                  ) : null}
                </div>
              ) : null}
              {confirmation.manualProductPriceAuthorized &&
              pricingMethod === "MANUAL_FIXED_PRODUCT" ? (
                <div className="stack" data-testid="manual-product-price">
                  <TextField
                    id="manualProductNetPrice"
                    label="Preț net negociat al produsului, fără TVA"
                    value={manualNetDraft}
                    inputMode="decimal"
                    hint="Introdu suma netă pe care vrei să o oferi clientului pentru produs. Această sumă înlocuiește calculul automat cost + adaos − discount pentru această ofertă. TVA se aplică separat. Serviciile și montajul se tratează separat."
                    onChange={setManualNetDraft}
                  />
                  <p>Costul intern rămâne separat și nu este modificat de prețul manual.</p>
                </div>
              ) : null}
              <Button
                disabled={confirmPending}
                onClick={() => {
                  void confirm();
                }}
              >
                {serverCustomerPriceReady ? "Actualizează prețul" : "Calculează prețul"}
              </Button>
            </>
          )}
        </SurfacePanel>
        <SurfacePanel title="Preț client" label="Rezultat">
          {confirmation && pricingMethod === "PRODUCT_COST_PLUS" && validCustomerPrice ? (
            <dl>
              {confirmation.commercial?.markupPercent !== null &&
              confirmation.commercial?.markupPercent !== undefined ? (
                <InfoRow
                  label="Adaos"
                  value={`${confirmation.commercial.markupPercent}%`}
                />
              ) : null}
              {confirmation.commercial?.discountPercent !== null &&
              confirmation.commercial?.discountPercent !== undefined ? (
                <InfoRow
                  label="Discount"
                  value={`${confirmation.commercial.discountPercent}%`}
                />
              ) : null}
              {confirmation.commercial?.adjustmentAmount !== null &&
              confirmation.commercial?.adjustmentAmount !== undefined ? (
                <InfoRow
                  label="Ajustare"
                  value={`${confirmation.commercial.adjustmentAmount} EUR`}
                />
              ) : null}
            </dl>
          ) : null}
          {confirmation ? (
            <CommercialPricePanel
              commercial={confirmation.commercial}
              internalTotal={null}
              internalCurrency={confirmation.currency}
              showInternalCost={false}
              showCustomerPrice
            />
          ) : (
            <p>Prețul clientului apare după calculul de pe server.</p>
          )}
          {confirmation && serverCustomerPriceReady && !priceIsCurrent ? (
            <InlineAlert tone="blocked" title="Preț neactualizat">
              Termenii comerciali s-au schimbat față de ultimul calcul. Suma afișată mai jos este
              rezultatul precedent; actualizează prețul înainte de înghețare.
            </InlineAlert>
          ) : null}
          {priceNotReady && !calculatedUnavailable && priceIsCurrent ? (
            <InlineAlert tone="blocked" title="Prețul nu este gata">
              Completează metoda de preț și calculează prețul înainte de a îngheța oferta.
            </InlineAlert>
          ) : null}
          {confirmation && !assemblyId ? (
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
              <a className="text-link" href={`/ansamblu?assembly=${encodeURIComponent(assemblyId)}`}>
                Înapoi la ansamblu
              </a>
            </p>
          ) : null}
          {freezePending ? <LoadingIndicator label="Se îngheață oferta" /> : null}
          {freezeError ? (
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
      </section>
      </fieldset>
      {!assemblyId && customerId && requestId && activeProduct && <ExtendRequestProduct key={`${requestId}:${activeProduct}`} customerId={customerId} requestId={requestId} productCode={activeProduct} reviewId={preview?.reviewId ?? null} values={preview?.formSchema ? valuesForTransport(drafts, preview.formSchema) : valuesBeforeSchema(drafts)} drafts={drafts} confirmed={Boolean(confirmation && priceIsCurrent && !confirmPending && !freezePending && previewState !== "pending")} commercial={commercialPayload()} onPending={setExtensionPending} />}
    </SlicePage>
  );
}
