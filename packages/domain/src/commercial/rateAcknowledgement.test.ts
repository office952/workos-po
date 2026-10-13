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
import { starterFormulaVersionsForType } from "../product/resolveFormulas.js";
import type { DraftValues } from "../product/types.js";
import { costEvidence, type CostEvidence } from "../resources/catalog.js";
import { compileEic } from "../resources/eic.js";
import { projectCommercialPrice } from "./price.js";
import { projectManualFixedProductPrice } from "./productPrice.js";
import {
  freezeQuoteSnapshot,
  isSupportedQuoteSnapshot,
  quoteSnapshotContentHash,
} from "./quoteSnapshot.js";
import { scopeQuoteSnapshot } from "./financialAccess.js";
import {
  assessRateAcknowledgement,
  decideRateAcknowledgement,
  scopeRateAcknowledgementRequirement,
  type RateAcknowledgementRequirement,
} from "./rateAcknowledgement.js";

const readyValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};
const vinylValues: DraftValues = { ...readyValues, "face.finish": "vinyl", "face.color": "alb" };
const FROZEN_AT = "2026-10-13T08:00:00.000Z";

function spine(values: DraftValues, evidenceRows: readonly CostEvidence[] = costEvidence) {
  const definition = compileDefinition(frontlitPlexiAl06Template, frontlitPlexiAl06FormSchema, {
    templateCode: CANONICAL_PRODUCT_CODE,
    values,
  });
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error("expected confirmed truth");
  }
  const options = { formulaVersionsForType: starterFormulaVersionsForType };
  const aggregate = compileAggregate(
    truth,
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    seededDisplayLabelCatalog(),
    options,
  );
  const composition = composeProductProcessesFromTruth(
    truth,
    frontlitPlexiAl06Template,
    undefined,
    options,
  );
  const eic = compileEic(aggregate, composition, evidenceRows);
  const commercial = projectCommercialPrice(eic);
  return { truth, aggregate, composition, eic, commercial, evidenceRows };
}

function assess(
  values: DraftValues,
  overrides: { organizationId?: string; requestId?: string | null } = {},
  evidenceRows: readonly CostEvidence[] = costEvidence,
) {
  const built = spine(values, evidenceRows);
  const requirement = assessRateAcknowledgement({
    organizationId: overrides.organizationId ?? "org-alpha",
    requestId: overrides.requestId ?? null,
    truth: built.truth,
    aggregate: built.aggregate,
    composition: built.composition,
    costEvidenceRows: built.evidenceRows,
    commercial: built.commercial,
  });
  return { ...built, requirement };
}

function acknowledge(requirement: RateAcknowledgementRequirement, actorUserId = "user-owner") {
  return decideRateAcknowledgement(requirement, {
    authorized: true,
    submittedBindingHash: requirement.bindingHash,
    actorUserId,
    acknowledgedAt: FROZEN_AT,
  });
}

