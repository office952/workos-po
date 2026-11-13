import { useState } from "react";
import {
  PROCESS_GRAPH_WRITE_STATE_LABEL,
  presentCatalogProcessGraph,
  type ProcessGraphView,
} from "../../../adapters/catalogProcessGraphAdapter";
import { fetchCatalogProcessGraph } from "../../../api/catalogProcessGraph";
import { TransportError } from "../../../api/http";
import { invalidateResources } from "../../../data/resourceCache";
import { resourceKeys } from "../../../data/resourceKeys";
import { useResource } from "../../../data/useResource";
import "../../../styles/surfaces/catalog-process-graph.css";
import { ProductProcessGraph } from "./ProductProcessGraph";

type CatalogProcessSectionProps = {
  productCode: string | null;
};

export function CatalogProcessSection({ productCode }: CatalogProcessSectionProps) {
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const activeScenario = productCode ? scenarioId : null;
  const graph = useResource(
    productCode ? resourceKeys.catalogProcessGraph(productCode, activeScenario) : null,
    () => loadGraph(productCode ?? "", activeScenario),
  );

  if (!productCode) return null;
  const view = graph.data ?? null;
  const knownScenario = view?.scenarios.some((item) => item.id === scenarioId) ? scenarioId : null;

  return (
    <section className="process-graph" aria-labelledby="process-graph-heading">
      <header className="process-graph__header">
        <div className="catv2-section-head">
          <h2 id="process-graph-heading" className="catv2-h2">Proces tehnologic</h2>
          <p className="catv2-lead">
            Consultare. Traseul vine din definiția produsului și nu pornește o lucrare.{" "}
            <span className="catv2-tag catv2-tag--quiet">{view?.writeStateLabel ?? PROCESS_GRAPH_WRITE_STATE_LABEL}</span>
          </p>
        </div>
        {view?.status === "READY" && view.scenario ? (
          <label className="process-graph__scenario">
            <span>Scenariu ilustrativ</span>
            <select
              value={knownScenario ?? view.scenario.id}
              onChange={(event) => setScenarioId(event.target.value)}
            >
              {view.scenarios.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        ) : null}
      </header>
      {graph.status === "error" ? (
        <div className="catv2-failure" role="alert">
          <p><strong>{errorTitle(graph.error)}.</strong> {errorDetail(graph.error)}</p>
          <button type="button" className="catv2-button catv2-button--secondary" onClick={() => invalidateResources(resourceKeys.catalogProcessGraph(productCode, activeScenario))}>
            Reîncearcă traseul
          </button>
        </div>
      ) : null}
      {!view && graph.status !== "error" ? <p className="catv2-footnote" role="status">Se citește traseul.</p> : null}
      {view?.status === "NO_REFERENCE_SCENARIO" ? (
        <p className="catv2-empty">Nu există un scenariu de referință pentru acest produs. Nu se afișează un traseu inventat.</p>
      ) : null}
      {view?.status === "READY" && view.scenario ? (
        <>
          <p className="process-graph__scenario-note">{view.scenario.summary} <span>{view.scenario.note}</span></p>
          <dl className="process-graph__state">
            <div><dt>Proces tehnologic</dt><dd>{view.technologicalProcessCompletenessLabel}</dd></div>
            <div><dt>Execuție</dt><dd>{view.executionReadinessLabel}</dd></div>
            <div><dt>Cost intern</dt><dd>{view.costCompletenessLabel}</dd></div>
            <div><dt>Iluminare</dt><dd>{view.lightingCalculationReadinessLabel}</dd></div>
          </dl>
          {view.completenessReasons.length > 0 ? (
            <ul className="process-graph__reasons">
              {view.completenessReasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          ) : null}
          {view.nodes.length === 0 ? <p className="catv2-empty">Traseul nu conține operații.</p> : <ProductProcessGraph key={view.scenario.id} view={view} />}
        </>
      ) : null}
    </section>
  );
}

async function loadGraph(productCode: string, scenarioId: string | null): Promise<ProcessGraphView> {
  const model = presentCatalogProcessGraph(await fetchCatalogProcessGraph(productCode, scenarioId));
  if (!model) {
    throw new Error("unpresentable_catalog_process_graph");
  }
  return model;
}

function errorTitle(error: unknown): string {
  if (error instanceof TransportError) {
    switch (error.status) {
      case 401:
        return "Sesiunea a expirat";
      case 403:
        return "Acces refuzat";
      case 404:
        return "Produs necunoscut";
      case 400:
        return "Scenariu necunoscut";
      case 503:
        return "Traseul nu poate fi citit acum";
      default:
        return "Traseul nu a putut fi citit";
    }
  }
  return "Răspunsul traseului nu poate fi citit";
}

function errorDetail(error: unknown): string {
  if (error instanceof TransportError) {
    switch (error.status) {
      case 401:
        return "Intră din nou ca să continui.";
      case 403:
        return "Această sesiune nu poate consulta traseul.";
      case 404:
        return "Produsul nu face parte din bibliotecă.";
      case 400:
        return "Alege un scenariu din listă.";
      case 503:
        return "Reîncearcă după ce serviciul răspunde.";
      default:
        return "Reîncearcă citirea.";
    }
  }
  return "Datele primite nu respectă contractul de consultare.";
}
