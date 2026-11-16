import { presentJobEconomics, type JobEconomicsModel } from "../../adapters/commercialFinancialAdapter";
import { fetchJobEconomics } from "../../api/commercialFinancial";
import { TransportError } from "../../api/http";
import { InlineAlert } from "../../components/InlineAlert";
import { LoadingFloor } from "../../components/LoadingFloor";
import { SurfacePanel } from "../../components/SurfacePanel";
import { resourceKeys } from "../../data/resourceKeys";
import { useResource } from "../../data/useResource";
import { formatMoney } from "../../presentation/format";
import "../../styles/surfaces/commercial-financial.css";

/**
 * Commercial & Financial V1 · planned vs operational result of a job, for the Owner only.
 * Every number is the server's; unknown values are shown as „Necunoscut”, never as zero.
 */
export function JobEconomicsPanel({ jobId }: { jobId: string }) {
  const economics = useResource(resourceKeys.jobEconomics(jobId), async () => presentJobEconomics(await fetchJobEconomics(jobId)));
  if (economics.error instanceof TransportError && economics.error.status === 403) {
    return null;
  }
  return (
    <SurfacePanel title="Planificat vs realizat" label="Rezultat operațional">
      {economics.status === "loading" && !economics.data ? <LoadingFloor variant="facts" label="Se calculează comparația" /> : null}
      {economics.status === "error" && !economics.data ? (
        <InlineAlert tone="error" title="Comparația nu este disponibilă">
          Reîncearcă deschiderea fișei.
        </InlineAlert>
      ) : null}
      {economics.data ? <EconomicsBody model={economics.data} /> : null}
    </SurfacePanel>
  );
}

function money(value: number | null, currency: string): string {
  return value === null ? "Necunoscut" : formatMoney(value, currency);
}

function quantity(value: number | null, unit: string): string {
  return value === null ? "—" : `${value.toLocaleString("ro-RO")} ${unit}`;
}

function EconomicsBody({ model }: { model: JobEconomicsModel }) {
  if (!model.available) {
    return <p className="adm-context__text">{model.reason}</p>;
  }
  const currency = model.currency;
  return (
    <div className="cfc-pva" data-testid="job-economics">
      <p className="adm-context__text">
        {model.scopeLabel} · {model.executionLabel}
        {model.excludedScopeLabel ? ` · ${model.excludedScopeLabel}` : ""}
      </p>
      {model.acceptedIncomplete ? (
        <InlineAlert tone="pending" title="Acceptată cu cost intern incomplet">
          Costul estimat nu este complet; marja estimată nu se calculează.
        </InlineAlert>
      ) : null}
      <dl className="cfc-pva__figures">
        <div className="cfc-pva__figure">
          <dt>{model.revenueLabel}</dt>
          <dd>{money(model.revenueNet, currency)}</dd>
        </div>
        <div className="cfc-pva__figure">
          <dt>Cost estimat la acceptare</dt>
          <dd>{money(model.estimatedTotal, currency)}</dd>
          <small>{model.estimatedCompletenessLabel}</small>
        </div>
        <div className="cfc-pva__figure">
          <dt>Cost operațional calculat din execuție</dt>
          <dd>{money(model.operationalTotal, currency)}</dd>
          <small>
            {model.operationalCompletenessLabel}
            {model.calculableCount + model.unavailableCount > 0
              ? ` · ${model.calculableCount} din ${model.calculableCount + model.unavailableCount} resurse cu consum`
              : ""}
          </small>
        </div>
        <div className="cfc-pva__figure">
          <dt>Diferență față de estimare (resurse comparabile)</dt>
          <dd>{money(model.differenceFromEstimate, currency)}</dd>
          <small>
            {model.plannedComparableTotal !== null ? `Estimat comparabil: ${formatMoney(model.plannedComparableTotal, currency)}` : "Fără resurse comparabile încă"}
          </small>
        </div>
        <div className="cfc-pva__figure">
          <dt>Marjă estimată</dt>
          <dd>{money(model.estimatedMargin, currency)}</dd>
          {model.estimatedMarginReason ? <small>{model.estimatedMarginReason}</small> : null}
        </div>
        <div className="cfc-pva__figure">
          <dt>Marjă operațională</dt>
          <dd>{money(model.operationalMargin, currency)}</dd>
          {model.operationalMarginReason ? <small>{model.operationalMarginReason}</small> : null}
        </div>
        <div className="cfc-pva__figure">
          <dt>Cost efectiv confirmat contabil</dt>
          <dd>Nu este înregistrat</dd>
          <small>{model.confirmedCostLabel}</small>
        </div>
      </dl>
      {model.lines.length > 0 ? (
        <div className="cfc-pva__table-wrap" role="region" aria-label="Resurse planificate și consumate" tabIndex={0}>
          <table className="cfc-pva__table">
            <thead>
              <tr>
                <th scope="col">Resursă</th>
                <th scope="col">Planificat</th>
                <th scope="col">Consumat</th>
                <th scope="col">Cost estimat</th>
                <th scope="col">Cost operațional</th>
                <th scope="col">Diferență</th>
              </tr>
            </thead>
            <tbody>
              {model.lines.map((line) => (
                <tr key={line.resourceId}>
                  <td>
                    {line.label}
                    {line.unknownReason ? <><br /><small>{line.unknownReason}</small></> : null}
                  </td>
                  <td>{quantity(line.plannedQuantity, line.unit)}</td>
                  <td>{quantity(line.actualQuantity, line.unit)}</td>
                  <td>{money(line.plannedCost, currency)}</td>
                  <td>{money(line.operationalCost, currency)}</td>
                  <td>{money(line.difference, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <ul className="cfc-pva__notes">
        {model.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}