describe("unconfirmed rate acknowledgement policy", () => {
  it("does not require acknowledgement when every used rate is confirmed", () => {
    const { requirement } = assess(readyValues);
    expect(requirement.status).toBe("NOT_REQUIRED");
    expect(requirement.rates).toEqual([]);
    expect(requirement.bindingHash).toBeNull();
    expect(acknowledge(requirement)).toEqual({ ok: true, acknowledgement: null });
  });

  it("requires acknowledgement for unconfirmed rates that drive a cost-plus price", () => {
    const { requirement, commercial } = assess(vinylValues);
    expect(commercial.completeness).toBe("COMPLETE");
    expect(requirement.status).toBe("REQUIRED");
    expect(requirement.impact).toBe("DRIVES_SELLING_PRICE");
    expect(requirement.rates.map((rate) => rate.resourceId).sort()).toEqual(
      ["LAB-VINYL-FACE", "MAT-VINYL-ORACAL-651"].sort(),
    );
    for (const rate of requirement.rates) {
      expect(rate.amount).toBeGreaterThan(0);
      expect(rate.source).toBe("LEGACY_EVIDENCE");
      expect(rate.classification).toBe("DEVELOPMENT_DEFAULT");
    }
    expect(requirement.bindingHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("only discloses unconfirmed rates under an owner-authorized manual price", () => {
    const built = spine(vinylValues);
    const manual = projectManualFixedProductPrice({
      netPrice: 900,
      internalCost: built.eic.total,
      internalCostCompleteness: built.eic.completeness,
    });
    const requirement = assessRateAcknowledgement({
      organizationId: "org-alpha",
      requestId: null,
      truth: built.truth,
      aggregate: built.aggregate,
      composition: built.composition,
      costEvidenceRows: built.evidenceRows,
      commercial: manual,
    });
    expect(requirement.status).toBe("DISCLOSURE_ONLY");
    expect(requirement.impact).toBe("INTERNAL_COST_ONLY");
    expect(requirement.bindingHash).toBeNull();
    expect(acknowledge(requirement)).toEqual({ ok: true, acknowledgement: null });
  });

  it("refuses unauthorized, missing and stale acknowledgements in that order", () => {
    const { requirement } = assess(vinylValues);
    const base = { actorUserId: "user", acknowledgedAt: FROZEN_AT };
    expect(
      decideRateAcknowledgement(requirement, {
        ...base,
        authorized: false,
        submittedBindingHash: requirement.bindingHash,
      }),
    ).toMatchObject({ ok: false, error: "rate_acknowledgement_forbidden" });
    expect(
      decideRateAcknowledgement(requirement, {
        ...base,
        authorized: true,
        actorUserId: " ",
        submittedBindingHash: requirement.bindingHash,
      }),
    ).toMatchObject({ ok: false, error: "rate_acknowledgement_forbidden" });
    expect(
      decideRateAcknowledgement(requirement, { ...base, authorized: true, submittedBindingHash: null }),
    ).toMatchObject({ ok: false, error: "rate_acknowledgement_required" });
    expect(
      decideRateAcknowledgement(requirement, {
        ...base,
        authorized: true,
        submittedBindingHash: "0".repeat(64),
      }),
    ).toMatchObject({ ok: false, error: "rate_acknowledgement_stale" });
  });

  it("binds the acknowledgement to the organization, request, configuration and rate amount", () => {
    const original = assess(vinylValues).requirement.bindingHash;
    expect(assess(vinylValues).requirement.bindingHash).toBe(original);
    expect(assess(vinylValues, { organizationId: "org-beta" }).requirement.bindingHash).not.toBe(
      original,
    );
    expect(assess(vinylValues, { requestId: "req-1" }).requirement.bindingHash).not.toBe(original);
    expect(
      assess({ ...vinylValues, "face.confirmedAreaMm2": 260000 }).requirement.bindingHash,
    ).not.toBe(original);
    const changedRate = costEvidence.map((row) =>
      row.resourceId === "MAT-VINYL-ORACAL-651" ? { ...row, amount: row.amount + 1 } : row,
    );
    expect(assess(vinylValues, {}, changedRate).requirement.bindingHash).not.toBe(original);
  });

  it("never exposes rate amounts to commercial users and hides the panel from the workshop", () => {
    const { requirement } = assess(vinylValues);
    const owner = scopeRateAcknowledgementRequirement(requirement, "owner", true);
    const commercial = scopeRateAcknowledgementRequirement(requirement, "commercial", false);
    expect(owner).toMatchObject({ status: "REQUIRED", canAcknowledge: true });
    expect((owner?.rates as Record<string, unknown>[])[0]).toHaveProperty("amount");
    expect(commercial).toMatchObject({ status: "REQUIRED", canAcknowledge: false });
    for (const rate of commercial?.rates as Record<string, unknown>[]) {
      expect(rate).not.toHaveProperty("amount");
      expect(rate).not.toHaveProperty("quantity");
    }
    expect(scopeRateAcknowledgementRequirement(requirement, "workshop", false)).toBeNull();
  });
});

describe("acknowledged quote snapshot", () => {
  it("records the acknowledgement immutably with the acknowledgement time outside the hash", () => {
    const { truth, aggregate, composition, eic, commercial, requirement } = assess(vinylValues);
    const decision = acknowledge(requirement);
    if (!decision.ok || !decision.acknowledgement) {
      throw new Error("expected acknowledgement");
    }
    const first = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial, {
      createdAt: FROZEN_AT,
      rateAcknowledgement: decision.acknowledgement,
    });
    const later = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial, {
      createdAt: "2026-10-14T08:00:00.000Z",
      rateAcknowledgement: { ...decision.acknowledgement, acknowledgedAt: "2026-10-14T08:00:00.000Z" },
    });
    const unacknowledged = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial, {
      createdAt: FROZEN_AT,
    });
    if (!first.ok || !later.ok || !unacknowledged.ok) {
      throw new Error("expected frozen snapshots");
    }
    expect(first.snapshot.rateAcknowledgement?.acknowledgedByUserId).toBe("user-owner");
    expect(first.snapshot.rateAcknowledgement?.acknowledgedAt).toBe(FROZEN_AT);
    expect(first.snapshot.contentHash).toBe(later.snapshot.contentHash);
    expect(first.snapshot.contentHash).not.toBe(unacknowledged.snapshot.contentHash);
    expect(quoteSnapshotContentHash(first.snapshot)).toBe(first.snapshot.contentHash);
    expect(isSupportedQuoteSnapshot(first.snapshot)).toBe(true);
    expect(JSON.stringify(first.snapshot)).not.toMatch(/cookie|session|password|token/i);
  });

  it("keeps historical snapshots without an acknowledgement hashing exactly as before", () => {
    const { truth, aggregate, composition, eic, commercial } = spine(readyValues);
    const result = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial, {
      createdAt: "2026-08-17T00:00:00.000Z",
    });
    if (!result.ok) {
      throw new Error("expected frozen snapshot");
    }
    expect(result.snapshot).not.toHaveProperty("rateAcknowledgement");
    expect(result.snapshot.contentHash).toBe(
      "0dda835a76e32fe519ae3c2e8c17435d4233a2221f34f5fcb5d84c9993807604",
    );
  });

  it("rejects a malformed acknowledgement and acknowledgement on a manual price", () => {
    const { truth, aggregate, composition, eic, commercial, requirement } = assess(vinylValues);
    const decision = acknowledge(requirement);
    if (!decision.ok || !decision.acknowledgement) {
      throw new Error("expected acknowledgement");
    }
    const frozen = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial, {
      createdAt: FROZEN_AT,
      rateAcknowledgement: decision.acknowledgement,
    });
    if (!frozen.ok) {
      throw new Error("expected frozen snapshot");
    }
    const tampered = {
      ...frozen.snapshot,
      rateAcknowledgement: { ...decision.acknowledgement, acknowledgedByUserId: "" },
    };
    expect(isSupportedQuoteSnapshot(tampered)).toBe(false);

    const manual = projectManualFixedProductPrice({ netPrice: 900, internalCost: eic.total });
    const refused = freezeQuoteSnapshot(truth, aggregate, composition, eic, manual, {
      createdAt: FROZEN_AT,
      rateAcknowledgement: decision.acknowledgement,
    });
    expect(refused.ok).toBe(false);
  });

  it("projects the acknowledgement to commercial users without amounts", () => {
    const { truth, aggregate, composition, eic, commercial, requirement } = assess(vinylValues);
    const decision = acknowledge(requirement);
    if (!decision.ok || !decision.acknowledgement) {
      throw new Error("expected acknowledgement");
    }
    const frozen = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial, {
      createdAt: FROZEN_AT,
      rateAcknowledgement: decision.acknowledgement,
    });
    if (!frozen.ok) {
      throw new Error("expected frozen snapshot");
    }
    const scoped = scopeQuoteSnapshot(frozen.snapshot, "commercial") as Record<string, unknown>;
    const ack = scoped.rateAcknowledgement as Record<string, unknown>;
    expect(ack).toMatchObject({ acknowledgedByUserId: "user-owner" });
    expect(ack).not.toHaveProperty("bindingHash");
    for (const rate of ack.rates as Record<string, unknown>[]) {
      expect(rate).not.toHaveProperty("amount");
    }
  });
});
