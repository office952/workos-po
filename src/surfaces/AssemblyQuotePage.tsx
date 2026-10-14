import { useEffect, useId, useRef, useState } from "react";
import { acceptAssemblyQuote, type AssemblyQuoteAcceptanceResult } from "../api/assemblies";
import type { AssemblyQuoteCostTransport, AssemblyQuoteTransport } from "../api/types";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { invalidateAfterAcceptAssemblyQuote } from "../data/invalidation";
import { resourceKeys } from "../data/resourceKeys";
import { loadAssemblyQuote } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { presentContextMeta } from "../presentation/contextMeta";
import { formatMoney } from "../presentation/format";
import { assemblyHref, assemblyQuoteHref, jobHref, requestHref } from "../routing/appRoute";
import { QuoteLines, QuoteRelations, QuoteSummary, type QuoteLine, type QuoteRelation, type QuoteTotal } from "./quoteDetail";
import { useAssemblyQuoteDocument } from "./useAssemblyQuoteDocument";
import "../styles/surfaces/offers.css";

type AssemblyQuotePageProps = {
  quoteSnapshotId: string;
};

type AcceptanceRefusal = Exclude<AssemblyQuoteAcceptanceResult, { ok: true }>;

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

function presentRelations(quote: AssemblyQuoteTransport, orderSnapshotId: string | null): QuoteRelation[] {
  return [
    quote.requestId
      ? { key: "request", label: "Cerere", detail: quote.item.requestReference, href: requestHref(quote.requestId), action: "Deschide cererea" }
      : null,
    { key: "assembly", label: "Ansamblu", detail: quote.label, href: assemblyHref(quote.assemblyId), action: "Deschide ansamblul" },
    orderSnapshotId
      ? { key: "order", label: "Comandă", detail: null, href: jobHref(orderSnapshotId), action: "Deschide comanda" }
      : null,
  ].filter((relation): relation is QuoteRelation => relation !== null);
}

function refusalTitle(refusal: AcceptanceRefusal): string {
  switch (refusal.kind) {
    case "superseded":
      return "Oferta nu mai este curentă";
    case "already_accepted":
      return "Oferta este deja acceptată";
    case "refused":
      return "Oferta nu a fost acceptată";
    default: {
      const exhaustive: never = refusal;
      return exhaustive;
    }
  }
}

