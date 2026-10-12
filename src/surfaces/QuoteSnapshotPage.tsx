import { useState, type ReactNode } from "react";
import {
  presentOrderSnapshotId,
  presentQuoteAcceptanceFact,
} from "../adapters/quoteListAdapter";
import { TransportError, readTransportReasons } from "../api/http";
import { postQuoteAcceptance, postQuoteOrder } from "../api/lifecycle";
import { fetchQuoteDocument } from "../api/quote";
import type { QuoteListItemTransport, QuoteSnapshotTransport } from "../api/types";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { invalidateAfterAcceptQuote, invalidateAfterCreateOrder } from "../data/invalidation";
import { resourceKeys } from "../data/resourceKeys";
import { loadQuoteEnvelope, loadQuoteSnapshot } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { CommercialPricePanel } from "../presentation/commercialPrice";
import { presentCustomerPrice } from "../presentation/customerPrice";
import { triggerBrowserDownload } from "../presentation/download";
import { presentCostLine, selectLineByResource } from "../presentation/costLine";
import { presentContextMeta } from "../presentation/contextMeta";
import { ALUMINIUM_RETURN_PROFILE_RESOURCE_ID } from "../reference/lettersProduct";
import { clientHref, jobHref, quoteHref, requestHref } from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import { QuoteLines, QuoteRelations, QuoteSummary, type QuoteLine, type QuoteRelation, type QuoteTotal } from "./quoteDetail";
import "../styles/surfaces/offers.css";

type QuoteSnapshotPageProps = {
  productCode: string;
  quoteSnapshotId: string;
};

/** Same total as the quote document: the frozen job total when the quote carries several lines. */
function presentFrozenTotal(snapshot: QuoteSnapshotTransport): QuoteTotal | null {
  const product = presentCustomerPrice(snapshot.commercial);
  if (!snapshot.jobCommercial) {
    return product;
  }
  const job = presentCustomerPrice(snapshot.jobCommercial);
  return job ? { ...job, vatPercent: job.vatPercent ?? product?.vatPercent ?? null } : null;
}

function inscriptionLabel(productCode: string): string {
  return productCode === "PRD-LOGO-FRONTLIT-PLEXI-AL06" ? "Denumire logo" : "Text";
}

function presentLines(snapshot: QuoteSnapshotTransport, total: QuoteTotal | null): QuoteLine[] {
  const inscription = snapshot.inscription
    ? `${inscriptionLabel(snapshot.productCode)}: ${snapshot.inscription}`
    : null;
  if (snapshot.offerLines.length === 0) {
    return [
      {
        key: "product",
        title: snapshot.productLabel,
        detail: inscription,
        netPrice: total?.netPrice ?? null,
        vatPercent: total?.vatPercent ?? null,
        vatAmount: total?.vatAmount ?? null,
        grossPrice: total?.grossPrice ?? null,
        currency: total?.currency ?? snapshot.currency ?? "EUR",
      },
    ];
  }
  return snapshot.offerLines.map((line) => ({
    key: `${line.kind}-${line.label}`,
    title: line.kind === "PRODUCT" ? snapshot.productLabel : line.label,
    detail: line.kind === "PRODUCT" ? inscription : null,
    netPrice: line.netPrice,
    vatPercent: null,
    vatAmount: null,
    grossPrice: null,
    currency: line.currency ?? "EUR",
  }));
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
  const [documentState, setDocumentState] = useState<"idle" | "pending" | "error">("idle");
  const [documentError, setDocumentError] = useState<string | null>(null);

  async function accept(): Promise<void> {
    setActionState("pending");
    setActionError(null);
    try {
      await postQuoteAcceptance(productCode, quoteSnapshotId);
      invalidateAfterAcceptQuote(quoteSnapshotId);
      setActionState("idle");
    } catch (error) {
      setActionState("error");
      setActionError(
        error instanceof TransportError
          ? "Oferta nu poate fi acceptată încă."
          : "Acceptarea a eșuat.",
      );
    }
  }

  async function createOrder(): Promise<void> {
    setActionState("pending");
    setActionError(null);
    try {
      const created = presentOrderSnapshotId(
        await postQuoteOrder(productCode, quoteSnapshotId),
      );
      invalidateAfterCreateOrder(quoteSnapshotId);
      const orderSnapshotId = created ?? envelope.data?.orderSnapshotId;
      if (!orderSnapshotId) {
        setActionState("error");
        setActionError("Comanda nu a putut fi prezentată.");
        return;
      }
      setActionState("idle");
      navigate(jobHref(orderSnapshotId));
    } catch (error) {
      setActionState("error");
      setActionError(
        error instanceof TransportError
          ? "Comanda poate fi creată doar dintr-o ofertă acceptată."
          : "Crearea comenzii a eșuat.",
      );
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
  const orderSnapshotId = presentedEnvelope?.orderSnapshotId ?? null;
  const total = presentedSnapshot ? presentFrozenTotal(presentedSnapshot) : null;

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
            Oferta nu este disponibilă.
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
                    pending={actionState === "pending"}
                    onAccept={() => void accept()}
                    onCreateOrder={() => void createOrder()}
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
              lines={presentLines(presentedSnapshot, total)}
              total={presentedSnapshot.offerLines.length > 0 ? total : null}
              lineTax={presentedSnapshot.offerLines.length === 0}
            />
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

function QuoteEnvelopeAction({
  envelope,
  pending,
  onAccept,
  onCreateOrder,
}: {
  envelope: QuoteListItemTransport | null;
  pending: boolean;
  onAccept: () => void;
  onCreateOrder: () => void;
}): ReactNode {
  if (!envelope) {
    return null;
  }
  switch (envelope.nextAction) {
    case "ACCEPT_QUOTE":
      return (
        <Button disabled={pending} onClick={onAccept}>
          {envelope.nextActionLabel || "Marchează acceptată"}
        </Button>
      );
    case "CREATE_ORDER":
      return (
        <Button disabled={pending} onClick={onCreateOrder}>
          {envelope.nextActionLabel || "Creează comanda"}
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
