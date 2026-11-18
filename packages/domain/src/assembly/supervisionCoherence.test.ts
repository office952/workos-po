import { describe, expect, it } from "vitest";
import { resolveIncompleteCostAcceptance } from "../commercial/quoteAcceptance.js";
import { materialBlockResolverLabel } from "../execution/materialReadiness.js";
import {
  ASSEMBLY_OPERATION_TIME_NOT_COSTED_REASON,
  projectAssemblyActualInternalCost,
} from "../execution/assemblyEconomics.js";
import type { ExecutionTask } from "../execution/plan.js";
import type { FrozenEicLine } from "../production/snapshot.js";
import { assemblyQuoteCostCompleteness, assemblyQuoteFreezeBlockers } from "./commercial.js";
import type { ConfirmedChildProduct } from "./model.js";
import type { FrozenAssemblyOperationCost } from "./operationCostEvidence.js";

/** Assembly & Production Supervision Coherence V1 · F-01, F-02, F-04, F-05 domain rules. */

const quote = { quoteSnapshotId: "asmq:1", contentHash: "hash-1" };

describe("F-01 · one incomplete-cost decision for every acceptance path", () => {
  it("needs and records nothing when the cost is complete", () => {
    const result = resolveIncompleteCostAcceptance({ costComplete: true, quote, exception: null, acceptedAt: "2026-11-18T10:00:00.000Z" });
    expect(result).toEqual({ ok: true, acceptance: undefined });
  });

  it("ignores an exception sent for a complete cost", () => {
    const result = resolveIncompleteCostAcceptance({
      costComplete: true,
      quote,
      exception: { acceptedByUserId: "user:owner", reason: "nu era nevoie" },
      acceptedAt: "2026-11-18T10:00:00.000Z",
    });
    expect(result).toEqual({ ok: true, acceptance: undefined });
  });

  it.each([
    ["no exception", null],
    ["an empty reason", { acceptedByUserId: "user:owner", reason: "   " }],
    ["no actor", { acceptedByUserId: " ", reason: "motiv" }],
    ["a reason over the limit", { acceptedByUserId: "user:owner", reason: "x".repeat(501) }],
  ])("refuses an incomplete cost with %s", (_label, exception) => {
    const result = resolveIncompleteCostAcceptance({ costComplete: false, quote, exception, acceptedAt: "2026-11-18T10:00:00.000Z" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("incomplete_cost_requires_owner_acceptance");
  });

  it("records author, reason, time and the exact quote for an accepted incomplete cost", () => {
    const result = resolveIncompleteCostAcceptance({
      costComplete: false,
      quote,
      exception: { acceptedByUserId: "user:owner", reason: "  Client vechi  " },
      acceptedAt: "2026-11-18T10:00:00.000Z",
    });
    expect(result).toEqual({
      ok: true,
      acceptance: {
        policy: "INCOMPLETE_COST_ACCEPTANCE_V1",
        quoteSnapshotId: "asmq:1",
        quoteContentHash: "hash-1",
        costCompleteness: "PARTIAL",
        acceptedByUserId: "user:owner",
        acceptedAt: "2026-11-18T10:00:00.000Z",
        reason: "Client vechi",
      },
    });
  });

  it("derives assembly completeness from every part and the frozen operation cost", () => {
    const complete = { completeness: "COMPLETE" } as FrozenAssemblyOperationCost;
    const partial = { completeness: "PARTIAL" } as FrozenAssemblyOperationCost;
    const parts = (values: ("COMPLETE" | "PARTIAL")[]) => values.map((eicCompleteness) => ({ eicCompleteness }));
    expect(assemblyQuoteCostCompleteness({ operationCost: complete }, parts(["COMPLETE", "COMPLETE"]))).toBe("COMPLETE");
    expect(assemblyQuoteCostCompleteness({ operationCost: complete }, parts(["COMPLETE", "PARTIAL"]))).toBe("PARTIAL");
    expect(assemblyQuoteCostCompleteness({ operationCost: partial }, parts(["COMPLETE", "COMPLETE"]))).toBe("PARTIAL");
    // D-2 · a quote frozen before operation costing carries no evidence: never assumed complete.
    expect(assemblyQuoteCostCompleteness({}, parts(["COMPLETE", "COMPLETE"]))).toBe("PARTIAL");
  });
});

describe("F-05 · freeze eligibility names the members without a price", () => {
  const child = (truthId: string, priced: boolean) =>
    ({
      truthId,
      commercial: priced ? { completeness: "COMPLETE" } : null,
      childQuoteSnapshotId: priced ? `qts:${truthId}` : null,
      childQuoteContentHash: priced ? `hash:${truthId}` : null,
    }) as unknown as ConfirmedChildProduct;
  const assembly = {
    members: [
      { role: "SUPPORT_PANEL" as const, confirmedTruthId: "pct:acm" },
      { role: "SIGNAGE_LOGO" as const, confirmedTruthId: "pct:logo" },
      { role: "SIGNAGE_LETTERS" as const, confirmedTruthId: "pct:letters" },
    ],
  };

  it("lists exactly the unpriced members", () => {
    const blockers = assemblyQuoteFreezeBlockers(assembly, [child("pct:acm", true), child("pct:logo", false), child("pct:letters", false)]);
    expect(blockers.map((item) => [item.role, item.code])).toEqual([
      ["SIGNAGE_LOGO", "PRICE_MISSING"],
      ["SIGNAGE_LETTERS", "PRICE_MISSING"],
    ]);
    expect(blockers[0]?.reason).toContain("Logo");
  });

  it("is empty when every member has a complete price", () => {
    expect(assemblyQuoteFreezeBlockers(assembly, [child("pct:acm", true), child("pct:logo", true), child("pct:letters", true)])).toEqual([]);
  });
});

describe("F-02 · assembly planned vs actual, per part", () => {
  const line = (resourceId: string, quantity: number, rate: number): FrozenEicLine => ({
    resourceId,
    label: resourceId,
    quantity,
    unit: "buc",
    rate,
    currency: "EUR",
    cost: Math.round(quantity * rate * 100) / 100,
  });
  const task = (processLabel: string, scopeLabel: string, consumption: [string, number][]): ExecutionTask =>
    ({
      processLabel,
      scopeLabel,
      actualConsumption: consumption.map(([resourceId, actualQuantity]) => ({ resourceId, actualQuantity, unit: "buc" })),
    }) as unknown as ExecutionTask;
  const operationCost = {
    lines: [
      { operationId: "ANSAMBLARE:MOUNT_LETTERS_ON_PANEL", processId: "MOUNT_LETTERS_ON_PANEL", outcome: "COSTED", quantity: 2.5, unit: "person_hour", rate: 22, cost: 55 },
      { operationId: "ANSAMBLARE:INSPECT_FINISHED_ASSEMBLY", processId: "INSPECT_FINISHED_ASSEMBLY", outcome: "MISSING_POLICY", reason: "Politica pentru verificarea finală nu este configurată" },
    ],
  } as unknown as FrozenAssemblyOperationCost;

  it("keeps a resource shared by two parts as two lines and never merges or doubles it", () => {
    const projection = projectAssemblyActualInternalCost({
      parts: [
        { key: "letters", label: "Litere · SHOWROOM", plannedLines: [line("MAT-LED-MODULE", 176, 0.5)], tasks: [task("Montare module LED", "Litere", [["MAT-LED-MODULE", 168]])] },
        { key: "logo", label: "Logo · LUMEN LOGO", plannedLines: [line("MAT-LED-MODULE", 52, 0.5)], tasks: [task("Montare module LED", "Logo", [["MAT-LED-MODULE", 52]])] },
      ],
      operationCost: null,
    });
    expect(projection.lines.map((item) => [item.resourceId, item.groupLabel, item.plannedQuantity, item.actualQuantity, item.actualCost])).toEqual([
      ["letters/MAT-LED-MODULE", "Litere · SHOWROOM", 176, 168, 84],
      ["logo/MAT-LED-MODULE", "Logo · LUMEN LOGO", 52, 52, 26],
    ]);
    // 84 + 26, not 220 × rate and not twice any part.
    expect(projection.calculableTotal).toBe(110);
    expect(projection.plannedComparableTotal).toBe(114);
    expect(projection.availableDifference).toBe(-4);
    expect(projection.status).toBe("COMPLETE");
  });

  it("supports three parts and leaves assembly operations with a frozen estimate and an unknown operational cost", () => {
    const projection = projectAssemblyActualInternalCost({
      parts: [
        { key: "acm", label: "Panou ACM", plannedLines: [line("MAT-ACM", 4, 30)], tasks: [task("Debitare", "Panou ACM", [["MAT-ACM", 4]])] },
        { key: "letters", label: "Litere", plannedLines: [line("MAT-LED-MODULE", 10, 0.5)], tasks: [task("LED", "Litere", [["MAT-LED-MODULE", 10]])] },
        { key: "logo", label: "Logo", plannedLines: [line("MAT-LED-MODULE", 6, 0.5)], tasks: [task("LED", "Logo", [])] },
      ],
      operationCost,
    });
    const mount = projection.lines.find((item) => item.resourceId === "assembly/ANSAMBLARE:MOUNT_LETTERS_ON_PANEL");
    expect(mount).toMatchObject({ groupLabel: "Ansamblare", plannedCost: 55, actualCost: null, status: "UNAVAILABLE", unavailableReason: ASSEMBLY_OPERATION_TIME_NOT_COSTED_REASON, unit: "ore-persoană" });
    const inspection = projection.lines.find((item) => item.resourceId === "assembly/ANSAMBLARE:INSPECT_FINISHED_ASSEMBLY");
    // Unknown, never zero.
    expect(inspection).toMatchObject({ plannedCost: null, actualCost: null, status: "UNAVAILABLE" });
    const logo = projection.lines.find((item) => item.resourceId === "logo/MAT-LED-MODULE");
    expect(logo).toMatchObject({ actualQuantity: null, actualCost: null, status: "UNAVAILABLE" });
    expect(projection.status).toBe("PARTIAL");
    expect(projection.calculableTotal).toBe(125);
    expect(projection.calculableCount).toBe(2);
    expect(projection.unavailableCount).toBe(3);
  });

  it("reports UNAVAILABLE with null totals when nothing was consumed", () => {
    const projection = projectAssemblyActualInternalCost({
      parts: [{ key: "acm", label: "Panou ACM", plannedLines: [line("MAT-ACM", 4, 30)], tasks: [] }],
      operationCost: null,
    });
    expect(projection.status).toBe("UNAVAILABLE");
    expect(projection.calculableTotal).toBeNull();
    expect(projection.availableDifference).toBeNull();
  });
});

describe("F-04 · who resolves a material block comes from the role matrix", () => {
  it("names the roles that hold the supervision capability", () => {
    expect(materialBlockResolverLabel()).toBe("Proprietar sau Producție");
  });
});
