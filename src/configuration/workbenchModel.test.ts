import { describe, expect, it } from "vitest";
import type { PreviewTransport } from "../api/types";
import {
  buildWorkbenchSections,
  measuredFactsForCanvas,
  resolveInitialWorkbenchNavigation,
  workbenchLayerStatus,
} from "./workbenchModel";

const preview: PreviewTransport = {
  product: {
    code: "synthetic",
    label: "Produs sintetic",
    identityFacts: [{ id: "m", componentId: "BACK", label: "Material", value: "Forex" }],
  },
  values: {},
  formSchema: {
    id: "form",
    sections: [
      { id: "root", title: "Produs", fields: [{ id: "name", label: "Text", type: "text", required: true, options: [] }] },
      { id: "vol", title: "Volum", componentId: "VOLUME", fields: [{ id: "depth", label: "Adâncime", type: "select", required: true, options: [{ value: "60", label: "60 mm" }] }] },
    ],
  },
  selectedComponents: [{ id: "FACE", label: "Față" }, { id: "VOLUME", label: "Volum" }, { id: "BACK", label: "Spate" }],
  readiness: "blocked",
  missing: [{ label: "Text", fieldId: "name" }],
  reviewId: null,
  installation: { selected: false, prequoteReady: false, incompleteReasons: [] },
};

describe("workbenchModel", () => {
  it("builds schema sections and read-only component shells", () => {
    const sections = buildWorkbenchSections(preview);
    expect(sections.map((section) => section.title)).toEqual(["Produs", "Volum", "Față", "Spate"]);
    expect(sections.find((section) => section.title === "Spate")?.fields).toEqual([]);
  });

  it("derives layer status from server missing facts and catalog read-only sections", () => {
    const sections = buildWorkbenchSections(preview);
    expect(workbenchLayerStatus(sections[0], preview.missing, { depth: "60" })).toBe("attention");
    expect(workbenchLayerStatus(sections[1], preview.missing, { depth: "60", name: "NORD" })).toBe("complete");
    expect(workbenchLayerStatus(sections[3], preview.missing, {})).toBe("readonly");
  });

  it("hides stale construction evidence until a fresh preview arrives", () => {
    const sections = buildWorkbenchSections(preview);
    for (const technicalState of ["pending", "unavailable"] as const) {
      expect(measuredFactsForCanvas({
        preview,
        activeComponentId: "VOLUME",
        activeSection: sections[1],
        drafts: { depth: "60" },
        technicalState,
      })).toEqual([]);
    }
    expect(measuredFactsForCanvas({
      preview,
      activeComponentId: "VOLUME",
      activeSection: sections[1],
      drafts: { depth: "60" },
      technicalState: "current",
    })).toEqual([{ label: "Adâncime", value: "60 mm", kind: "draft" }]);
  });

  it("restores navigation only when the section still exists", () => {
    const sections = buildWorkbenchSections(preview);
    expect(resolveInitialWorkbenchNavigation(sections, { sectionId: "vol", composition: false }).sectionId).toBe("vol");
    expect(resolveInitialWorkbenchNavigation(sections, { sectionId: "gone", composition: false }).sectionId).toBe("root");
    expect(resolveInitialWorkbenchNavigation(sections, { sectionId: null, composition: true }).composition).toBe(true);
  });

  it("prefers draft and calculated facts for the canvas", () => {
    const sections = buildWorkbenchSections(preview);
    const facts = measuredFactsForCanvas({
      preview: {
        ...preview,
        componentDetails: [{
          componentId: "VOLUME",
          label: "Volum",
          typeId: "VOL",
          calculationLabel: "Calcul",
          facts: [{ id: "area", label: "Suprafață față", value: "12 000 mm²", kind: "CALCULATED", sourceLabel: "Față" }],
          inputFields: [],
          unavailable: [],
          hasFormulas: false,
          hasTechnicalSettings: false,
        }],
      },
      activeComponentId: "VOLUME",
      activeSection: sections[1],
      drafts: { depth: "60" },
    });
    expect(facts.some((fact) => fact.label === "Adâncime" && fact.value === "60 mm")).toBe(true);
    expect(facts.some((fact) => fact.value.includes("mm²"))).toBe(true);
  });
});
