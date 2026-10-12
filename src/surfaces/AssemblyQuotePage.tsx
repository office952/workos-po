import type { AssemblyQuoteCostTransport } from "../api/types";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { resourceKeys } from "../data/resourceKeys";
import { loadAssemblyQuote } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { presentContextMeta } from "../presentation/contextMeta";
import { formatMoney } from "../presentation/format";
import { statusTone } from "../presentation/statusTone";
import { assemblyHref, assemblyQuoteHref, jobHref, requestHref } from "../routing/appRoute";
import "../styles/surfaces/commercial.css";

type AssemblyQuotePageProps = {
  quoteSnapshotId: string;
};

/** Read-only view of one frozen assembly quote; acceptance stays on the assembly page. */
export function AssemblyQuotePage({ quoteSnapshotId }: AssemblyQuotePageProps) {
  const loaded = useResource(resourceKeys.assemblyQuote(quoteSnapshotId), () =>
    loadAssemblyQuote(quoteSnapshotId),
  );
  const quote = loaded.data ?? null;
  const item = quote?.item ?? null;

  return (
    <SlicePage
      contextLabel="Ofertă"
      currentHref={assemblyQuoteHref(quoteSnapshotId)}
      workspace="stack"
      surface="quote-detail"
      headerVariant="pilot"
      eyebrow="Ofertă ansamblu"
      title={item?.reference ?? "Ofertă de ansamblu"}
      lead="Înregistrare comercială înghețată. Secțiunile rămân trasabile separat."
      meta={presentContextMeta([item?.customerDisplayName, item?.requestReference, quote?.label])}
    >
      <div className="commercial-toolbar">
        <div className="commercial-toolbar__context">
          <a className="text-link" href="/oferte">← Toate ofertele</a>
          {item ? <StatusBadge label={item.kindLabel} tone={statusTone("workflow")} /> : null}
          {item ? <StatusBadge label={item.stageLabel} tone={statusTone("workflow")} /> : null}
        </div>
      </div>
      <div className="commercial-object">
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
        <SurfacePanel title="Secțiuni ofertă" label="Secțiuni ofertă" busy={!quote && loaded.status !== "error"}>
          {quote ? (
            <>
              {quote.sections.map((section) => (
                <dl className="fact-grid" key={section.memberId} aria-label={section.roleLabel}>
                  <InfoRow
                    label={section.roleLabel}
                    value={[section.productLabel, section.inscription].filter(Boolean).join(" · ")}
                  />
                  <InfoRow label="Net" value={formatMoney(section.netPrice, section.currency)} />
                  <InfoRow
                    label={`TVA ${section.vatPercent}%`}
                    value={formatMoney(section.vatAmount, section.currency)}
                  />
                  <InfoRow label="Total secțiune" value={formatMoney(section.grossPrice, section.currency)} />
                </dl>
              ))}
              {quote.serviceSection ? (
                <dl className="fact-grid" aria-label={quote.serviceSection.label}>
                  <InfoRow label={quote.serviceSection.label} value="Serviciu" />
                  <InfoRow
                    label="Total serviciu"
                    value={formatMoney(quote.serviceSection.grossPrice, quote.serviceSection.currency)}
                  />
                </dl>
              ) : null}
            </>
          ) : loaded.status !== "error" ? (
            <LoadingFloor variant="facts" label="Se citește oferta de ansamblu" />
          ) : null}
        </SurfacePanel>
        {quote ? (
          <SurfacePanel title="Total ofertă" label="Total ofertă">
            <dl className="fact-grid">
              <InfoRow label="Total net" value={formatMoney(quote.totals.netPrice, quote.totals.currency)} />
              <InfoRow label="TVA" value={formatMoney(quote.totals.vatAmount, quote.totals.currency)} />
              <InfoRow
                label="Total comercial"
                value={formatMoney(quote.totals.grossPrice, quote.totals.currency)}
              />
              <InfoRow label="Comandă" value={quote.orderSnapshotId ? "Acceptată — comandă creată" : "Neacceptată"} />
            </dl>
          </SurfacePanel>
        ) : null}
        {quote?.internalCost ? <InternalCostPanel cost={quote.internalCost} /> : null}
        {quote?.internalCost === null ? (
          <p className="ui-note">Costul intern nu poate fi urmărit pentru această ofertă.</p>
        ) : null}
        {quote ? (
          <SurfacePanel variant="quiet" title="Legături">
            <p className="ui-note">
              Oferta este înghețată. Acceptarea și modificările se fac din ansamblu, nu din registru.
            </p>
            {quote.requestId ? (
              <p>
                <a className="text-link" href={requestHref(quote.requestId)}>Deschide cererea</a>
              </p>
            ) : null}
            <p>
              <a className="text-link" href={assemblyHref(quote.assemblyId)}>Deschide ansamblul</a>
            </p>
            {quote.orderSnapshotId ? (
              <p>
                <a className="text-link" href={jobHref(quote.orderSnapshotId)}>Deschide comanda</a>
              </p>
            ) : null}
          </SurfacePanel>
        ) : null}
      </div>
    </SlicePage>
  );
}

function InternalCostPanel({ cost }: { cost: AssemblyQuoteCostTransport }) {
  return (
    <details className="quote-analysis">
      <summary>Cost intern · evidență ({cost.sourceLabel})</summary>
      <p className="ui-note">Costul intern nu este preț de vânzare.</p>
      <dl className="fact-grid">
        {cost.sections.map((section) => (
          <InfoRow
            key={section.memberId}
            label={section.roleLabel}
            value={`${formatMoney(section.total, section.currency)} · ${section.completenessLabel}`}
          />
        ))}
      </dl>
      {cost.production ? (
        <>
          <dl className="fact-grid">
            <InfoRow
              label="Cost intern de producție"
              value={`${formatMoney(cost.production.total, cost.production.currency)} · ${cost.production.completenessLabel}`}
            />
          </dl>
          {cost.production.unpricedOperations.length > 0 ? (
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
        </>
      ) : null}
      {cost.productionPending ? (
        <p className="ui-note">
          Costul intern de producție se stabilește la eliberarea în producție. Costurile pe secțiuni nu
          se adună înainte, pentru că ansamblarea înlocuiește o parte din lucrările fiecărui produs.
        </p>
      ) : null}
    </details>
  );
}
