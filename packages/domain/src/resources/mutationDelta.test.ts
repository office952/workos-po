import { describe, expect, it } from "vitest";
import { ACM_CASSETTE_NONE_PRODUCT_CODE } from "../product/acmCassetteNone.js";
import { CANONICAL_PRODUCT_CODE } from "../product/frontlitPlexiAl06.js";
import {
  ACM_3MM_ID,
  ALUMINIUM_RETURN_PROFILE_ID,
  PLEXIGLAS_3MM_OPAL_ID,
  SVC_PACK_PRODUCT_ID,
  applyActiveCostEvidenceWrite,
  costEvidence,
} from "./catalog.js";
import {
  applyResourcesAdministrationWrite,
  projectResourcesAdministration,
} from "./projection.js";

const AS_OF = "2026-09-04T12:00:00.000Z";

function persistedRows() {
  return costEvidence.map((item, index) => ({
    ...item,
    evidenceRowId: `cev:test:${index}`,
    createdAt: "2026-08-18T00:00:00.000Z",
  }));
}

function row(
  rows: ReturnType<typeof persistedRows>,
  resourceId: string,
  qualifierIdentity?: string,
) {
  return rows.find((item) => {
    if (item.resourceId !== resourceId) {
      return false;
    }
    if (!qualifierIdentity) {
      return item.when?.volumeDepthMm === undefined;
    }
    return `volumeDepthMm=${item.when?.volumeDepthMm}` === qualifierIdentity;
  });
}

