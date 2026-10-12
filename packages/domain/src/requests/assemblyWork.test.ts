import { describe, expect, it } from "vitest";
import { backManufacturingBlockLabel } from "../product/backManufacturing.js";
import type { QuoteOverviewItem } from "../quotes/overview.js";
import {
  assemblyMemberChangeRefusal,
  furthestRequestAssembly,
  REQUEST_COMMERCIAL_ALTERNATIVE_INTENT,
  REQUEST_SEPARATE_QUOTE_INTENT,
  requestAssemblyCreationRefusal,
  requestStandaloneQuoteRefusal,
  type RequestAssemblyWork,
} from "./assemblyWork.js";
import { deriveRequestCommercialProgress, deriveRequestOverviewNextAction } from "./overview.js";

function work(overrides: Partial<RequestAssemblyWork> = {}): RequestAssemblyWork {
  return {
    assemblyId: "asm:1",
    label: "Panou ACM + litere volumetrice",
    stage: "QUOTE_CREATED",
    stageLabel: "Ofertă creată",
    quoteSnapshotId: "asmq:1",
    quoteGrossPrice: 766.34,
    currency: "EUR",
    orderSnapshotId: null,
    productionSnapshotId: null,
    executionPlanId: null,
    revisionPending: false,
    membersEditable: true,
    memberProductCodes: ["PRD-ACM", "PRD-LETTERS"],
    updatedAt: "2026-10-10T10:00:00.000Z",
    ...overrides,
  };
}

function quote(stage: QuoteOverviewItem["stage"]): QuoteOverviewItem {
  return { stage } as QuoteOverviewItem;
}

describe("request assembly work", () => {
  it("prefers the assembly with the furthest commercial step, then the most recent", () => {
    const ordered = work({ assemblyId: "asm:order", orderSnapshotId: "asmo:1", updatedAt: "2026-10-01T00:00:00.000Z" });
    const recent = work({ assemblyId: "asm:recent", updatedAt: "2026-10-11T00:00:00.000Z" });
    expect(furthestRequestAssembly([recent, ordered])?.assemblyId).toBe("asm:order");
    expect(furthestRequestAssembly([work({ assemblyId: "asm:old", updatedAt: "2026-10-01T00:00:00.000Z" }), recent])?.assemblyId).toBe("asm:recent");
    expect(furthestRequestAssembly([])).toBeNull();
  });

  it("drives request progress and next action from assembly snapshots", () => {
    expect(deriveRequestCommercialProgress([], [work()])).toBe("QUOTE_CREATED");
    expect(deriveRequestCommercialProgress([], [work({ orderSnapshotId: "asmo:1" })])).toBe("ORDER_CREATED");
    expect(deriveRequestOverviewNextAction({ status: "NEW", quotes: [], assemblies: [work({ quoteSnapshotId: null })] })).toBe("OPEN_ASSEMBLY");
    expect(deriveRequestOverviewNextAction({ status: "NEW", quotes: [quote("QUOTE_ACCEPTED")], assemblies: [work()] })).toBe("OPEN_QUOTE");
    expect(deriveRequestOverviewNextAction({ status: "NEW", quotes: [quote("QUOTE_CREATED")], assemblies: [work({ orderSnapshotId: "asmo:1" })] })).toBe("OPEN_ASSEMBLY");
    expect(deriveRequestOverviewNextAction({ status: "NEW", quotes: [], assemblies: [] })).toBe("CHOOSE_PRODUCT");
  });

  it("refuses an accidental second assembly but allows an explicit commercial alternative", () => {
    expect(requestAssemblyCreationRefusal({ assemblies: [], intent: null })).toBeNull();
    expect(requestAssemblyCreationRefusal({ assemblies: [work()], intent: null })).toMatchObject({ error: "assembly_exists", assemblyId: "asm:1" });
    expect(requestAssemblyCreationRefusal({ assemblies: [work()], intent: REQUEST_COMMERCIAL_ALTERNATIVE_INTENT })).toBeNull();
  });

  it("asks for explicit intent only when a standalone quote overlaps an assembly member", () => {
    expect(requestStandaloneQuoteRefusal({ productCode: "PRD-LOGO", assemblies: [work()], intent: null })).toBeNull();
    expect(requestStandaloneQuoteRefusal({ productCode: "PRD-LETTERS", assemblies: [work()], intent: null })).toMatchObject({ error: "request_assembly_overlap" });
    expect(requestStandaloneQuoteRefusal({ productCode: "PRD-LETTERS", assemblies: [work()], intent: REQUEST_SEPARATE_QUOTE_INTENT })).toBeNull();
  });

  it("freezes member changes once an order exists", () => {
    expect(assemblyMemberChangeRefusal({ membersEditable: true })).toBeNull();
    expect(assemblyMemberChangeRefusal({ membersEditable: false })?.error).toBe("assembly_order_frozen");
  });

  it("explains blocked back manufacturing in operator language", () => {
    expect(backManufacturingBlockLabel("missing_geometry")).toBe("Spatele se calculează după ce introduci suprafața literelor.");
    expect(backManufacturingBlockLabel("missing_geometry")).not.toContain("missing_geometry");
  });
});
