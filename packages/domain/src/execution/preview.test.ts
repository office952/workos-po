import { describe, expect, it } from "vitest";
import {
  APPLY_SURFACE_FINISH_ID,
  BOND_LETTER_BODY_ID,
  CLOSE_LETTER_BODY_ID,
  CUT_SHEET_CNC_ID,
  FORM_ALUMINIUM_PROFILE_ID,
  INSPECT_FINISHED_LETTER_ID,
  INSTALL_OR_CONNECT_PSU_ID,
  PACK_PRODUCT_ID,
  PAINT_RAL_ID,
  PLACE_LED_MODULES_ID,
  TEST_LIGHTING_IGNITION_ID,
} from "../processes/catalog.js";
import { compositionNodeId } from "../processes/composition.js";
import {
  compileAggregate,
  compileDefinition,
  confirmReviewedDefinition,
} from "../product/compiler.js";
import { seededDisplayLabelCatalog } from "../product/displayMetadata.js";
import {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "../product/frontlitPlexiAl06.js";
import type { DraftValues } from "../product/types.js";
import { compileEic } from "../resources/eic.js";
import { compileExecutionPlanPreview } from "./preview.js";

const readyValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function confirmedSpine(values: DraftValues = readyValues) {
  const definition = compileDefinition(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    {
      templateCode: CANONICAL_PRODUCT_CODE,
      values,
    },
  );
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error("expected confirmed truth");
  }
  const aggregate = compileAggregate(
    truth,
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    seededDisplayLabelCatalog(),
  );
  return { definition, truth, aggregate };
}

function previewFor(values: DraftValues = readyValues) {
  const { truth, aggregate } = confirmedSpine(values);
  return compileExecutionPlanPreview(truth, aggregate, frontlitPlexiAl06Template);
}