/** Commercial decision surface of one frozen assembly quote: totals, PDF, acceptance and the resulting order. */
export function AssemblyQuotePage({ quoteSnapshotId }: AssemblyQuotePageProps) {
  const loaded = useResource(resourceKeys.assemblyQuote(quoteSnapshotId), () =>
    loadAssemblyQuote(quoteSnapshotId),
  );
  const quote = loaded.data ?? null;
  const item = quote?.item ?? null;
  const quoteDocument = useAssemblyQuoteDocument(quoteSnapshotId);
  const [confirming, setConfirming] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptedOrderId, setAcceptedOrderId] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<AcceptanceRefusal | null>(null);
  const acceptingRef = useRef(false);
  const returnFocusRef = useRef(false);
  const confirmRef = useRef<HTMLElement>(null);
  const acceptButtonRef = useRef<HTMLButtonElement>(null);
  const confirmTitleId = useId();

  const orderSnapshotId = quote?.orderSnapshotId ?? acceptedOrderId;
  const canAccept = Boolean(quote?.acceptance.canAccept && !quote.superseded && !orderSnapshotId);

  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus();
    } else if (returnFocusRef.current) {
      returnFocusRef.current = false;
      acceptButtonRef.current?.focus();
    }
  }, [confirming]);

  function cancelConfirmation(): void {
    if (accepting) {
      return;
    }
    returnFocusRef.current = true;
    setConfirming(false);
  }

  async function accept(): Promise<void> {
    if (!quote || acceptingRef.current) {
      return;
    }
    acceptingRef.current = true;
    setAccepting(true);
    setRefusal(null);
    const result = await acceptAssemblyQuote(quote.assemblyId, quoteSnapshotId);
    acceptingRef.current = false;
    setAccepting(false);
    setConfirming(false);
    invalidateAfterAcceptAssemblyQuote({ assemblyId: quote.assemblyId, requestId: quote.requestId });
    if (result.ok) {
      setAcceptedOrderId(result.orderSnapshotId);
      return;
    }
    if (result.kind === "already_accepted" && result.orderSnapshotId) {
      setAcceptedOrderId(result.orderSnapshotId);
    }
    setRefusal(result);
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
            Oferta de ansamblu nu este disponibilă. Redeschide oferta din ansamblu sau din lista de oferte.
          </InlineAlert>
        ) : null}
        {quote?.superseded ? (
          <InlineAlert tone="pending" title="Versiune înlocuită">
            Ansamblul are o ofertă mai nouă. Această versiune rămâne înghețată pentru istoric și nu poate fi acceptată.
          </InlineAlert>
        ) : null}
        {acceptedOrderId && !refusal ? (
          <InlineAlert tone="success" title="Oferta a fost acceptată">
            Comanda a fost creată din această ofertă înghețată.
          </InlineAlert>
        ) : null}
        {refusal ? (
          <InlineAlert tone={refusal.kind === "already_accepted" ? "pending" : "error"} title={refusalTitle(refusal)}>
            {refusal.reason}
            {refusal.kind === "superseded" && refusal.currentQuoteSnapshotId ? (
              <>
                {" "}
                <a className="text-link" href={assemblyQuoteHref(refusal.currentQuoteSnapshotId)}>
                  Deschide oferta curentă
                </a>
              </>
            ) : null}
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
                { label: "Comandă", value: orderSnapshotId ? "Acceptată — comandă creată" : "Neacceptată" },
              ]}
              actions={
                <>
                  {orderSnapshotId ? (
                    <a className="offers-next" href={jobHref(orderSnapshotId)}>
                      <span>Deschide comanda</span>
                      <span aria-hidden="true">→</span>
                    </a>
                  ) : canAccept ? (
                    <Button
                      ref={acceptButtonRef}
                      disabled={accepting || confirming}
                      aria-expanded={confirming}
                      onClick={() => {
                        setRefusal(null);
                        setConfirming(true);
                      }}
                    >
                      Acceptă oferta și creează comanda
                    </Button>
                  ) : (
                    <a className="offers-next" href={assemblyHref(quote.assemblyId)}>
                      <span>Deschide ansamblul</span>
                      <span aria-hidden="true">→</span>
                    </a>
                  )}
                  <Button variant="secondary" disabled={quoteDocument.pending} onClick={() => void quoteDocument.download()}>
                    Descarcă oferta PDF
                  </Button>
                </>
              }
              note={
                orderSnapshotId
                  ? "Oferta este acceptată. Comanda păstrează sumele acestei versiuni."
                  : canAccept
                    ? "Oferta este înghețată. Acceptarea creează comanda din această versiune."
                    : quote.acceptance.reason ?? "Oferta este înghețată."
              }
            >
              {confirming && canAccept ? (
                <section
                  ref={confirmRef}
                  className="offers-confirm"
                  aria-labelledby={confirmTitleId}
                  tabIndex={-1}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      cancelConfirmation();
                    }
                  }}
                >
                  <p className="offers-confirm__title" id={confirmTitleId}>
                    Confirmi acceptarea ofertei {item.reference}?
                  </p>
                  <p className="offers-confirm__body">
                    Acceptarea creează comanda din această ofertă înghețată, la{" "}
                    {formatMoney(quote.totals.grossPrice, quote.totals.currency)} cu TVA. Oferta trece în
                    stadiul „Cu comandă” și nu mai poate fi acceptată din nou; o modificare ulterioară cere o
                    ofertă nouă.
                  </p>
                  <div className="offers-confirm__actions">
                    <Button disabled={accepting} onClick={() => void accept()}>
                      {accepting ? "Se creează comanda…" : "Confirmă acceptarea"}
                    </Button>
                    <Button variant="secondary" disabled={accepting} onClick={cancelConfirmation}>
                      Renunță
                    </Button>
                  </div>
                </section>
              ) : null}
              {quoteDocument.error ? (
                <InlineAlert tone="error" title="Documentul nu poate fi descărcat">
                  {quoteDocument.error}
                </InlineAlert>
              ) : null}
            </QuoteSummary>
            <QuoteLines caption="Secțiuni ofertă" lines={presentLines(quote)} total={presentTotal(quote)} lineTax />
            {quote.internalCost ? <InternalCostPanel cost={quote.internalCost} /> : null}
            {quote.internalCost === null ? (
              <p className="ui-note">Costul intern nu poate fi urmărit pentru această ofertă.</p>
            ) : null}
            <QuoteRelations
              relations={presentRelations(quote, orderSnapshotId)}
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
