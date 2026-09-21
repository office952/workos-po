import { describe, expect, it } from "vitest";
import { compileAcceptedProductEvaluation } from "./acceptedEvaluation.js";
import { starterFormulaVersionsForType } from "./resolveFormulas.js";
import { confirmReviewedDraft, projectConfigurationPreview } from "./configurationPreview.js";
import {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "./frontlitPlexiAl06.js";
import { ledModuleQuantityFromPerimeter, requiredPsuCapacityW } from "./lighting.js";
import { seededDisplayLabelCatalog } from "./displayMetadata.js";
import {
  LED_MODULE_POWER_SETTING_ID,
  LED_PITCH_SETTING_ID,
  PSU_RESERVE_SETTING_ID,
} from "./technicalSettings.js";
import {
  createPlatformStarterTechnicalSettingVersions,
  planTechnicalSettingsSave,
  type TechnicalSettingVersionRecord,
} from "./technicalSettingVersion.js";
import {
  resolveOrganizationTechnicalSettings,
  technicalSettingsLookupFromResolved,
} from "./resolveTechnicalSettings.js";
import { costEvidence } from "../resources/catalog.js";

const lettersReadyValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function starters(): TechnicalSettingVersionRecord[] {
  return createPlatformStarterTechnicalSettingVersions({
    now: "2026-09-20T00:00:00.000Z",
    rowIdFor: (definitionId) => `tsv:${definitionId}:v1`,
  });
}

function compileWith(versions: readonly TechnicalSettingVersionRecord[]) {
  const resolution = resolveOrganizationTechnicalSettings(versions);
  if (!resolution.ok) {
    throw new Error(resolution.reason);
  }
  const preview = projectConfigurationPreview(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    { templateCode: CANONICAL_PRODUCT_CODE, values: lettersReadyValues },
    resolution.settings,
  );
  if (!preview.reviewId) {
    throw new Error("preview not ready");
  }
  const truth = confirmReviewedDraft(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    { templateCode: CANONICAL_PRODUCT_CODE, values: lettersReadyValues },
    preview.reviewId,
    "2026-09-20T00:00:00.000Z",
    resolution.settings,
  );
  if ("ok" in truth) {
    throw new Error(truth.reason);
  }
  return compileAcceptedProductEvaluation({
    truth,
    template: frontlitPlexiAl06Template,
    formSchema: frontlitPlexiAl06FormSchema,
    labels: seededDisplayLabelCatalog(),
    costEvidenceRows: costEvidence,
    technicalSettingsForType: technicalSettingsLookupFromResolved(resolution.settings),
    formulaVersionsForType: starterFormulaVersionsForType,
  });
}

describe("resolved technical settings drive future lighting calculation", () => {
  it("keeps formulas and changes quantity, load, and PSU from injected values", () => {
    expect(ledModuleQuantityFromPerimeter(12500, 100)).toBe(125);
    expect(ledModuleQuantityFromPerimeter(12500, 80)).toBe(157);
    expect(requiredPsuCapacityW(125 * 0.75, 25)).toBe(117.1875);
    expect(requiredPsuCapacityW(157 * 1, 50)).toBe(235.5);

    const starter = compileWith(starters());
    const starterLighting = starter.evaluations.find((item) => item.result.role === "LIGHTING");
    expect(starterLighting?.result.quantities.find((item) => item.id === "ledModuleQuantity")?.value).toBe(125);
    expect(starterLighting?.result.quantities.find((item) => item.id === "totalLedLoadW")?.value).toBe(93.75);
    expect(starterLighting?.result.quantities.find((item) => item.id === "requiredPsuCapacityW")?.value).toBe(117.1875);

    const planned = planTechnicalSettingsSave(
      starters(),
      [
        { settingId: LED_PITCH_SETTING_ID, value: 80 },
        { settingId: LED_MODULE_POWER_SETTING_ID, value: 1 },
        { settingId: PSU_RESERVE_SETTING_ID, value: 50 },
      ],
      { kind: "USER", userId: "user-1" },
      {
        now: "2026-09-20T01:00:00.000Z",
        rowIdFor: (definitionId) => `tsv:${definitionId}:v2`,
      },
    );
    expect(planned.ok).toBe(true);
    if (!planned.ok) {
      throw new Error("expected plan");
    }
    const retired = starters().map((row) => ({ ...row, status: "RETIRED" as const }));
    const next = compileWith([...retired, ...planned.next]);
    const lighting = next.evaluations.find((item) => item.result.role === "LIGHTING");
    expect(lighting?.result.quantities.find((item) => item.id === "ledModuleQuantity")?.value).toBe(157);
    expect(lighting?.result.quantities.find((item) => item.id === "totalLedLoadW")?.value).toBe(157);
    expect(lighting?.result.quantities.find((item) => item.id === "requiredPsuCapacityW")?.value).toBe(235.5);
  });

  it("invalidates an old reviewId after a technical version change", () => {
    const first = resolveOrganizationTechnicalSettings(starters());
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error("expected first resolution");
    }
    const preview = projectConfigurationPreview(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      { templateCode: CANONICAL_PRODUCT_CODE, values: lettersReadyValues },
      first.settings,
    );
    expect(preview.reviewId).toMatch(/^crv1:/);

    const planned = planTechnicalSettingsSave(
      starters(),
      [{ settingId: LED_PITCH_SETTING_ID, value: 80 }],
      { kind: "USER", userId: "user-1" },
      {
        now: "2026-09-20T01:00:00.000Z",
        rowIdFor: (definitionId) => `tsv:${definitionId}:v2`,
      },
    );
    expect(planned.ok).toBe(true);
    if (!planned.ok) {
      throw new Error("expected plan");
    }
    const retired = starters().map((row) =>
      row.settingId === LED_PITCH_SETTING_ID ? { ...row, status: "RETIRED" as const } : row,
    );
    const second = resolveOrganizationTechnicalSettings([...retired, ...planned.next]);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      throw new Error("expected second resolution");
    }
    const stale = confirmReviewedDraft(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      { templateCode: CANONICAL_PRODUCT_CODE, values: lettersReadyValues },
      preview.reviewId ?? "",
      "2026-09-20T01:00:00.000Z",
      second.settings,
    );
    expect("ok" in stale && stale.reason).toBe("review_mismatch");

    const nextPreview = projectConfigurationPreview(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      { templateCode: CANONICAL_PRODUCT_CODE, values: lettersReadyValues },
      second.settings,
    );
    expect(nextPreview.reviewId).not.toBe(preview.reviewId);
    const confirmed = confirmReviewedDraft(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      { templateCode: CANONICAL_PRODUCT_CODE, values: lettersReadyValues },
      nextPreview.reviewId ?? "",
      "2026-09-20T01:00:00.000Z",
      second.settings,
    );
    expect("status" in confirmed && confirmed.status).toBe("CONFIRMED_IN_RUNTIME");
  });
});
