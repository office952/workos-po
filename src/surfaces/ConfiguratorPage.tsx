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
import { LoadingFloor } from "../components/LoadingFloor";
import { SellerSetupPanel } from "../components/SellerSetupPanel";
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
import { SelectField } from "../components/SelectField";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { SlicePage } from "../layout/SlicePage";
import { presentContextMeta } from "../presentation/contextMeta";
import { CommercialPricePanel } from "../presentation/commercialPrice";
import { CostCompletenessIssues } from "../presentation/costCompleteness";
import { presentCostLine, selectLineByResource } from "../presentation/costLine";
import { ALUMINIUM_RETURN_PROFILE_RESOURCE_ID } from "../reference/lettersProduct";
import { catalogHref, quoteHref } from "../routing/appRoute";
import {
  labelsMatchingContext,
  lastQuoteOwnedByContext,
  ownedDraftsForContext,
  readConfiguratorSession,
  writeConfiguratorSession,
  type ConfiguratorContext,
  type FrozenQuoteRef,
} from "../session/configuratorSession";

type PreviewState = "idle" | "pending" | "ready" | "error";
type ActionState = "idle" | "pending" | "error";

export type ConfiguratorPageProps = ConfiguratorContext & {
  assemblyId?: string | null;
  memberRole?: "SUPPORT_PANEL" | "SIGNAGE_LETTERS" | null;
};

