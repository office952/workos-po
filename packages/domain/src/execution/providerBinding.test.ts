import { describe, expect, it } from "vitest";
import { createWorkcenterRegistry, MCH_CNC_4020_ID, WC_ASSEMBLY_01_ID, WC_ASSEMBLY_02_ID, WC_CNC_ROUTING_ID } from "../workcenters/catalog.js";
import { resolveProviderBinding } from "./providerBinding.js";
import { classifyTaskArtifact, parseDossierText, parseIssueReason } from "./taskDossier.js";

const taskBase = {
  providerRequirement: "REQUIRED" as const,
  requiredCapabilityId: "CNC_ROUTING",
  assignedProvider: null,
  status: "PLANNED" as const,
  executionMode: "INTERNAL" as const,
  providerBindingSource: null,
};

describe("unique provider binding", () => {
  const registry = createWorkcenterRegistry(
    [
      {
        id: WC_CNC_ROUTING_ID,
        label: "Zonă CNC",
        description: "Zonă",
        lifecycle: "ACTIVE",
        capabilityIds: ["CNC_ROUTING"],
      },
      {
        id: WC_ASSEMBLY_01_ID,
        label: "Masă 1",
        description: "Masă",
        lifecycle: "ACTIVE",
        capabilityIds: ["MANUAL_ASSEMBLY"],
      },
      {
        id: WC_ASSEMBLY_02_ID,
        label: "Masă 2",
        description: "Masă",
        lifecycle: "ACTIVE",
        capabilityIds: ["MANUAL_ASSEMBLY"],
      },
    ],
    [
      {
        id: MCH_CNC_4020_ID,
        label: "CNC 4020",
        description: "Utilaj",
        workcenterId: WC_CNC_ROUTING_ID,
        lifecycle: "ACTIVE",
        capabilityIds: ["CNC_ROUTING"],
      },
    ],
  );

  it("collapses a zone that only hosts the single active machine", () => {
    const resolution = resolveProviderBinding(taskBase, registry);
    expect(resolution.state).toBe("UNIQUE_PENDING");
    expect(resolution.provider?.id).toBe(MCH_CNC_4020_ID);
    expect(resolution.provider?.kind).toBe("MACHINE");
  });

  it("keeps two assembly zones as an explicit choice", () => {
    const resolution = resolveProviderBinding(
      { ...taskBase, requiredCapabilityId: "MANUAL_ASSEMBLY" },
      registry,
    );
    expect(resolution.state).toBe("CHOICE_REQUIRED");
    expect(resolution.choices).toHaveLength(2);
  });

  it("reports none when nothing active matches", () => {
    const empty = createWorkcenterRegistry([], []);
    expect(resolveProviderBinding(taskBase, empty).state).toBe("NONE");
  });

  it("does not replace an existing assignment", () => {
    const assigned = {
      ...taskBase,
      assignedProvider: { id: "mch:other", kind: "MACHINE" as const, label: "Altul" },
      providerBindingSource: "MANUAL" as const,
    };
    const resolution = resolveProviderBinding(assigned, registry);
    expect(resolution.state).toBe("UNAVAILABLE");
    expect(resolution.provider?.id).toBe("mch:other");
  });

  it("does not treat an unlinked zone and a machine as one provider", () => {
    const mixed = createWorkcenterRegistry(
      [
        {
          id: WC_CNC_ROUTING_ID,
          label: "Zonă CNC",
          description: "Zonă",
          lifecycle: "ACTIVE",
          capabilityIds: ["CNC_ROUTING"],
        },
      ],
      [
        {
          id: MCH_CNC_4020_ID,
          label: "CNC 4020",
          description: "Utilaj",
          workcenterId: null,
          lifecycle: "ACTIVE",
          capabilityIds: ["CNC_ROUTING"],
        },
      ],
    );
    expect(resolveProviderBinding(taskBase, mixed).state).toBe("CHOICE_REQUIRED");
  });
});

describe("task dossier validation", () => {
  it("rejects empty notes, unknown reasons and active svg", () => {
    expect(parseDossierText("  ")).toEqual({ ok: false, error: "invalid_text" });
    expect(parseIssueReason("nope")).toEqual({ ok: false, error: "invalid_reason" });
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    expect(
      classifyTaskArtifact({ fileName: "sketch.svg", mimeType: "image/svg+xml", bytes: svg }).ok,
    ).toBe(false);
    expect(
      classifyTaskArtifact({
        fileName: "note.txt",
        mimeType: "text/plain",
        bytes: svg,
      }).ok,
    ).toBe(false);
    expect(
      classifyTaskArtifact({
        fileName: "plan.pdf",
        mimeType: "application/pdf",
        bytes: new TextEncoder().encode("%PDF-1.4"),
      }).ok,
    ).toBe(true);
  });
});
