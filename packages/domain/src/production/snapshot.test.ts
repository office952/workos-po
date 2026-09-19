import { describe, expect, it } from "vitest";
import {
  BOND_LETTER_BODY_ID,
  CUT_SHEET_CNC_ID,
  FORM_ALUMINIUM_PROFILE_ID,
  INSPECT_FINISHED_LETTER_ID,
  PLACE_LED_MODULES_ID,
} from "../processes/catalog.js";
import { composeProductProcessesFromTruth, compositionNodeId } from "../processes/composition.js";
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
import {
  LED_MODULE_POWER_SETTING_ID,
  LED_PITCH_SETTING_ID,
  PSU_RESERVE_SETTING_ID,
} from "../product/technicalSettings.js";
import type { DraftValues } from "../product/types.js";
import { compileEic } from "../resources/eic.js";
import { sha256Hex } from "./digest.js";
import {
  freezeAcceptedProductionSnapshot,
  productionWorkFromSnapshot,
} from "./snapshot.js";

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
  const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
  const eic = compileEic(aggregate, composition);
  return { definition, truth, aggregate, composition, eic };
}

function freeze(values: DraftValues = readyValues, createdAt = "2026-08-15T14:00:00.000Z") {
  const spine = confirmedSpine(values);
  return {
    ...spine,
    snapshot: freezeAcceptedProductionSnapshot(
      spine.truth,
      spine.aggregate,
      spine.composition,
      spine.eic,
      { createdAt },
    ),
  };
}

