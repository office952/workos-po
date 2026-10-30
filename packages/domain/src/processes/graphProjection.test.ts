import { describe, expect, it } from "vitest";
import { ACM_CASSETTE_NONE_PRODUCT_CODE } from "../product/acmCassetteNone.js";
import { CANONICAL_PRODUCT_CODE } from "../product/frontlitPlexiAl06.js";
import { LOGO_PRODUCT_CODE } from "../product/logoFrontlitPlexiAl06.js";
import { getProductTemplate } from "../product/productRegistry.js";
import { costEvidence, SVC_CNC_BACK_ID, SVC_CNC_FACE_ID } from "../resources/catalog.js";
import {
  APPLY_SURFACE_FINISH_ID,
  CLOSE_LETTER_BODY_ID,
  CUT_SHEET_CNC_ID,
  INSPECT_FINISHED_LETTER_ID,
  INSTALL_OR_CONNECT_PSU_ID,
  PAINT_RAL_ID,
  PLACE_LED_MODULES_ID,
  TEST_LIGHTING_IGNITION_ID,
  WIRE_LIGHTING_ID,
} from "./catalog.js";
import { compositionNodeId, topologicalOrder } from "./composition.js";
import {
  catalogProcessGraphScenarios,
  directProcessGraphEdges,
  processGraphEdgeId,
  projectCatalogProcessGraph,
  simplifyProcessGraphEdges,
} from "./graphProjection.js";

function template(code: string) {
  const found = getProductTemplate(code);
  if (!found) {
    throw new Error(`missing_template:${code}`);
  }
  return found;
}

