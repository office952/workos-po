import {
  CATALOG_PROCESS_GRAPH_SCHEMA_VERSION,
  OPERATIONAL_PROCESS_GRAPH_WRITE_STATE,
  catalogProcessGraphScenarios,
  getProductTemplate,
  presentedTemplate,
  projectCatalogProcessGraph,
  type CatalogProcessGraph,
  type CatalogProcessGraphNode,
  type CostEvidence,
  type DisplayLabelCatalog,
  type ProcessCompositionOptions,
} from "@workos-final/domain";

export type CatalogProcessGraphHttpResult =
  | { ok: true; body: CatalogProcessGraphResponse }
  | { ok: false; status: 400 | 404; error: "unknown_product" | "unknown_scenario" | "product_required" };

export type CatalogProcessGraphResponse = {
  schemaVersion: typeof CATALOG_PROCESS_GRAPH_SCHEMA_VERSION;
  readOnly: true;
  mutatesConfiguration: false;
  writeState: typeof OPERATIONAL_PROCESS_GRAPH_WRITE_STATE;
  status: "READY" | "NO_REFERENCE_SCENARIO";
  productCode: string;
  productLabel: string;
  templateVersion: string;
  canViewFinancialAmounts: boolean;
  scenario: {
    id: string;
    label: string;
    summary: string;
    illustrative: true;
    note: string;
  } | null;
  scenarios: readonly { id: string; label: string; summary: string }[];
  graph: RedactedProcessGraph | null;
};

type RedactedProcessGraph = Omit<CatalogProcessGraph, "nodes"> & {
  nodes: readonly RedactedProcessGraphNode[];
};

type RedactedProcessGraphNode = Omit<CatalogProcessGraphNode, "recipe"> & {
  recipe: RedactedRecipe | null;
};

type RedactedRecipe = Omit<
  NonNullable<CatalogProcessGraphNode["recipe"]>,
  "rate" | "currency"
> & {
  rate?: number | null;
  currency?: "EUR" | null;
};

export function projectCatalogProcessGraphHttp(input: {
  productCode: string;
  scenarioId: string | null;
  evidenceRows: readonly CostEvidence[];
  labels: DisplayLabelCatalog;
  canViewFinancialAmounts: boolean;
  composition?: ProcessCompositionOptions;
}): CatalogProcessGraphHttpResult {
  const productCode = input.productCode.trim();
  if (!productCode) {
    return { ok: false, status: 400, error: "product_required" };
  }
  const template = getProductTemplate(productCode);
  const presented = presentedTemplate(productCode, input.labels);
  if (!template || !presented) {
    return { ok: false, status: 404, error: "unknown_product" };
  }
  const scenarios = catalogProcessGraphScenarios(template, {
    costEvidenceRows: input.evidenceRows,
    ...input.composition,
  });
  const requested = input.scenarioId?.trim() || null;
  if (requested && !scenarios.some((item) => item.id === requested)) {
    return { ok: false, status: 400, error: "unknown_scenario" };
  }
  const base = {
    schemaVersion: CATALOG_PROCESS_GRAPH_SCHEMA_VERSION,
    readOnly: true as const,
    mutatesConfiguration: false as const,
    writeState: OPERATIONAL_PROCESS_GRAPH_WRITE_STATE,
    productCode: template.code,
    productLabel: presented.label,
    templateVersion: template.version,
    canViewFinancialAmounts: input.canViewFinancialAmounts,
    scenarios: scenarios.map((item) => ({
      id: item.id,
      label: item.label,
      summary: item.summary,
    })),
  };
  if (scenarios.length === 0) {
    return {
      ok: true,
      body: {
        ...base,
        status: "NO_REFERENCE_SCENARIO",
        scenario: null,
        graph: null,
      },
    };
  }
  const scenario = scenarios.find((item) => item.id === requested) ?? scenarios[0]!;
  const graph = projectCatalogProcessGraph(scenario.composition, input.evidenceRows);
  return {
    ok: true,
    body: {
      ...base,
      status: "READY",
      scenario: {
        id: scenario.id,
        label: scenario.label,
        summary: scenario.summary,
        illustrative: true,
        note: scenario.note,
      },
      graph: {
        ...graph,
        nodes: graph.nodes.map((node) => redactNode(node, input.canViewFinancialAmounts)),
      },
    },
  };
}

function redactNode(
  node: CatalogProcessGraphNode,
  canViewFinancialAmounts: boolean,
): RedactedProcessGraphNode {
  if (!node.recipe || canViewFinancialAmounts) {
    return node;
  }
  const { rate: _rate, currency: _currency, ...recipe } = node.recipe;
  return { ...node, recipe };
}
