import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";
import {
  presentOrderSnapshotId,
  presentQuoteAcceptanceFact,
} from "../adapters/quoteListAdapter";
import { TransportError, readTransportReasons } from "../api/http";
import { confirmQuoteOrder } from "../api/quote";
import { fetchQuoteDocument } from "../api/quote";
import type { QuoteListItemTransport, QuoteSnapshotTransport } from "../api/types";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { invalidateAfterCreateOrder } from "../data/invalidation";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadQuoteEnvelope, loadQuoteSnapshot } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { CommercialPricePanel } from "../presentation/commercialPrice";
import { formatMoney } from "../presentation/format";
import { triggerBrowserDownload } from "../presentation/download";
import { presentCostLine, selectLineByResource } from "../presentation/costLine";
import { presentContextMeta } from "../presentation/contextMeta";
import { FrozenRateAcknowledgementNotice } from "../presentation/rateAcknowledgement";
import { ALUMINIUM_RETURN_PROFILE_RESOURCE_ID } from "../reference/lettersProduct";
import { clientHref, jobHref, quoteHref, requestHref } from "../routing/appRoute";
import { QuoteLines, QuoteRelations, QuoteSummary, type QuoteRelation, type QuoteTotal } from "./quoteDetail";
import { AcceptanceResult } from "./quotes/AcceptanceResult";
import { presentProductQuoteLines, presentProductQuoteTotal } from "./quoteDocumentModel";
import "../styles/surfaces/offers.css";

type QuoteSnapshotPageProps = {
  productCode: string;
  quoteSnapshotId: string;
};

function quoteAcceptanceIdentity(
  envelope: QuoteListItemTransport | null,
  snapshot: QuoteSnapshotTransport | null,
): string {
  const reference = envelope?.reference.trim() ?? "";
  const snapshotId = snapshot?.quoteSnapshotId ?? envelope?.quoteSnapshotId ?? "";
  if (reference && reference !== snapshotId) {
    return reference;
  }
  return snapshot?.productLabel || envelope?.productLabel || "această ofertă";
}

function presentRelations(snapshot: QuoteSnapshotTransport, orderSnapshotId: string | null): QuoteRelation[] {
  return [
    snapshot.customerId
      ? { key: "customer", label: "Client", detail: snapshot.customerDisplayName, href: clientHref(snapshot.customerId), action: "Deschide clientul" }
      : null,
    snapshot.requestId
      ? { key: "request", label: "Cerere", detail: snapshot.requestReference, href: requestHref(snapshot.requestId), action: "Deschide cererea" }
      : null,
    orderSnapshotId
      ? { key: "order", label: "Comandă", detail: null, href: jobHref(orderSnapshotId), action: "Deschide comanda" }
      : null,
  ].filter((relation): relation is QuoteRelation => relation !== null);
}

