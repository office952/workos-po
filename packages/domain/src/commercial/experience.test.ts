import { describe, expect, it } from "vitest";
import { commercialPrimaryActionLabel, projectCommercialExperience } from "./experience.js";
import type { QuoteSnapshot } from "./quoteSnapshot.js";
import type { QuoteAcceptanceDecision } from "./quoteAcceptance.js";
import type { OrderSnapshot } from "./orderSnapshot.js";

const quote = { quoteSnapshotId: "qts:x" } as QuoteSnapshot;
const acceptance = { acceptanceId: "qad:x" } as QuoteAcceptanceDecision;
const order = { orderSnapshotId: "ord:x" } as OrderSnapshot;

describe("commercial experience projection", () => {
  it("derives one primary action from canonical objects", () => {
    expect(
      projectCommercialExperience({
        commercialCompleteness: "COMPLETE",
      }).primaryAction,
    ).toBe("CREATE_QUOTE");
    expect(
      projectCommercialExperience({
        commercialCompleteness: "COMPLETE",
        quote,
      }),
    ).toMatchObject({
      stage: "QUOTE_CREATED",
      primaryAction: "DOWNLOAD_QUOTE",
      secondaryActions: ["ACCEPT_QUOTE"],
    });
    expect(
      projectCommercialExperience({
        commercialCompleteness: "COMPLETE",
        quote,
        acceptance,
      }).primaryAction,
    ).toBe("CREATE_ORDER");
    expect(
      projectCommercialExperience({
        commercialCompleteness: "COMPLETE",
        quote,
        acceptance,
        order,
      }).primaryAction,
    ).toBe("RELEASE_PRODUCTION");
    expect(
      projectCommercialExperience({
        commercialCompleteness: "COMPLETE",
        quote,
        acceptance,
        order,
        released: true,
      }).primaryAction,
    ).toBe("CREATE_EXECUTION_PLAN");
    expect(
      projectCommercialExperience({
        commercialCompleteness: "COMPLETE",
        quote,
        acceptance,
        order,
        released: true,
        executionPlanId: "plan:x",
      }).primaryAction,
    ).toBe("OPEN_EXECUTION");
  });

  it("blocks quote creation in operator language when price is incomplete", () => {
    const blocked = projectCommercialExperience({
      commercialCompleteness: "PARTIAL",
      internalCostCompleteness: "PARTIAL",
    });
    expect(blocked.stage).toBe("CONFIGURATION_CONFIRMED");
    expect(blocked.primaryAction).toBeNull();
    expect(blocked.quoteBlocker).toBe("Costul intern nu este complet.");
  });

  it("uses operator labels, not architecture nouns", () => {
    expect(commercialPrimaryActionLabel("CREATE_QUOTE")).toBe("Creează oferta");
    expect(commercialPrimaryActionLabel("DOWNLOAD_QUOTE")).toBe("Descarcă oferta PDF");
    expect(commercialPrimaryActionLabel("ACCEPT_QUOTE")).toBe("Marchează acceptată");
    expect(JSON.stringify(projectCommercialExperience({ commercialCompleteness: "COMPLETE" }))).not.toMatch(
      /Snapshot|EIC|Product Truth|contentHash/i,
    );
  });
});