describe("catalog process graph projection", () => {
  it("keeps the letters reference as a direct graph with two visually redundant edges", () => {
    const scenario = catalogProcessGraphScenarios(template(CANONICAL_PRODUCT_CODE)).find(
      (item) => item.id === "letters-finish-none",
    );
    expect(scenario?.illustrative).toBe(true);
    const graph = projectCatalogProcessGraph(scenario!.composition);
    const wire = compositionNodeId("LIGHTING", WIRE_LIGHTING_ID);
    const ignition = compositionNodeId("LIGHTING", TEST_LIGHTING_IGNITION_ID);
    const close = compositionNodeId("BODY", CLOSE_LETTER_BODY_ID);
    const inspect = compositionNodeId("PRODUCT", INSPECT_FINISHED_LETTER_ID);
    const backCut = compositionNodeId("BACK", CUT_SHEET_CNC_ID);
    expect(graph.nodes).toHaveLength(12);
    expect(graph.directEdgeIds).toHaveLength(14);
    expect(graph.simplifiedEdgeIds).toHaveLength(11);
    expect(graph.hiddenEdgeIds).toEqual([
      processGraphEdgeId(backCut, close),
      processGraphEdgeId(wire, ignition),
      processGraphEdgeId(close, inspect),
    ]);
    expect(graph.hiddenEdgeCount).toBe(3);
    expect(graph.topologicalOrder).toEqual(scenario!.composition.derivedOrder);
    expect(graph.nodes.map((node) => node.id)).toEqual(
      scenario!.composition.nodes.map((node) => node.id),
    );
    const face = graph.nodes.find((node) => node.id === compositionNodeId("FACE", CUT_SHEET_CNC_ID));
    const back = graph.nodes.find((node) => node.id === compositionNodeId("BACK", CUT_SHEET_CNC_ID));
    expect(face?.recipe?.recipeId).toBe("RCP_CNC_FACE");
    expect(back?.recipe?.recipeId).toBe("RCP_CNC_BACK");
    expect(face?.recipe?.resourceId).toBe(SVC_CNC_FACE_ID);
    expect(back?.recipe?.resourceId).toBe(SVC_CNC_BACK_ID);
    expect(face?.recipe?.rate).not.toBe(back?.recipe?.rate);
    expect(face?.capabilityLabel).toBe("Debitare CNC");
    expect(JSON.stringify(graph)).not.toContain('"cost"');
  });

  it("includes vinyl and paint only on the scenarios that select them", () => {
    const scenarios = catalogProcessGraphScenarios(template(CANONICAL_PRODUCT_CODE));
    const vinyl = scenarios.find((item) => item.id === "letters-finish-vinyl")!;
    const painted = scenarios.find((item) => item.id === "letters-volume-painted")!;
    const vinylGraph = projectCatalogProcessGraph(vinyl.composition);
    expect(vinylGraph.nodes.some((node) => node.processId === APPLY_SURFACE_FINISH_ID && node.scope === "FACE")).toBe(true);
    expect(vinylGraph.nodes.some((node) => node.processId === APPLY_SURFACE_FINISH_ID && node.scope === "VOLUME")).toBe(true);
    expect(vinylGraph.nodes.find((node) => node.processId === APPLY_SURFACE_FINISH_ID)?.conditionLabel).toEqual(expect.any(String));
    expect(painted.composition.nodes.some((node) => node.processId === PAINT_RAL_ID)).toBe(true);
    expect(painted.composition.nodes.some((node) => node.processId === APPLY_SURFACE_FINISH_ID)).toBe(false);
  });

  it("does not invent lighting on the unlit ACM panel or an assembly recipe", () => {
    const scenarios = catalogProcessGraphScenarios(template(ACM_CASSETTE_NONE_PRODUCT_CODE));
    expect(scenarios.map((item) => item.id)).toEqual(["acm-cassette-proof"]);
    const graph = projectCatalogProcessGraph(scenarios[0]!.composition);
    const lighting = [
      PLACE_LED_MODULES_ID,
      WIRE_LIGHTING_ID,
      INSTALL_OR_CONNECT_PSU_ID,
      TEST_LIGHTING_IGNITION_ID,
    ];
    expect(graph.nodes.some((node) => lighting.includes(node.processId))).toBe(false);
    expect(graph.nodes.some((node) => node.processId.includes("MOUNT"))).toBe(false);
    const cut = graph.nodes.find((node) => node.processId === CUT_SHEET_CNC_ID);
    expect(cut?.recipe?.recipeId).toBe("RCP_CNC_SHEET_PANEL");
    expect(cut?.recipe?.recipeId).not.toBe("RCP_CNC_FACE");
  });

  it("keeps a logo scenario separate from the ACM panel", () => {
    const logo = catalogProcessGraphScenarios(template(LOGO_PRODUCT_CODE));
    const acm = catalogProcessGraphScenarios(template(ACM_CASSETTE_NONE_PRODUCT_CODE));
    expect(logo.map((item) => item.id)).toEqual(["logo-finish-none"]);
    expect(logo[0]?.composition.productCode).not.toBe(acm[0]?.composition.productCode);
  });

  it("treats a missing rate as absent and records a shared evidence row", () => {
    const scenario = catalogProcessGraphScenarios(template(CANONICAL_PRODUCT_CODE))[0]!;
    const withoutFace = projectCatalogProcessGraph(
      scenario.composition,
      costEvidence.filter((row) => row.resourceId !== SVC_CNC_FACE_ID),
    );
    const face = withoutFace.nodes.find(
      (node) => node.id === compositionNodeId("FACE", CUT_SHEET_CNC_ID),
    );
    expect(face?.recipe?.evidenceState).toBe("MISSING");
    expect(face?.recipe?.rate).toBeNull();
    expect(face?.recipe?.currency).toBeNull();
    expect(
      withoutFace.nodes
        .filter((node) => node.recipe?.evidenceState === "MISSING")
        .every((node) => node.recipe?.rate === null),
    ).toBe(true);

    const source = scenario.composition.nodes.find(
      (node) => node.id === compositionNodeId("FACE", CUT_SHEET_CNC_ID),
    )!;
    const twin = { ...source, id: "PRODUCT:shared-face-cut", dependsOn: [] as string[] };
    const nodes = [...scenario.composition.nodes, twin];
    const shared = projectCatalogProcessGraph({
      ...scenario.composition,
      nodes,
      derivedOrder: topologicalOrder(nodes),
    });
    expect(
      shared.nodes.find((node) => node.id === source.id)?.recipe?.sharedWithNodeIds,
    ).toEqual([twin.id]);
  });

  it("hides only an edge that already has another path", () => {
    const edges = directProcessGraphEdges([
      node("a"),
      node("b", ["a"]),
      node("c", ["b", "a"]),
    ]);
    const simplified = simplifyProcessGraphEdges(edges);
    expect(simplified.hidden.map((edge) => edge.id)).toEqual(["a>c"]);
    expect(simplified.simplified.map((edge) => edge.id)).toEqual(["a>b", "b>c"]);
  });
});

function node(id: string, dependsOn: string[] = []) {
  return {
    id,
    processId: id,
    processLabel: id,
    scope: "PRODUCT" as const,
    scopeLabel: "Produs",
    typeId: null,
    typeLabel: null,
    required: true as const,
    condition: { kind: "always" as const },
    conditionLabel: null,
    dependsOn,
    nodeReadiness: "REQUIRED" as const,
    nodeReadinessLabel: "Necesar",
    blockers: [],
    reason: id,
  };
}
