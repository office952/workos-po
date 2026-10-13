import { useState } from "react";
import { readTransportReasons } from "../api/http";
import { fetchAssemblyQuoteDocument } from "../api/quote";
import type { AssemblyQuoteCostTransport, AssemblyQuoteTransport } from "../api/types";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { resourceKeys } from "../data/resourceKeys";
import { loadAssemblyQuote } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { presentContextMeta } from "../presentation/contextMeta";
import { triggerBrowserDownload } from "../presentation/download";
import { formatMoney } from "../presentation/format";
import { assemblyHref, assemblyQuoteHref, jobHref, requestHref } from "../routing/appRoute";
import { QuoteLines, QuoteRelations, QuoteSummary, type QuoteLine, type QuoteRelation, type QuoteTotal } from "./quoteDetail";
import "../styles/surfaces/offers.css";

type AssemblyQuotePageProps = {
  quoteSnapshotId: string;
};

function sharedVatPercent(quote: AssemblyQuoteTransport): number | null {
  const rates = new Set(quote.sections.map((section) => section.vatPercent));
  return rates.size === 1 ? [...rates][0] ?? null : null;
}

function presentTotal(quote: AssemblyQuoteTransport): QuoteTotal {
  return { ...quote.totals, vatPercent: sharedVatPercent(quote) };
}

function presentLines(quote: AssemblyQuoteTransport): QuoteLine[] {
  const sections: QuoteLine[] = quote.sections.map((section) => ({
    key: section.memberId,
    title: section.roleLabel,
    detail: [section.productLabel === section.roleLabel ? null : section.productLabel, section.inscription]
      .filter(Boolean)
      .join(" · ") || null,
    netPrice: section.netPrice,
    vatPercent: section.vatPercent,
    vatAmount: section.vatAmount,
    grossPrice: section.grossPrice,
    currency: section.currency,
  }));
  const service = quote.serviceSection;
  return service
    ? [
        ...sections,
        {
          key: "service",
          title: service.label,
          detail: "Serviciu",
          netPrice: service.netPrice,
          vatPercent: null,
          vatAmount: service.vatAmount,
          grossPrice: service.grossPrice,
          currency: service.currency,
        },
      ]
    : sections;
}

function presentRelations(quote: AssemblyQuoteTransport): QuoteRelation[] {
  return [
    quote.requestId
      ? { key: "request", label: "Cerere", detail: quote.item.requestReference, href: requestHref(quote.requestId), action: "Deschide cererea" }
      : null,
    { key: "assembly", label: "Ansamblu", detail: quote.label, href: assemblyHref(quote.assemblyId), action: "Deschide ansamblul" },
    quote.orderSnapshotId
      ? { key: "order", label: "Comandă", detail: null, href: jobHref(quote.orderSnapshotId), action: "Deschide comanda" }
      : null,
  ].filter((relation): relation is QuoteRelation => relation !== null);
}

