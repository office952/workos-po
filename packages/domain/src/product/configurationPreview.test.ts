import { describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  ACM_GOLDEN_DEPTH_MM,
  ACM_GOLDEN_HEIGHT_MM,
  ACM_GOLDEN_WIDTH_MM,
  acmCassetteNoneFormSchema,
  acmCassetteNoneTemplate,
} from "./acmCassetteNone.js";
import {
  configurationReviewId,
  configurationReviewIdFor,
  confirmReviewedDraft,
  projectConfigurationPreview,
  usedTechnicalSettingsSnapshot,
} from "./configurationPreview.js";
import { compileDefinition } from "./compiler.js";
import {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "./frontlitPlexiAl06.js";
import { LED_PITCH_SETTING_ID } from "./technicalSettings.js";
import type { DraftConfiguration } from "./types.js";

const lettersReadyValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const acmReadyValues = {
  "root.inscription": "ACM",
  "root.mountingSystem": "steel_angle",
  "face.widthMm": ACM_GOLDEN_WIDTH_MM,
  "face.heightMm": ACM_GOLDEN_HEIGHT_MM,
  "face.cassetteDepthMm": String(ACM_GOLDEN_DEPTH_MM),
  "face.foldCount": "1",
};

function lettersDraft(values: DraftConfiguration["values"]): DraftConfiguration {
  return { templateCode: CANONICAL_PRODUCT_CODE, values };
}

describe("configuration preview transport", () => {
  it("projects LETTERS none/none without a ProductDefinition graph", () => {
    const preview = projectConfigurationPreview(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      lettersDraft(lettersReadyValues),
    );
    expect(preview.product.productCode).toBe(CANONICAL_PRODUCT_CODE);
    expect(preview.product.fixedValues["lighting.mode"]).toBe("front_lit");
    expect(preview.readiness).toBe("ready");
    expect(preview.reviewId).toMatch(/^crv1:[0-9a-f]+$/);
    expect(preview.selectedComponents.map((item) => item.id)).toEqual(
      expect.arrayContaining(["FACE", "VOLUME", "BACK", "LIGHTING"]),
    );
    expect(JSON.stringify(preview)).not.toMatch(/measurements|templateVersion/);
    expect(preview.formSchema.sections.flatMap((section) => section.fields).map((field) => field.id)).not.toContain(
      "face.color",
    );
  });

  it("changes visibility and readiness when LETTERS values change", () => {
    const blocked = projectConfigurationPreview(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      lettersDraft({ ...lettersReadyValues, "root.inscription": "" }),
    );
    expect(blocked.readiness).toBe("blocked");
    expect(blocked.reviewId).toBeNull();
    expect(blocked.missing.some((item) => item.fieldId === "root.inscription")).toBe(true);

    const vinyl = projectConfigurationPreview(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      lettersDraft({ ...lettersReadyValues, "face.finish": "vinyl" }),
    );
    const vinylFields = vinyl.formSchema.sections.flatMap((section) => section.fields).map((field) => field.id);
    expect(vinylFields).toContain("face.color");
    expect(vinyl.readiness).toBe("blocked");
    expect(vinyl.missing.some((item) => item.fieldId === "face.color")).toBe(true);
  });

  it("does not give ACM LETTERS VOLUME or LIGHTING fields", () => {
    const preview = projectConfigurationPreview(
      acmCassetteNoneTemplate,
      acmCassetteNoneFormSchema,
      { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, values: acmReadyValues },
    );
    expect(preview.product.productCode).toBe(ACM_CASSETTE_NONE_PRODUCT_CODE);
    expect(preview.selectedComponents.map((item) => item.id)).toEqual(["FACE", "BACK"]);
    const fieldIds = preview.formSchema.sections.flatMap((section) => section.fields).map((field) => field.id);
    expect(fieldIds.some((id) => id.startsWith("volume.") || id.startsWith("lighting."))).toBe(false);
    expect(preview.readiness).toBe("ready");
  });

  it("keeps review identity stable for the same ready draft", () => {
    const first = projectConfigurationPreview(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      lettersDraft(lettersReadyValues),
    );
    const second = projectConfigurationPreview(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      lettersDraft(lettersReadyValues),
    );
    expect(first.reviewId).toBe(second.reviewId);
  });

  it("rejects stale review after values change and after settings change", () => {
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      lettersDraft(lettersReadyValues),
    );
    const reviewId = configurationReviewIdFor(frontlitPlexiAl06Template, definition);
    const confirmed = confirmReviewedDraft(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      lettersDraft(lettersReadyValues),
      reviewId,
      "2026-09-16T00:00:00.000Z",
    );
    expect("status" in confirmed && confirmed.status).toBe("CONFIRMED_IN_RUNTIME");

    const staleValues = confirmReviewedDraft(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      lettersDraft({ ...lettersReadyValues, "root.inscription": "CHANGED" }),
      reviewId,
    );
    expect("ok" in staleValues && staleValues.ok).toBe(false);
    expect("reason" in staleValues && staleValues.reason).toBe("review_mismatch");

    const settings = usedTechnicalSettingsSnapshot(
      frontlitPlexiAl06Template,
      definition.selectedComponentIds,
    );
    const mutated = settings.map((item) =>
      item.id === LED_PITCH_SETTING_ID ? { ...item, value: 50 } : item,
    );
    expect(configurationReviewId(definition, settings)).not.toBe(
      configurationReviewId(definition, mutated),
    );
    const staleSettings = confirmReviewedDraft(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      lettersDraft(lettersReadyValues),
      configurationReviewId(definition, mutated),
    );
    expect("ok" in staleSettings && staleSettings.reason).toBe("review_mismatch");
  });
});
