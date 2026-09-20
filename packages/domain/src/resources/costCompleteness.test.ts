import { describe, expect, it } from "vitest";
import { composeProductProcessesFromTruth } from "../processes/composition.js";
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
import {
  ALUMINIUM_RETURN_PROFILE_ID,
  FOREX_10MM_ID,
  PLEXIGLAS_3MM_OPAL_ID,
  costEvidence,
  getResource,
} from "./catalog.js";
import { compileEic, missingCostEvidenceReason } from "./eic.js";
import {
  PROVISIONAL_COST_EVIDENCE_REASON,
  projectCostCompletenessIssues,
} from "./costCompleteness.js";

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
  return { truth, aggregate, composition };
}

describe("cost completeness issues", () => {
  it("names the exact missing cost-evidence resource", () => {
    const { aggregate, composition } = confirmedSpine({
      ...readyValues,
      "volume.depthMm": "30",
    });
    const sixtyOnly = costEvidence.filter(
      (item) =>
        item.resourceId !== ALUMINIUM_RETURN_PROFILE_ID || item.when?.volumeDepthMm === 60,
    );
    const eic = compileEic(aggregate, composition, sixtyOnly);
    const issues = projectCostCompletenessIssues(aggregate, composition, sixtyOnly);
    const missing = issues.find((issue) => issue.type === "MISSING_COST_EVIDENCE");
    const plexiglas = getResource(PLEXIGLAS_3MM_OPAL_ID);
    expect(eic.completeness).toBe("PARTIAL");
    expect(missing?.resourceId).toBe(ALUMINIUM_RETURN_PROFILE_ID);
    expect(missing?.label).toBe(getResource(ALUMINIUM_RETURN_PROFILE_ID)?.label);
    expect(missing?.reason).toBe(
      "Tarif profil aluminiu neconfirmat pentru adâncimea 30 mm",
    );
    expect(JSON.stringify(issues)).not.toMatch(/"rate":0|"cost":0|"amount":0/);
    expect(eic.lines.some((line) => line.resourceId === ALUMINIUM_RETURN_PROFILE_ID)).toBe(
      false,
    );
    expect(plexiglas?.label).toBeTruthy();
  });

  it("uses the actual resource label when a sheet tariff is missing", () => {
    const { aggregate, composition } = confirmedSpine();
    const withoutPlexiglas = costEvidence.filter(
      (item) => item.resourceId !== PLEXIGLAS_3MM_OPAL_ID,
    );
    const issues = projectCostCompletenessIssues(aggregate, composition, withoutPlexiglas);
    const missing = issues.find(
      (issue) =>
        issue.type === "MISSING_COST_EVIDENCE" && issue.resourceId === PLEXIGLAS_3MM_OPAL_ID,
    );
    expect(missing?.label).toBe("Plexiglas 3 mm opal");
    expect(missing?.reason).toBe("Tarif lipsă pentru Plexiglas 3 mm opal");
    expect(missing?.reason).not.toMatch(/zero|0,00|0\.00/i);
    expect(missingCostEvidenceReason(FOREX_10MM_ID)).toBe(
      `Tarif lipsă pentru ${getResource(FOREX_10MM_ID)?.label}`,
    );
  });

  it("does not label a missing measurement as a missing tariff", () => {
    const { truth } = confirmedSpine();
    const missing = compileAggregate(
      { ...truth, measurements: [] },
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      seededDisplayLabelCatalog(),
    );
    const issues = projectCostCompletenessIssues(missing);
    expect(issues.some((issue) => issue.type === "MISSING_TECHNICAL_INPUT")).toBe(true);
    expect(issues.some((issue) => issue.reason === "Suprafață față neconfirmată")).toBe(true);
    expect(issues.some((issue) => issue.type === "MISSING_COST_EVIDENCE")).toBe(false);
    expect(JSON.stringify(issues)).not.toMatch(/Tarif lipsă|tarif lipsa/i);
  });

  it("distinguishes provisional evidence from a missing tariff", () => {
    const { aggregate, composition } = confirmedSpine({
      ...readyValues,
      "face.finish": "vinyl",
      "face.color": "alb",
    });
    const eic = compileEic(aggregate, composition);
    const issues = projectCostCompletenessIssues(aggregate, composition);
    expect(eic.completeness).toBe("PARTIAL");
    expect(issues.some((issue) => issue.type === "PROVISIONAL_COST_EVIDENCE")).toBe(true);
    expect(
      issues.some((issue) => issue.reason === PROVISIONAL_COST_EVIDENCE_REASON),
    ).toBe(true);
    expect(issues.some((issue) => issue.type === "MISSING_COST_EVIDENCE")).toBe(false);
    expect(JSON.stringify(issues)).not.toMatch(/Tarif lipsă/);
  });

  it("emits no unresolved issues when EIC is complete", () => {
    const { aggregate, composition } = confirmedSpine();
    const eic = compileEic(aggregate, composition);
    expect(eic.completeness).toBe("COMPLETE");
    expect(projectCostCompletenessIssues(aggregate, composition)).toEqual([]);
  });
});