/** Read-only view of one frozen assembly quote; acceptance stays on the assembly page. */
export function AssemblyQuotePage({ quoteSnapshotId }: AssemblyQuotePageProps) {
  const loaded = useResource(resourceKeys.assemblyQuote(quoteSnapshotId), () =>
    loadAssemblyQuote(quoteSnapshotId),
  );
  const quote = loaded.data ?? null;
  const item = quote?.item ?? null;
  const [documentPending, setDocumentPending] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);

  async function downloadDocument(): Promise<void> {
    setDocumentPending(true);
    setDocumentError(null);
    const result = await fetchAssemblyQuoteDocument(quoteSnapshotId);
    setDocumentPending(false);
    if (!result.ok) {
      setDocumentError(readTransportReasons(result.body)[0] ?? "Documentul ofertei nu este disponibil.");
      return;
    }
    triggerBrowserDownload(result.blob, result.filename ?? "oferta.pdf");
  }

  return (
    <SlicePage
      contextLabel="Ofertă"
      currentHref={assemblyQuoteHref(quoteSnapshotId)}
      workspace="stack"
      surface="quote-detail"
      headerVariant="pilot-compact"
      eyebrow="Ofertă · Ansamblu"
      title={item?.reference ?? "Ofertă de ansamblu"}
      meta={presentContextMeta([item?.customerDisplayName, item?.requestReference, quote?.label])}
    >
      <div className="offers-detail">
        <a className="offers-detail__back text-link" href="/oferte">← Toate ofertele</a>
        {loaded.status === "error" && !quote ? (
          <InlineAlert tone="error" title="Oferta nu a putut fi citită">
            Oferta de ansamblu nu este disponibilă.
          </InlineAlert>
        ) : null}
        {quote?.superseded ? (
          <InlineAlert tone="pending" title="Versiune înlocuită">
            Ansamblul are o ofertă mai nouă. Această versiune rămâne înghețată pentru istoric.
          </InlineAlert>
        ) : null}
        {quote && item ? (
          <>
            <QuoteSummary
              total={presentTotal(quote)}
              unavailableNote="Totalul ofertei nu este disponibil."
              facts={[
                { label: "Stare", value: item.stageLabel },
                { label: "Tip", value: `${item.kindLabel} · ${item.sectionCount} secțiuni` },
                { label: "Comandă", value: quote.orderSnapshotId ? "Acceptată — comandă creată" : "Neacceptată" },
              ]}
              actions={
                <>
                  <a
                    className="offers-next"
                    href={quote.orderSnapshotId ? jobHref(quote.orderSnapshotId) : assemblyHref(quote.assemblyId)}
                  >
                    <span>{quote.orderSnapshotId ? "Deschide comanda" : "Deschide ansamblul"}</span>
                    <span aria-hidden="true">→</span>
                  </a>
                  <Button variant="secondary" disabled={documentPending} onClick={() => void downloadDocument()}>
                    Descarcă oferta PDF
                  </Button>
                </>
              }
              note="Oferta este înghețată. Acceptarea și modificările se fac din ansamblu."
            >
              {documentError ? (
                <InlineAlert tone="error" title="Documentul nu poate fi descărcat">
                  {documentError}
                </InlineAlert>
              ) : null}
            </QuoteSummary>
            <QuoteLines caption="Secțiuni ofertă" lines={presentLines(quote)} total={presentTotal(quote)} lineTax />
            {quote.internalCost ? <InternalCostPanel cost={quote.internalCost} /> : null}
            {quote.internalCost === null ? (
              <p className="ui-note">Costul intern nu poate fi urmărit pentru această ofertă.</p>
            ) : null}
            <QuoteRelations
              relations={presentRelations(quote)}
              note="Fiecare legătură deschide înregistrarea ei. Oferta rămâne neschimbată."
            />
          </>
        ) : loaded.status !== "error" ? (
          <LoadingFloor variant="facts" label="Se citește oferta de ansamblu" />
        ) : null}
      </div>
    </SlicePage>
  );
}

function InternalCostPanel({ cost }: { cost: AssemblyQuoteCostTransport }) {
  return (
    <section className="offers-cost" aria-label="Cost intern">
      <details className="quote-analysis">
        <summary>Cost intern · evidență ({cost.sourceLabel})</summary>
        <p className="ui-note">Costul intern nu este preț de vânzare.</p>
        <dl className="offers-cost__rows">
          {cost.sections.map((section) => (
            <div key={section.memberId}>
              <dt>{section.roleLabel}</dt>
              <dd>{formatMoney(section.total, section.currency)}</dd>
              <dd>{section.completenessLabel}</dd>
            </div>
          ))}
          {cost.production ? (
            <div>
              <dt>Cost intern de producție</dt>
              <dd>{formatMoney(cost.production.total, cost.production.currency)}</dd>
              <dd data-completeness={cost.production.completeness}>{cost.production.completenessLabel}</dd>
            </div>
          ) : null}
        </dl>
        {cost.production && cost.production.unpricedOperations.length > 0 ? (
          <InlineAlert tone="pending" title="Cost parțial">
            Lucrările de ansamblu de mai jos nu au cost înregistrat și nu sunt tratate ca zero.
            <ul>
              {cost.production.unpricedOperations.map((operation) => (
                <li key={operation.processLabel}>
                  {operation.processLabel}: lipsește {operation.missingInputs.join(", ").toLocaleLowerCase("ro")}
                </li>
              ))}
            </ul>
          </InlineAlert>
        ) : null}
        {cost.productionPending ? (
          <p className="ui-note">
            Costul intern de producție se stabilește la eliberarea în producție. Costurile pe secțiuni nu
            se adună înainte, pentru că ansamblarea înlocuiește o parte din lucrările fiecărui produs.
          </p>
        ) : null}
      </details>
    </section>
  );
}