describe("execution plan preview", () => {
  it("produces a deterministic preview from confirmed LETTERS truth", () => {
    const first = previewFor();
    const second = previewFor();
    expect(first.previewId).toBe(second.previewId);
    expect(first.previewId).toMatch(/^preview:PRD-LETTERS-FRONTLIT-PLEXI-AL06:/);
    expect(first.status).toBe("PREVIEW");
    expect(first.operations.map((item) => item.id)).toEqual(
      second.operations.map((item) => item.id),
    );
    expect(first.operations.map((item) => item.seq)).toEqual(
      second.operations.map((item) => item.seq),
    );
    expect(new Set(first.operations.map((item) => item.id)).size).toBe(
      first.operations.length,
    );
  });

  it("keeps operations and dependencies on the canonical composition DAG", () => {
    const preview = previewFor();
    const byId = new Map(preview.operations.map((item) => [item.id, item]));
    const faceCut = compositionNodeId("FACE", CUT_SHEET_CNC_ID);
    const bond = compositionNodeId("BODY", BOND_LETTER_BODY_ID);
    const close = compositionNodeId("BODY", CLOSE_LETTER_BODY_ID);
    const placeLed = compositionNodeId("LIGHTING", PLACE_LED_MODULES_ID);
    expect(preview.operations.map((item) => item.processId)).toContain(CUT_SHEET_CNC_ID);
    expect(byId.get(bond)?.dependsOn).toEqual(
      expect.arrayContaining([faceCut, compositionNodeId("VOLUME", FORM_ALUMINIUM_PROFILE_ID)]),
    );
    expect(byId.get(placeLed)?.dependsOn).toEqual([
      compositionNodeId("BACK", CUT_SHEET_CNC_ID),
    ]);
    expect(byId.get(close)?.dependsOn).toContain(
      compositionNodeId("LIGHTING", TEST_LIGHTING_IGNITION_ID),
    );
    for (const operation of preview.operations) {
      for (const dep of operation.dependsOn) {
        expect(byId.has(dep)).toBe(true);
      }
    }
    const ids = preview.operations.map((item) => item.id);
    const incoming = new Map(ids.map((id) => [id, 0]));
    const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
    for (const operation of preview.operations) {
      for (const dep of operation.dependsOn) {
        incoming.set(operation.id, (incoming.get(operation.id) ?? 0) + 1);
        outgoing.get(dep)?.push(operation.id);
      }
    }
    const queue = ids.filter((id) => incoming.get(id) === 0);
    const visited: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) {
        break;
      }
      visited.push(id);
      for (const next of outgoing.get(id) ?? []) {
        const remaining = (incoming.get(next) ?? 0) - 1;
        incoming.set(next, remaining);
        if (remaining === 0) {
          queue.push(next);
        }
      }
    }
    expect(visited).toHaveLength(ids.length);
    expect(preview.operations.some((item) => item.canStart)).toBe(true);
    expect(JSON.stringify(preview)).not.toMatch(/ExecutionTask|MachineRun|schedule|hourlyRate/);
  });

  it("assigns a deterministic topological display sequence without inventing extra order", () => {
    const preview = previewFor();
    expect(preview.operations.map((item) => item.seq)).toEqual(
      preview.operations.map((_, index) => index + 1),
    );
    const faceCut = preview.operations.find(
      (item) => item.id === compositionNodeId("FACE", CUT_SHEET_CNC_ID),
    );
    const bond = preview.operations.find(
      (item) => item.id === compositionNodeId("BODY", BOND_LETTER_BODY_ID),
    );
    expect(faceCut?.seq).toBeLessThan(bond?.seq ?? 0);
    for (const operation of preview.operations) {
      for (const dep of operation.dependsOn) {
        const predecessor = preview.operations.find((item) => item.id === dep);
        expect(predecessor?.seq).toBeLessThan(operation.seq);
      }
    }
  });

  it("keeps vinyl and RAL operations conditional", () => {
    const none = previewFor();
    expect(none.operations.some((item) => item.processId === APPLY_SURFACE_FINISH_ID)).toBe(
      false,
    );
    expect(none.operations.some((item) => item.processId === PAINT_RAL_ID)).toBe(false);

    const vinyl = previewFor({
      ...readyValues,
      "face.finish": "vinyl",
      "face.color": "alb",
    });
    expect(
      vinyl.operations.some(
        (item) =>
          item.processId === APPLY_SURFACE_FINISH_ID && item.scope === "FACE",
      ),
    ).toBe(true);
    expect(vinyl.operations.some((item) => item.processId === PAINT_RAL_ID)).toBe(false);
    expect(
      vinyl.operations.find(
        (item) =>
          item.processId === APPLY_SURFACE_FINISH_ID && item.scope === "FACE",
      )?.resources.some((item) => item.label === "Folie Oracal 651"),
    ).toBe(true);

    const painted = previewFor({
      ...readyValues,
      "volume.finish": "painted",
      "volume.color": "RAL 9010",
    });
    expect(painted.operations.some((item) => item.processId === PAINT_RAL_ID)).toBe(true);
    expect(painted.operations.some((item) => item.processId === APPLY_SURFACE_FINISH_ID)).toBe(
      false,
    );
    expect(
      painted.operations.find((item) => item.processId === PAINT_RAL_ID)?.readiness,
    ).toBe("NO_PROVIDER");
  });

  it("derives providers from capability coverage without assigning one", () => {
    const preview = previewFor();
    const cnc = preview.operations.find(
      (item) => item.id === compositionNodeId("FACE", CUT_SHEET_CNC_ID),
    );
    const bond = preview.operations.find((item) => item.processId === BOND_LETTER_BODY_ID);
    const inspect = preview.operations.find(
      (item) => item.processId === INSPECT_FINISHED_LETTER_ID,
    );
    const pack = preview.operations.find((item) => item.processId === PACK_PRODUCT_ID);
    expect(cnc?.eligibleProviders.map((item) => item.label)).toEqual(["CNC 4020"]);
    expect(cnc?.readiness).toBe("READY");
    expect(bond?.eligibleProviders.map((item) => item.label)).toEqual([
      "Masă asamblare 1",
      "Masă asamblare 2",
    ]);
    expect(bond?.providerRequirement).toBe("NOT_REQUIRED");
    expect(bond?.readiness).toBe("READY");
    expect(inspect?.providerRequirement).toBe("NOT_REQUIRED");
    expect(pack?.providerRequirement).toBe("NOT_REQUIRED");
    expect(inspect?.readiness).toBe("READY");
    expect(pack?.readiness).toBe("READY");
    expect(JSON.stringify(preview.operations)).not.toMatch(
      /MCH-CNC-4020|WC_ASSEMBLY_01|selectedProvider/,
    );
  });

  it("reuses Lighting quantities and keeps EIC 382.50 on the canonical fixture", () => {
    const { truth, aggregate } = confirmedSpine();
    const preview = compileExecutionPlanPreview(
      truth,
      aggregate,
      frontlitPlexiAl06Template,
    );
    const placeLed = preview.operations.find(
      (item) => item.processId === PLACE_LED_MODULES_ID,
    );
    const psu = preview.operations.find(
      (item) => item.processId === INSTALL_OR_CONNECT_PSU_ID,
    );
    expect(placeLed?.quantities[0]?.value).toBe(125);
    expect(placeLed?.resources.some((item) => item.label === "Modul LED 12V")).toBe(true);
    expect(psu?.resources.some((item) => item.label === "Sursă LED 12V 160W")).toBe(true);
    expect(preview.summary.internalCostTotal).toBe(382.5);
    expect(preview.summary.internalCostCompleteness).toBe("COMPLETE");
    expect(compileEic(aggregate).total).toBe(190.5);
    expect(JSON.stringify(preview)).not.toMatch(/ledPitchMm|0\.75|117\.1875/);
  });

  it("does not persist tasks or leak scheduling vocabulary", () => {
    const preview = previewFor();
    expect(preview.operations.some((item) => item.processId === CLOSE_LETTER_BODY_ID)).toBe(
      true,
    );
    expect(JSON.stringify(preview)).not.toMatch(
      /startTask|completeTask|assignedTo|capacity|pontaj|employeeId/,
    );
    expect(preview.summary.analyzerNote).toBe("");
    expect(preview.summary.analyzerNote).not.toMatch(/Analyzer/);
    expect(preview.summary.noProviderCount).toBe(0);
    expect(preview.readiness).toBe("READY");
  });
});
