import { describe, expect, it } from "vitest";
import type { PreviewTransport } from "../api/types";
import { resolveConfiguratorReadiness, resolveConfiguratorWorkState } from "./configuratorWorkState";
import {
  buildWorkbenchSections,
  resolveInitialWorkbenchNavigation,
  workbenchCompletion,
  workbenchFieldError,
  workbenchLayerStatus,
  workbenchMissingByPart,
  workbenchMissingEntries,
  workbenchSectionMissing,
  workbenchSectionSummary,
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

  it("restores navigation only when the section still exists", () => {
    const sections = buildWorkbenchSections(preview);
    expect(resolveInitialWorkbenchNavigation(sections, { sectionId: "vol", composition: false }).sectionId).toBe("vol");
    expect(resolveInitialWorkbenchNavigation(sections, { sectionId: "gone", composition: false }).sectionId).toBe("root");
    expect(resolveInitialWorkbenchNavigation(sections, { sectionId: null, composition: true }).composition).toBe(true);
  });

  it("summarises parts and progress only from the server missing facts", () => {
    const sections = buildWorkbenchSections(preview);
    const status = workbenchLayerStatus(sections[0], preview.missing, {});
    expect(workbenchSectionSummary(status, workbenchSectionMissing(sections[0], preview.missing).length)).toBe("1 lipsă");
    expect(workbenchSectionSummary("readonly", 0)).toBe("Doar consultare");
    expect(workbenchCompletion(sections, preview.missing, { depth: "60" })).toEqual({ settled: 3, total: 4 });
    expect(workbenchCompletion(sections, [], {})).toEqual({ settled: 2, total: 4 });
  });

  it("numbers missing facts by part and ignores facts outside the schema", () => {
    const sections = buildWorkbenchSections(preview);
    const entries = workbenchMissingEntries(sections, [
      ...preview.missing,
      { label: "Fără câmp", componentId: "BACK" },
      { label: "Altă schemă", fieldId: "gone" },
    ]);
    expect(entries).toEqual([
      { label: "Text", fieldId: "name", sectionId: "root", sectionNumber: "01", sectionTitle: "Produs" },
    ]);
    expect(workbenchMissingByPart(entries)).toEqual(["01 Produs · 1"]);
  });

  it("explains a missing field without repeating its label", () => {
    const required = "Obligatoriu. Serverul nu poate verifica fără această informație.";
    const rejected = "Valoare neacceptată. Serverul nu o poate folosi la verificare.";
    expect(workbenchFieldError({ id: "name", label: "Text" }, preview.missing, "", true)).toBe(required);
    expect(workbenchFieldError({ id: "name", label: "Text afișat" }, preview.missing, undefined, true)).toBe(`${required} Text`);
    expect(workbenchFieldError({ id: "name", label: "Text" }, preview.missing, "-5", true)).toBe(rejected);
    expect(workbenchFieldError({ id: "name", label: "Text" }, preview.missing, "", false)).toBeUndefined();
    expect(workbenchFieldError({ id: "depth", label: "Adâncime" }, preview.missing, "", true)).toBeUndefined();
  });
});

describe("configuratorWorkState", () => {
  it("keeps the four storage states distinct and never claims a freeze without a confirmation", () => {
    expect(resolveConfiguratorWorkState({ evaluated: false, confirmed: false, frozen: false })).toBe("LOCAL_DRAFT");
    expect(resolveConfiguratorWorkState({ evaluated: true, confirmed: false, frozen: false })).toBe("SERVER_CHECK");
    expect(resolveConfiguratorWorkState({ evaluated: true, confirmed: true, frozen: false })).toBe("CONFIRMED_CONFIGURATION");
    expect(resolveConfiguratorWorkState({ evaluated: true, confirmed: true, frozen: true })).toBe("FROZEN_QUOTE");
    expect(resolveConfiguratorWorkState({ evaluated: true, confirmed: false, frozen: true })).toBe("SERVER_CHECK");
  });

  it("reports readiness from the last server answer", () => {
    const base = { hasProduct: true, missingParts: ["02 Față · 2"], confirmed: false } as const;
    expect(resolveConfiguratorReadiness({ ...base, previewState: "pending", readiness: "blocked", missingCount: 2 }).title).toBe("Se actualizează");
    expect(resolveConfiguratorReadiness({ ...base, previewState: "ready", readiness: "blocked", missingCount: 2 })).toMatchObject({
      tone: "attention",
      title: "Lipsesc 2 informații obligatorii",
      detail: "după ultima evaluare · 02 Față · 2",
    });
    expect(resolveConfiguratorReadiness({ ...base, previewState: "ready", readiness: "ready", missingCount: 0 }).tone).toBe("ready");
    expect(resolveConfiguratorReadiness({ ...base, previewState: "ready", readiness: "ready", missingCount: 0, confirmed: true }).title).toBe("Configurație confirmată");
    expect(resolveConfiguratorReadiness({ ...base, previewState: "ready", readiness: "ready", missingCount: 0, confirmed: true, frozen: true }).title).toBe("Înghețată în ofertă");
    expect(resolveConfiguratorReadiness({ ...base, previewState: "ready", readiness: "ready", missingCount: 0, confirmed: false, frozen: true }).title).toBe("Pregătit pentru verificare");
    expect(resolveConfiguratorReadiness({ ...base, previewState: "error", readiness: null, missingCount: 0 }).title).toBe("Verificare indisponibilă");
  });
});