export function QuoteSnapshotPage({
  productCode,
  quoteSnapshotId,
}: QuoteSnapshotPageProps) {
  const snapshot = useResource(resourceKeys.quote(productCode, quoteSnapshotId), () =>
    loadQuoteSnapshot(productCode, quoteSnapshotId),
  );
  const envelope = useResource(resourceKeys.quoteEnvelope(quoteSnapshotId), () =>
    loadQuoteEnvelope(quoteSnapshotId),
  );
  const [actionState, setActionState] = useState<"idle" | "pending" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [acceptedOrderId, setAcceptedOrderId] = useState<string | null>(null);
  const [documentState, setDocumentState] = useState<"idle" | "pending" | "error">("idle");
  const [documentError, setDocumentError] = useState<string | null>(null);
  const acceptingRef = useRef(false);
  const returnFocusRef = useRef(false);
  const confirmRef = useRef<HTMLElement>(null);
  const acceptButtonRef = useRef<HTMLButtonElement>(null);
  const confirmTitleId = useId();

  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus();
    } else if (returnFocusRef.current) {
      returnFocusRef.current = false;
      acceptButtonRef.current?.focus();
    }
  }, [confirming]);

  function cancelAcceptance(): void {
    if (acceptingRef.current) {
      return;
    }
    returnFocusRef.current = true;
    setConfirming(false);
  }

  async function accept(): Promise<void> {
    if (acceptingRef.current) {
      return;
    }
    acceptingRef.current = true;
    setActionState("pending");
    setActionError(null);
    try {
      const orderId = presentOrderSnapshotId(await confirmQuoteOrder(productCode, quoteSnapshotId));
      if (!orderId) throw new Error("missing_order");
      invalidateAfterCreateOrder(quoteSnapshotId, snapshot.data?.requestId);
      // N-018 · the offer stays open with the acceptance result; the job opens from there.
      setAcceptedOrderId(orderId);
      setConfirming(false);
      setActionState("idle");
    } catch (error) {
      setActionState("error");
      setActionError(
        error instanceof TransportError
          ? readTransportReasons(error.body).join(" ") || (error.status === 403 ? "Doar proprietarul organizației poate confirma comanda." : "Comanda nu a putut fi confirmată. Poți reîncerca în siguranță.")
          : "Confirmarea comenzii a eșuat. Poți reîncerca în siguranță.",
      );
    } finally {
      acceptingRef.current = false;
    }
  }

  async function downloadDocument(): Promise<void> {
    setDocumentState("pending");
    setDocumentError(null);
    const result = await fetchQuoteDocument(productCode, quoteSnapshotId);
    if (!result.ok) {
      const reasons = readTransportReasons(result.body);
      setDocumentState("error");
      setDocumentError(reasons[0] ?? "Documentul ofertei nu este disponibil.");
      return;
    }
    triggerBrowserDownload(result.blob, result.filename ?? "oferta.pdf");
    setDocumentState("idle");
  }

  const presentedSnapshot = snapshot.data ?? null;
  const presentedEnvelope = envelope.data ?? null;
  const stageLabel = presentedEnvelope?.stageLabel ?? presentedSnapshot?.stageLabel;
  const profile = presentedSnapshot
    ? selectLineByResource(presentedSnapshot.lines, ALUMINIUM_RETURN_PROFILE_RESOURCE_ID)
    : null;
  const presented = profile ? presentCostLine(profile) : null;
  const orderSnapshotId = presentedEnvelope?.orderSnapshotId ?? acceptedOrderId;
  const total = presentedSnapshot ? presentProductQuoteTotal(presentedSnapshot) : null;

  return (
    <SlicePage
      contextLabel="Ofertă"
      currentHref={quoteHref(productCode, quoteSnapshotId)}
      workspace="stack"
      surface="quote-detail"
      headerVariant="pilot-compact"
      eyebrow="Ofertă · Produs"
      title={presentedEnvelope?.reference || presentedSnapshot?.productLabel || "Ofertă înghețată"}
      meta={presentContextMeta([
        presentedSnapshot?.customerDisplayName,
        presentedSnapshot?.requestReference,
        presentedSnapshot?.productLabel,
      ])}
    >
      <div className="offers-detail">
        <a className="offers-detail__back text-link" href="/oferte">← Toate ofertele</a>
        {snapshot.status === "error" && !presentedSnapshot ? (
          <InlineAlert tone="error" title="Oferta nu a putut fi citită">
            Oferta nu este disponibilă.{" "}
            <Button variant="secondary" onClick={() => invalidateResources(resourceKeys.quote(productCode, quoteSnapshotId), resourceKeys.quoteEnvelope(quoteSnapshotId))}>Reîncearcă</Button>
          </InlineAlert>
        ) : null}
        {presentedSnapshot ? (
          <>
            <QuoteSummary
              total={total}
              unavailableNote="Prețul pentru client nu este complet în această ofertă."
              facts={[
                { label: "Stare", value: stageLabel ?? "—" },
                { label: "Acceptare", value: presentQuoteAcceptanceFact(presentedEnvelope?.stage ?? null) },
                { label: "Tip", value: presentedEnvelope?.kindLabel || "Produs" },
              ]}
              actions={
                <>
                  <QuoteEnvelopeAction
                    envelope={presentedEnvelope}
                    pending={actionState === "pending" || confirming}
                    confirming={confirming}
                    acceptButtonRef={acceptButtonRef}
                    onAccept={() => {
                      setActionError(null);
                      setConfirming(true);
                    }}
                    onCreateOrder={() => setConfirming(true)}
                  />
                  <Button
                    variant="secondary"
                    disabled={documentState === "pending"}
                    onClick={() => void downloadDocument()}
                  >
                    Descarcă oferta PDF
                  </Button>
                </>
              }
              note="Oferta este înghețată. Acceptarea și comanda păstrează această versiune."
            >
              {confirming && (presentedEnvelope?.nextAction === "ACCEPT_QUOTE" || presentedEnvelope?.nextAction === "CREATE_ORDER") ? (
                <QuoteAcceptanceConfirmation
                  titleId={confirmTitleId}
                  confirmRef={confirmRef}
                  identity={quoteAcceptanceIdentity(presentedEnvelope, presentedSnapshot)}
                  customerName={
                    presentedSnapshot?.customerDisplayName ?? presentedEnvelope.customerDisplayName
                  }
                  requestReference={
                    presentedSnapshot?.requestReference ?? presentedEnvelope.requestReference
                  }
                  total={total}
                  pending={actionState === "pending"}
                  onConfirm={() => void accept()}
                  onCancel={cancelAcceptance}
                />
              ) : null}
              {orderSnapshotId ? (
                <AcceptanceResult
                  reference={presentedEnvelope?.reference || quoteSnapshotId}
                  orderSnapshotId={orderSnapshotId}
                  immediate={acceptedOrderId === orderSnapshotId}
                />
              ) : null}
              {documentError ? (
                <InlineAlert tone="error" title="Documentul nu poate fi descărcat">
                  {documentError}
                </InlineAlert>
              ) : null}
              {actionError ? (
                <InlineAlert tone="error" title="Acțiunea a eșuat">
                  {actionError}
                </InlineAlert>
              ) : null}
            </QuoteSummary>
            <QuoteLines
              caption="Ce se ofertează"
              lines={presentProductQuoteLines(presentedSnapshot, total)}
              total={presentedSnapshot.offerLines.length > 0 ? total : null}
              lineTax={presentedSnapshot.offerLines.length === 0}
            />
            {presentedSnapshot.rateAcknowledgement ? (
              <FrozenRateAcknowledgementNotice
                acknowledgement={presentedSnapshot.rateAcknowledgement}
              />
            ) : null}
            {presentedSnapshot.financialVisible ? (
              <section className="offers-cost" aria-label="Cost intern">
                <details className="quote-analysis">
                  <summary>Cost intern · analiza versiunii înghețate</summary>
                  <CommercialPricePanel
                    commercial={presentedSnapshot.commercial}
                    internalTotal={presentedSnapshot.total}
                    internalCurrency={presentedSnapshot.currency}
                    internalCompleteness={presentedSnapshot.completeness}
                    showCustomerPrice={false}
                  />
                  {presented ? (
                    <div className="equation" data-testid="frozen-profile-cost">
                      <p className="equation__label">{presented.label}</p>
                      <p className="equation__value">{presented.equationLabel}</p>
                      <p className="ui-note">Linia internă nu este preț de vânzare și rămâne înghețată pe această ofertă.</p>
                    </div>
                  ) : null}
                </details>
              </section>
            ) : null}
            <QuoteRelations
              relations={presentRelations(presentedSnapshot, orderSnapshotId)}
              note="Acceptarea și lucrarea rămân pe această versiune înghețată. Configurația nu se reconstruiește."
            />
          </>
        ) : snapshot.status !== "error" ? (
          <LoadingFloor variant="facts" label="Se citește oferta înghețată" />
        ) : null}
      </div>
    </SlicePage>
  );
}