export const INITIAL_PREVIEW_DEBOUNCE_MS = 0;
export const EDIT_PREVIEW_DEBOUNCE_MS = 250;

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
  const context: ConfiguratorContext = { customerId, requestId, productCode };
  const stored = readConfiguratorSession();
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    ownedDraftsForContext(stored, context),
  );
  const [preview, setPreview] = useState<PreviewTransport | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ActionState>("idle");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmTransport | null>(null);
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

  const schemaRef = useRef<PresentedFormSchema | null>(null);
  const draftsDirtyRef = useRef(false);
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

  useEffect(() => {
    const stored = readConfiguratorSession();
    writeConfiguratorSession({
      drafts,
      draftContext: { customerId, requestId, productCode },
      customerId,
      requestId,
      productCode,
      lastQuote,
      ...labelsMatchingContext(stored, { customerId, requestId }),
    });
  }, [customerId, drafts, lastQuote, productCode, requestId]);

  useEffect(() => {
    if (!productCode) {
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
          const presented = presentPreview(
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
  }, [draftKey, drafts, productCode, requestId]);

  function updateField(fieldId: string, value: string): void {
    draftsDirtyRef.current = true;
    setDrafts((current) => ({ ...current, [fieldId]: value }));
    setConfirmation(null);
    setConfirmState("idle");
    setFreezeState("idle");
  }

  async function confirm(): Promise<void> {
    if (!preview?.reviewId || !activeProduct) {
      return;
    }
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
      if (!presented) {
        setConfirmState("error");
        setConfirmError("Confirmarea nu poate fi prezentată.");
        return;
      }
      setConfirmation(presented);
      if (assemblyId && memberRole) {
        await postJson(`/api/assemblies/${encodeURIComponent(assemblyId)}/members`, {
          role: memberRole,
          values: currentTransportValues(),
          reviewId: preview.reviewId,
          ...(requestId ? { requestId } : {}),
        });
        invalidateResources(`assembly:${assemblyId}`);
      }
      if (presented.pricingMethod) {
        setPricingMethod(presented.pricingMethod);
      }
      if (presented.quoteCommercialTerms) {
        applyQuoteTerms(presented.quoteCommercialTerms, presented.quoteTermsFromDefaults);
      } else if (presented.organizationDefaults) {
        applyQuoteTerms(presented.organizationDefaults, true);
      }
      setConfirmState("idle");
    } catch (error) {
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
      setFreezeError("Datele firmei trebuie configurate înainte de a crea oferta.");
      return;
    }
    if (!customerId) {
      setFreezeState("error");
      setFreezeError("Selectează un client înainte de a crea oferta.");
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
  const ready = preview?.readiness === "ready" && preview.reviewId !== null;
  const confirmPending = confirmState === "pending";
  const freezePending = freezeState === "pending";
  const freezeBlocked = sellerConfigured !== true || customerId === null;
  const validCustomerPrice =
    confirmation?.commercial?.completeness === "COMPLETE" &&
    confirmation.commercial.netPrice !== null &&
    confirmation.commercial.unavailableReasons.length === 0;
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
      eyebrow="Configurator"
      title={preview?.product.label ?? "Configurator"}
      lead="Completează faptele confirmate, verifică costul intern și prețul clientului, apoi îngheață oferta."
      meta={presentContextMeta([
        labelsMatchingContext(stored, context).customerLabel,
        labelsMatchingContext(stored, context).requestLabel,
        "Costul intern nu este preț de vânzare.",
      ])}
      action={
        <Button
          disabled={!ready || confirmPending || previewState === "pending" || !productCode}
          onClick={() => {
            void confirm();
          }}
        >
          Confirmă configurația
        </Button>
      }
    >
      <div id="configuratie">
      <SurfacePanel
        title="Configurație"
        label="Configurare"
        status={
          <StatusBadge
            label={
              !productCode
                ? "Fără produs"
                : preview?.readiness === "ready"
                  ? "Pregătit"
                  : preview?.readiness === "blocked"
                    ? "Incomplet"
                    : "Se citește"
            }
            tone={
              preview?.readiness === "ready"
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
            Alege produsul din catalog, împreună cu clientul și cererea.{" "}
            <a
              className="text-link"
              href={catalogHref({ customerId, requestId, productCode: null })}
            >
              Deschide catalogul
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
          </InlineAlert>
        ) : null}
        {preview?.formSchema?.sections.map((section) => (
          <fieldset key={section.id} className="stack fieldset">
            <legend className="fieldset__legend">{section.title}</legend>
            {section.fields.map((field) =>
              field.type === "select" ? (
                <SelectField
                  key={field.id}
                  id={field.id}
                  label={field.label}
                  value={drafts[field.id] ?? ""}
                  hint={field.hint}
                  options={field.options}
                  onChange={(value) => updateField(field.id, value)}
                />
              ) : (
                <TextField
                  key={field.id}
                  id={field.id}
                  label={field.label}
                  value={drafts[field.id] ?? ""}
                  hint={field.hint}
                  inputMode={field.type === "number" ? "decimal" : "text"}
                  onChange={(value) => updateField(field.id, value)}
                />
              ),
            )}
          </fieldset>
        ))}
      </SurfacePanel>
      </div>
      <div className="stack">
        <SurfacePanel variant="quiet" title="Stare și acțiune" label="Stare">
          {previewState === "pending" ? (
            <LoadingIndicator label="Se actualizează previzualizarea" />
          ) : null}
          {sellerConfigured === false ? (
            <SellerSetupPanel
              onSaved={() => {
                setFreezeError(null);
              }}
            />
          ) : null}
          {customerId === null ? (
            <InlineAlert tone="blocked" title="Client lipsă">
              Selectează un client înainte de a crea oferta. Poți pregăti prețul ofertei
              și fără client, dar înghețarea rămâne blocată.
            </InlineAlert>
          ) : null}
          {requestId === null ? (
            <InlineAlert tone="blocked" title="Cerere lipsă">
              Leagă configurația de o cerere înainte de oferta lucrării. Termenii
              comerciali pot fi pregătiți și fără cerere.
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
              Confirmarea trimite valorile curente. Calculul rămâne la motorul de produs.
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
          {confirmation?.financialVisible &&
          !profile &&
          confirmation.costCompletenessIssues.length === 0 ? (
            <InlineAlert tone="blocked" title="Profilul nu are tarif">
              {confirmation.completenessReasons.join(" ") ||
                "Nu există o linie de cost pentru acest profil."}
            </InlineAlert>
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
                {validCustomerPrice ? "Actualizează prețul" : "Calculează prețul"}
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
          {priceNotReady && !calculatedUnavailable ? (
            <InlineAlert tone="blocked" title="Prețul nu este gata">
              Completează metoda de preț și calculează prețul înainte de a îngheța oferta.
            </InlineAlert>
          ) : null}
          {confirmation && !assemblyId ? (
            <Button
              disabled={freezePending || freezeBlocked || !validCustomerPrice}
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
            <p>
              <a
                className="text-link"
                href={quoteHref(visibleLastQuote.productCode, visibleLastQuote.quoteSnapshotId)}
              >
                Deschide oferta înghețată
              </a>
            </p>
          ) : null}
        </SurfacePanel>
      </div>
    </SlicePage>
  );
}
