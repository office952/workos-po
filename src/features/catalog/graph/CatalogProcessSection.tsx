import { useState } from "react";
import { presentCatalogProcessGraph, type ProcessGraphView } from "../../../adapters/catalogProcessGraphAdapter";
import { fetchCatalogProcessGraph } from "../../../api/catalogProcessGraph";
import { TransportError } from "../../../api/http";
import { Button } from "../../../components/Button";
import { InlineAlert } from "../../../components/InlineAlert";
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
        <h2 id="process-graph-heading">Traseu tehnologic</h2>
        <p>Consultare. Traseul nu se salvează și nu pornește o lucrare.</p>
      </header>
      {graph.status === "error" ? (
        <InlineAlert tone="error" title={errorTitle(graph.error)}>
          {errorDetail(graph.error)}
          <Button variant="secondary" onClick={() => invalidateResources(resourceKeys.catalogProcessGraph(productCode, activeScenario))}>
            Reîncearcă traseul
          </Button>
        </InlineAlert>
      ) : null}
      {!view && graph.status !== "error" ? <p>Se citește traseul.</p> : null}
      {view?.status === "NO_REFERENCE_SCENARIO" ? (
        <p>Nu există un scenariu de referință pentru acest produs. Nu se afișează un traseu inventat.</p>
      ) : null}
      {view?.status === "READY" && view.scenario ? (
        <>
          <label className="process-graph__scenario">
            Scenariu ilustrativ
            <select
              value={knownScenario ?? view.scenario.id}
              onChange={(event) => setScenarioId(event.target.value)}
            >
              {view.scenarios.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <p>{view.scenario.summary}</p>
          <p className="ui-note">{view.scenario.note}</p>
          <p>
            Proces tehnologic: {view.technologicalProcessCompletenessLabel}. Execuție: {view.executionReadinessLabel}. Dovezi de cost: {view.costCompletenessLabel}. Iluminare: {view.lightingCalculationReadinessLabel}.
          </p>
          {view.completenessReasons.map((reason) => <p key={reason} className="ui-note">{reason}</p>)}
          {view.nodes.length === 0 ? <p>Traseul nu conține operații.</p> : <ProductProcessGraph key={view.scenario.id} view={view} />}
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