function QuoteAcceptanceConfirmation({
  titleId,
  confirmRef,
  identity,
  customerName,
  requestReference,
  total,
  pending,
  onConfirm,
  onCancel,
}: {
  titleId: string;
  confirmRef: Ref<HTMLElement>;
  identity: string;
  customerName: string | null;
  requestReference: string | null;
  total: QuoteTotal | null;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactNode {
  const customer = customerName?.trim() ?? "";
  const request = requestReference?.trim() ?? "";
  const commercial =
    total && total.grossPrice !== null
      ? [
          total.netPrice !== null ? `Net ${formatMoney(total.netPrice, total.currency)}` : null,
          `Total cu TVA ${formatMoney(total.grossPrice, total.currency)}`,
        ]
          .filter((part): part is string => part !== null)
          .join(" · ")
      : "";
  return (
    <section
      ref={confirmRef}
      className="offers-confirm"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <p className="offers-confirm__title" id={titleId}>
        Confirmi acceptarea ofertei {identity}?
      </p>
      <p className="offers-confirm__body">
        Se înregistrează acceptarea comunicată de client și se creează comanda din această ofertă înghețată.
        {customer ? ` Client: ${customer}.` : ""}
        {request ? ` Cerere: ${request}.` : ""}
        {commercial ? ` ${commercial}.` : ""}
      </p>
      <div className="offers-confirm__actions">
        <Button disabled={pending} onClick={onConfirm}>
          {pending ? "Se creează comanda…" : "Da, confirm comanda"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Renunță
        </Button>
      </div>
    </section>
  );
}

function QuoteEnvelopeAction({
  envelope,
  pending,
  confirming,
  acceptButtonRef,
  onAccept,
  onCreateOrder,
}: {
  envelope: QuoteListItemTransport | null;
  pending: boolean;
  confirming: boolean;
  acceptButtonRef: Ref<HTMLButtonElement>;
  onAccept: () => void;
  onCreateOrder: () => void;
}): ReactNode {
  if (!envelope) {
    return null;
  }
  switch (envelope.nextAction) {
    case "ACCEPT_QUOTE":
      return (
        <Button
          ref={acceptButtonRef}
          disabled={pending}
          aria-expanded={confirming}
          onClick={onAccept}
        >
          Confirmă comanda
        </Button>
      );
    case "CREATE_ORDER":
      return (
        <Button ref={acceptButtonRef} disabled={pending} aria-expanded={confirming} onClick={onCreateOrder}>
          Confirmă comanda
        </Button>
      );
    case "OPEN_ORDER":
      if (!envelope.orderSnapshotId) {
        return null;
      }
      return (
        <a className="hit" href={jobHref(envelope.orderSnapshotId)}>
          <span className="button button--primary">
            {envelope.nextActionLabel || "Deschide comanda"}
          </span>
        </a>
      );
    default:
      return null;
  }
}
