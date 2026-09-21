import { starterFormulaVersionsForType } from "../product/resolveFormulas.js";
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
import { DEFAULT_COMMERCIAL_POLICY } from "../commercial/policy.js";
import { projectCommercialPrice, roundMoney } from "../commercial/price.js";
import { projectAuthorizedProductCommercialPrice } from "../commercial/productPrice.js";

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
  const aggregate = compileAggregate(truth, frontlitPlexiAl06Template, frontlitPlexiAl06FormSchema, seededDisplayLabelCatalog(), { formulaVersionsForType: starterFormulaVersionsForType });
  const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template, undefined, { formulaVersionsForType: starterFormulaVersionsForType });
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
    expect(eic.calculationStatus).toBe("UNAVAILABLE");
    expect(missing?.impact).toBe("BLOCKS_CALCULATION");
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
    expect(
      issues.every(
        (issue) =>
          issue.type !== "MISSING_TECHNICAL_INPUT" || issue.impact === "BLOCKS_CALCULATION",
      ),
    ).toBe(true);
    expect(issues.some((issue) => issue.type === "PROVISIONAL_COST_EVIDENCE")).toBe(false);
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
    expect(eic.completeness).toBe("COMPLETE");
    expect(eic.calculationStatus).toBe("CALCULABLE");
    expect(eic.verificationStatus).toBe("NEEDS_VERIFICATION");
    expect(issues.some((issue) => issue.type === "PROVISIONAL_COST_EVIDENCE")).toBe(true);
    expect(
      issues.every(
        (issue) =>
          issue.type !== "PROVISIONAL_COST_EVIDENCE" || issue.impact === "REQUIRES_VERIFICATION",
      ),
    ).toBe(true);
    expect(
      issues.some((issue) => issue.reason === PROVISIONAL_COST_EVIDENCE_REASON),
    ).toBe(true);
    expect(issues.some((issue) => issue.type === "MISSING_COST_EVIDENCE")).toBe(false);
    expect(JSON.stringify(issues)).not.toMatch(/Tarif lipsă/);
  });

  it("emits no unresolved issues when EIC is complete and confirmed", () => {
    const { aggregate, composition } = confirmedSpine();
    const eic = compileEic(aggregate, composition);
    expect(eic.completeness).toBe("COMPLETE");
    expect(eic.calculationStatus).toBe("CALCULABLE");
    expect(eic.verificationStatus).toBe("CONFIRMED");
    expect(projectCostCompletenessIssues(aggregate, composition)).toEqual([]);
  });

  it("A. calculates confirmed numeric inputs as confirmed", () => {
    const { aggregate, composition } = confirmedSpine();
    const eic = compileEic(aggregate, composition);
    const price = projectCommercialPrice(eic);
    expect(eic.total).toBe(382.5);
    expect(eic.calculationStatus).toBe("CALCULABLE");
    expect(eic.verificationStatus).toBe("CONFIRMED");
    expect(price.completeness).toBe("COMPLETE");
    expect(price.verificationStatus).toBe("CONFIRMED");
    expect(price.netPrice).toBe(516.38);
    expect(price.grossPrice).toBe(624.82);
  });

  it("B. includes provisional numeric evidence in the calculated total", () => {
    const { aggregate, composition } = confirmedSpine({
      ...readyValues,
      "face.finish": "vinyl",
      "face.color": "alb",
    });
    const eic = compileEic(aggregate, composition);
    const issues = projectCostCompletenessIssues(aggregate, composition);
    const price = projectCommercialPrice(eic);
    const authorized = projectAuthorizedProductCommercialPrice(price, DEFAULT_COMMERCIAL_POLICY, {
      authorized: true,
    });
    expect(eic.total).toBe(386);
    expect(eic.lines.some((line) => line.resourceId === "MAT-VINYL-ORACAL-651")).toBe(true);
    expect(eic.calculationStatus).toBe("CALCULABLE");
    expect(eic.verificationStatus).toBe("NEEDS_VERIFICATION");
    expect(price.completeness).toBe("COMPLETE");
    expect(price.calculationStatus).toBe("CALCULABLE");
    expect(price.verificationStatus).toBe("NEEDS_VERIFICATION");
    expect(price.netPrice).toBe(roundMoney(386 * 1.35));
    expect(price.vatAmount).not.toBeNull();
    expect(price.grossPrice).toBe(roundMoney(roundMoney(386 * 1.35) * 1.21));
    expect(authorized.completeness).toBe("COMPLETE");
    expect(issues.every((issue) => issue.impact !== "BLOCKS_CALCULATION")).toBe(true);
    expect(issues.some((issue) => issue.impact === "REQUIRES_VERIFICATION")).toBe(true);
  });

  it("C. does not invent a missing numeric tariff", () => {
    const { aggregate, composition } = confirmedSpine();
    const withoutPlexiglas = costEvidence.filter(
      (item) => item.resourceId !== PLEXIGLAS_3MM_OPAL_ID,
    );
    const eic = compileEic(aggregate, composition, withoutPlexiglas);
    const issues = projectCostCompletenessIssues(aggregate, composition, withoutPlexiglas);
    const price = projectCommercialPrice(eic);
    expect(eic.calculationStatus).toBe("UNAVAILABLE");
    expect(eic.lines.some((line) => line.resourceId === PLEXIGLAS_3MM_OPAL_ID)).toBe(false);
    expect(eic.lines.some((line) => line.rate === 0 && line.resourceId === PLEXIGLAS_3MM_OPAL_ID)).toBe(
      false,
    );
    expect(price.completeness).toBe("PARTIAL");
    expect(price.calculationStatus).toBe("UNAVAILABLE");
    expect(price.unavailableReasons).toEqual([
      "Costul intern nu este complet pentru această configurație.",
    ]);
    expect(issues.some((issue) => issue.label === "Plexiglas 3 mm opal")).toBe(true);
    expect(issues.find((issue) => issue.resourceId === PLEXIGLAS_3MM_OPAL_ID)?.impact).toBe(
      "BLOCKS_CALCULATION",
    );
    expect(JSON.stringify(issues)).not.toMatch(/"rate":0|"cost":0|"amount":0/);
    expect(
      eic.lines.some((line) => line.resourceId === PLEXIGLAS_3MM_OPAL_ID && line.cost === 0),
    ).toBe(false);
  });

  it("D. keeps a missing technical input separate from price verification", () => {
    const { truth } = confirmedSpine();
    const missing = compileAggregate(
      { ...truth, measurements: [] },
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      seededDisplayLabelCatalog(),
    );
    const eic = compileEic(missing);
    const issues = projectCostCompletenessIssues(missing);
    const price = projectCommercialPrice(eic);
    expect(eic.calculationStatus).toBe("UNAVAILABLE");
    expect(eic.verificationStatus).toBe("CONFIRMED");
    expect(price.completeness).toBe("PARTIAL");
    expect(issues.some((issue) => issue.type === "MISSING_TECHNICAL_INPUT")).toBe(true);
    expect(issues.some((issue) => issue.type === "PROVISIONAL_COST_EVIDENCE")).toBe(false);
    expect(issues.some((issue) => issue.type === "MISSING_COST_EVIDENCE")).toBe(false);
  });

  it("E. sums mixed confirmed and provisional numeric lines", () => {
    const { aggregate, composition } = confirmedSpine({
      ...readyValues,
      "face.finish": "vinyl",
      "face.color": "alb",
    });
    const eic = compileEic(aggregate, composition);
    const issues = projectCostCompletenessIssues(aggregate, composition);
    const confirmedTotal = eic.lines
      .filter((line) => line.resourceId !== "MAT-VINYL-ORACAL-651" && line.resourceId !== "LAB-VINYL-FACE")
      .reduce((sum, line) => sum + line.cost, 0);
    const provisionalTotal = eic.lines
      .filter((line) => line.resourceId === "MAT-VINYL-ORACAL-651" || line.resourceId === "LAB-VINYL-FACE")
      .reduce((sum, line) => sum + line.cost, 0);
    expect(provisionalTotal).toBe(3.5);
    expect(eic.total).toBe(confirmedTotal + provisionalTotal);
    expect(eic.total).toBe(386);
    expect(issues.every((issue) => issue.type === "PROVISIONAL_COST_EVIDENCE")).toBe(true);
    expect(issues.every((issue) => issue.impact === "REQUIRES_VERIFICATION")).toBe(true);
    expect(issues.some((issue) => typeof issue.rate === "number" && issue.rate > 0)).toBe(true);
  });
});