describe("resources administration mutation delta", () => {
  it("matches a full rebuild after a qualified aluminium write and keeps other depths", () => {
    const rows = persistedRows();
    const current = row(rows, ALUMINIUM_RETURN_PROFILE_ID, "volumeDepthMm=60");
    expect(current).toBeDefined();
    const next = {
      ...current!,
      amount: 4,
      evidenceRowId: "cev:al-60-next",
      classification: "OWNER_CONFIRMED" as const,
      source: "OWNER_CONFIRMED_PURCHASE" as const,
    };
    const afterRows = applyActiveCostEvidenceWrite(rows, next, current!.evidenceRowId);
    const before = projectResourcesAdministration(rows, AS_OF);
    const delta = applyResourcesAdministrationWrite(before, afterRows, next, AS_OF);
    const full = projectResourcesAdministration(afterRows, AS_OF);

    expect(delta.admin).toEqual(full);
    expect(delta.stats).toEqual({
      costEvidenceRowsRebuilt: 1,
      resourceRecordsRebuilt: 1,
      recipeRecordsRebuilt: 0,
      templateUsagesRebuilt: 1,
    });

    const thirty = before.costEvidence.find(
      (item) =>
        item.resourceId === ALUMINIUM_RETURN_PROFILE_ID &&
        item.qualifierIdentity === "volumeDepthMm=30",
    );
    const eighty = before.costEvidence.find(
      (item) =>
        item.resourceId === ALUMINIUM_RETURN_PROFILE_ID &&
        item.qualifierIdentity === "volumeDepthMm=80",
    );
    const hundred = before.costEvidence.find(
      (item) =>
        item.resourceId === ALUMINIUM_RETURN_PROFILE_ID &&
        item.qualifierIdentity === "volumeDepthMm=100",
    );
    expect(
      delta.admin.costEvidence.find(
        (item) =>
          item.resourceId === ALUMINIUM_RETURN_PROFILE_ID &&
          item.qualifierIdentity === "volumeDepthMm=30",
      ),
    ).toBe(thirty);
    expect(
      delta.admin.costEvidence.find(
        (item) =>
          item.resourceId === ALUMINIUM_RETURN_PROFILE_ID &&
          item.qualifierIdentity === "volumeDepthMm=80",
      ),
    ).toBe(eighty);
    expect(
      delta.admin.costEvidence.find(
        (item) =>
          item.resourceId === ALUMINIUM_RETURN_PROFILE_ID &&
          item.qualifierIdentity === "volumeDepthMm=100",
      ),
    ).toBe(hundred);
    expect(thirty?.amount).toBe(2);
    expect(eighty?.amount).toBe(4);
    expect(hundred?.amount).toBe(5);
    expect(
      delta.admin.costEvidence.find(
        (item) =>
          item.resourceId === ALUMINIUM_RETURN_PROFILE_ID &&
          item.qualifierIdentity === "volumeDepthMm=60",
      )?.amount,
    ).toBe(4);
    expect(
      delta.admin.materials.find((item) => item.id === PLEXIGLAS_3MM_OPAL_ID),
    ).toBe(before.materials.find((item) => item.id === PLEXIGLAS_3MM_OPAL_ID));
    expect(
      delta.admin.templateUsages.find(
        (item) => item.templateCode === ACM_CASSETTE_NONE_PRODUCT_CODE,
      ),
    ).toBe(
      before.templateUsages.find(
        (item) => item.templateCode === ACM_CASSETTE_NONE_PRODUCT_CODE,
      ),
    );
    expect(
      delta.admin.templateUsages.find(
        (item) => item.templateCode === CANONICAL_PRODUCT_CODE,
      ),
    ).not.toBe(
      before.templateUsages.find(
        (item) => item.templateCode === CANONICAL_PRODUCT_CODE,
      ),
    );
  });

  it("rebuilds every consuming template for a shared pack resource", () => {
    const rows = persistedRows();
    const current = row(rows, SVC_PACK_PRODUCT_ID);
    expect(current).toBeDefined();
    const next = {
      ...current!,
      amount: 12,
      evidenceRowId: "cev:pack-next",
      classification: "OWNER_CONFIRMED" as const,
      source: "OWNER_CONFIRMED_WORKSHOP" as const,
    };
    const afterRows = applyActiveCostEvidenceWrite(rows, next, current!.evidenceRowId);
    const before = projectResourcesAdministration(rows, AS_OF);
    const delta = applyResourcesAdministrationWrite(before, afterRows, next, AS_OF);

    expect(delta.admin).toEqual(projectResourcesAdministration(afterRows, AS_OF));
    expect(delta.stats.templateUsagesRebuilt).toBe(2);
    expect(delta.stats.resourceRecordsRebuilt).toBe(1);
    expect(delta.stats.recipeRecordsRebuilt).toBe(1);
    expect(
      delta.admin.templateUsages.find(
        (item) => item.templateCode === CANONICAL_PRODUCT_CODE,
      ),
    ).not.toBe(
      before.templateUsages.find(
        (item) => item.templateCode === CANONICAL_PRODUCT_CODE,
      ),
    );
    expect(
      delta.admin.templateUsages.find(
        (item) => item.templateCode === ACM_CASSETTE_NONE_PRODUCT_CODE,
      ),
    ).not.toBe(
      before.templateUsages.find(
        (item) => item.templateCode === ACM_CASSETTE_NONE_PRODUCT_CODE,
      ),
    );
  });

  it("keeps LETTERS usage when only ACM cassette material changes", () => {
    const rows = persistedRows();
    const current = row(rows, ACM_3MM_ID);
    expect(current).toBeDefined();
    const next = {
      ...current!,
      amount: 22,
      evidenceRowId: "cev:acm-next",
      classification: "OWNER_CONFIRMED" as const,
      source: "OWNER_CONFIRMED_PURCHASE" as const,
    };
    const afterRows = applyActiveCostEvidenceWrite(rows, next, current!.evidenceRowId);
    const before = projectResourcesAdministration(rows, AS_OF);
    const delta = applyResourcesAdministrationWrite(before, afterRows, next, AS_OF);

    expect(delta.admin).toEqual(projectResourcesAdministration(afterRows, AS_OF));
    expect(delta.stats.templateUsagesRebuilt).toBe(1);
    expect(
      delta.admin.templateUsages.find(
        (item) => item.templateCode === CANONICAL_PRODUCT_CODE,
      ),
    ).toBe(
      before.templateUsages.find(
        (item) => item.templateCode === CANONICAL_PRODUCT_CODE,
      ),
    );
    expect(
      delta.admin.costEvidence.find(
        (item) => item.resourceId === PLEXIGLAS_3MM_OPAL_ID,
      ),
    ).toBe(
      before.costEvidence.find((item) => item.resourceId === PLEXIGLAS_3MM_OPAL_ID),
    );
  });

  it("appends a missing aluminium 30 mm slot without rewriting 60 mm", () => {
    const rows = persistedRows().filter(
      (item) =>
        item.resourceId !== ALUMINIUM_RETURN_PROFILE_ID ||
        item.when?.volumeDepthMm !== 30,
    );
    const created = {
      ...costEvidence.find(
        (item) =>
          item.resourceId === ALUMINIUM_RETURN_PROFILE_ID &&
          item.when?.volumeDepthMm === 30,
      )!,
      amount: 2,
      evidenceRowId: "cev:al-30-new",
      createdAt: "2026-09-04T12:00:00.000Z",
      classification: "OWNER_CONFIRMED" as const,
      source: "OWNER_CONFIRMED_PURCHASE" as const,
    };
    const afterRows = applyActiveCostEvidenceWrite(rows, created);
    const before = projectResourcesAdministration(rows, AS_OF);
    const delta = applyResourcesAdministrationWrite(before, afterRows, created, AS_OF);

    expect(delta.admin).toEqual(projectResourcesAdministration(afterRows, AS_OF));
    expect(delta.stats.costEvidenceRowsRebuilt).toBe(1);
    expect(
      delta.admin.costEvidence.find(
        (item) =>
          item.resourceId === ALUMINIUM_RETURN_PROFILE_ID &&
          item.qualifierIdentity === "volumeDepthMm=60",
      ),
    ).toBe(
      before.costEvidence.find(
        (item) =>
          item.resourceId === ALUMINIUM_RETURN_PROFILE_ID &&
          item.qualifierIdentity === "volumeDepthMm=60",
      ),
    );
    expect(
      afterRows.filter((item) => item.resourceId === ALUMINIUM_RETURN_PROFILE_ID),
    ).toHaveLength(4);
  });
});