describe("accepted production snapshot", () => {
  it("freezes canonical LETTERS truth deterministically", () => {
    const first = freeze().snapshot;
    const second = freeze().snapshot;
    expect(first.snapshotId).toBe(second.snapshotId);
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.snapshotId).toMatch(
      /^aps:PRD-LETTERS-FRONTLIT-PLEXI-AL06:[0-9a-f]{64}$/,
    );
    expect(first.status).toBe("ACCEPTED");
    expect(first.schemaVersion).toBe(1);
    expect(first.sourceReviewId).toBe(second.sourceReviewId);
    expect(first.operations).toHaveLength(12);
    expect(first.eic.total).toBe(382.5);
    expect(first.eic.completeness).toBe("COMPLETE");
    expect(first.truth.measurements.every((item) => item.source === "OPERATOR_MANUAL")).toBe(
      true,
    );
    expect(JSON.stringify(first)).not.toMatch(/Geometrie din Analyzer/);
  });

  it("uses a standard SHA-256 digest", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("changes the SHA-256 digest when accepted content changes", () => {
    const none = freeze().snapshot;
    const vinyl = freeze({
      ...readyValues,
      "face.finish": "vinyl",
      "face.color": "alb",
    }).snapshot;
    expect(none.contentHash).toHaveLength(64);
    expect(vinyl.contentHash).not.toBe(none.contentHash);
  });

  it("keeps createdAt out of the content identity", () => {
    const morning = freeze(readyValues, "2026-08-15T08:00:00.000Z").snapshot;
    const evening = freeze(readyValues, "2026-08-15T20:00:00.000Z").snapshot;
    expect(morning.contentHash).toBe(evening.contentHash);
    expect(morning.snapshotId).toBe(evening.snapshotId);
    expect(morning.createdAt).toBe("2026-08-15T08:00:00.000Z");
    expect(evening.createdAt).toBe("2026-08-15T20:00:00.000Z");
  });

  it("freezes process dependencies and required capabilities without assigning providers", () => {
    const { snapshot } = freeze();
    const faceCut = snapshot.operations.find(
      (item) => item.id === compositionNodeId("FACE", CUT_SHEET_CNC_ID),
    );
    const bond = snapshot.operations.find((item) => item.processId === BOND_LETTER_BODY_ID);
    const inspect = snapshot.operations.find(
      (item) => item.processId === INSPECT_FINISHED_LETTER_ID,
    );
    expect(faceCut?.requiredCapabilityId).toBe("CNC_ROUTING");
    expect(bond?.dependsOn).toEqual(
      expect.arrayContaining([
        compositionNodeId("FACE", CUT_SHEET_CNC_ID),
        compositionNodeId("VOLUME", FORM_ALUMINIUM_PROFILE_ID),
      ]),
    );
    expect(inspect?.requiredCapabilityId).toBe("QUALITY_CONTROL");
    expect(JSON.stringify(snapshot)).not.toMatch(
      /eligibleProviders|assignedProvider|MCH-CNC-4020|WC_ASSEMBLY_01|selectedProvider/,
    );
    expect(JSON.stringify(snapshot)).not.toMatch(/ExecutionTask|startTask|assignedTo/);
  });

  it("freezes the technical settings actually used by the accepted product", () => {
    const { snapshot } = freeze();
    expect(snapshot.usedTechnicalSettings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: LED_PITCH_SETTING_ID, value: 100, unit: "mm" }),
        expect.objectContaining({
          id: LED_MODULE_POWER_SETTING_ID,
          value: 0.75,
          unit: "W",
        }),
        expect.objectContaining({ id: PSU_RESERVE_SETTING_ID, value: 25, unit: "percent" }),
      ]),
    );
  });

  it("does not change an existing snapshot when later settings or rates differ", () => {
    const { snapshot, truth, aggregate, composition, eic } = freeze();
    const mutatedSettings = snapshot.usedTechnicalSettings.map((item) =>
      item.id === LED_PITCH_SETTING_ID ? { ...item, value: 80 } : item,
    );
    const later = freezeAcceptedProductionSnapshot(truth, aggregate, composition, {
      ...eic,
      total: 999,
      lines: eic.lines.map((line) => ({ ...line, rate: 99, cost: 99 })),
    }, {
      createdAt: "2026-08-16T00:00:00.000Z",
      technicalSettings: mutatedSettings,
    });
    expect(snapshot.usedTechnicalSettings.find((item) => item.id === LED_PITCH_SETTING_ID)?.value).toBe(
      100,
    );
    expect(snapshot.eic.total).toBe(382.5);
    expect(later.usedTechnicalSettings.find((item) => item.id === LED_PITCH_SETTING_ID)?.value).toBe(
      80,
    );
    expect(later.eic.total).toBe(999);
    expect(later.contentHash).not.toBe(snapshot.contentHash);
    expect(() => {
      (snapshot as { eic: { total: number } }).eic.total = 1;
    }).toThrow();
  });

  it("exposes frozen production work for future Execution without live rereads", () => {
    const { snapshot } = freeze();
    const work = productionWorkFromSnapshot(snapshot);
    const placeLed = work.operations.find((item) => item.processId === PLACE_LED_MODULES_ID);
    expect(work.snapshotId).toBe(snapshot.snapshotId);
    expect(work.eic.total).toBe(382.5);
    expect(placeLed?.quantities[0]?.value).toBe(125);
    expect(work.usedRecipes.some((item) => item.rate > 0)).toBe(true);
    expect(work).not.toHaveProperty("template");
    expect(JSON.stringify(work)).not.toMatch(/hourlyRate|ExecutionTask|MachineRun/);
  });

  it("keeps vinyl and painted variants as distinct frozen identities", () => {
    const none = freeze().snapshot;
    const vinyl = freeze({
      ...readyValues,
      "face.finish": "vinyl",
      "face.color": "alb",
    }).snapshot;
    expect(vinyl.operations.some((item) => item.processLabel === "Aplicare folie")).toBe(true);
    expect(none.operations.some((item) => item.processLabel === "Aplicare folie")).toBe(false);
    expect(vinyl.snapshotId).not.toBe(none.snapshotId);
    expect(vinyl.eic.total).toBe(386);
  });

  it("does not rewrite a historically frozen 595 EIC from live catalog rates", () => {
    const live = freeze().snapshot;
    const historical = {
      ...live,
      eic: {
        ...live.eic,
        total: 595,
        completeness: "PARTIAL" as const,
      },
    };
    expect(live.eic.total).toBe(382.5);
    expect(live.eic.completeness).toBe("COMPLETE");
    expect(productionWorkFromSnapshot(historical).eic.total).toBe(595);
    expect(productionWorkFromSnapshot(historical).eic.completeness).toBe("PARTIAL");
    const { aggregate, composition } = confirmedSpine();
    expect(compileEic(aggregate, composition).total).toBe(382.5);
  });
});
