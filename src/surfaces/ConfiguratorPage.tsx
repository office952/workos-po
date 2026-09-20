import { useEffect, useRef, useState } from "react";
import { presentConfirm } from "../adapters/confirmAdapter";
import {
  valuesBeforeSchema,
  valuesForTransport,
} from "../adapters/formSchemaAdapter";
import { presentPreview } from "../adapters/previewAdapter";
import { presentQuoteSnapshot } from "../adapters/quoteAdapter";
import { postConfigurationConfirm } from "../api/confirm";
import { TransportError, readTransportErrorCode, readTransportReasons } from "../api/http";
import { postConfigurationPreview } from "../api/preview";
import { postQuoteSnapshot } from "../api/quote";
import { LoadingFloor } from "../components/LoadingFloor";
import { SellerSetupPanel } from "../components/SellerSetupPanel";
import { invalidateAfterFreezeQuote } from "../data/invalidation";
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
import { LoadingIndicator } from "../components/LoadingIndicator";
import { SelectField } from "../components/SelectField";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { SlicePage } from "../layout/SlicePage";
import { presentContextMeta } from "../presentation/contextMeta";
import { CommercialPricePanel } from "../presentation/commercialPrice";
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

export type ConfiguratorPageProps = ConfiguratorContext;

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
        } catch {
          if (!cancelled) {
            setPreviewState("error");
            setPreviewError("Previzualizarea nu este disponibilă.");
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
        }),
        preview.reviewId,
      );
      if (!presented) {
        setConfirmState("error");
        setConfirmError("Confirmarea nu poate fi prezentată.");
        return;
      }
      setConfirmation(presented);
      setConfirmState("idle");
    } catch (error) {
      setConfirmState("error");
      setConfirmError(
        error instanceof TransportError && error.status === 409
          ? "Configurația s-a schimbat. Reia previzualizarea."
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
          Confirmă
        </Button>
      }
    >
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
          <InlineAlert tone="error" title="Previzualizare indisponibilă">
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
              Selectează un client înainte de a crea oferta.
            </InlineAlert>
          ) : null}
          {requestId === null ? (
            <InlineAlert tone="blocked" title="Cerere lipsă">
              Leagă configurația de o cerere înainte de oferta lucrării.
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
        <SurfacePanel title="Cost intern și preț client" label="Valori">
          {!confirmation ? (
            <p>Confirmă configurația pentru a citi costul intern și prețul clientului.</p>
          ) : null}
          {confirmation && !confirmation.financialVisible ? (
            <InlineAlert tone="blocked" title="Cost intern indisponibil">
              Contextul financiar nu este vizibil pentru acest rol.
            </InlineAlert>
          ) : null}
          {profile ? (
            <div className="equation" data-testid="profile-cost">
              <p className="equation__label">{profile.label}</p>
              <p className="equation__value">{profile.equationLabel}</p>
            </div>
          ) : null}
          {confirmation?.financialVisible && !profile ? (
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
            />
          ) : null}
          {confirmation?.quoteBlocker ? (
            <InlineAlert tone="blocked" title="Oferta nu poate fi creată">
              {confirmation.quoteBlocker}
            </InlineAlert>
          ) : null}
          {confirmation ? (
            <Button
              disabled={freezePending || freezeBlocked || Boolean(confirmation.quoteBlocker)}
              onClick={() => {
                void freeze();
              }}
            >
              Îngheață oferta
            </Button>
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
