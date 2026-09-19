import { describe, expect, it } from "vitest";
import { ACM_CASSETTE_NONE_PRODUCT_CODE } from "../product/acmCassetteNone.js";
import { CANONICAL_PRODUCT_CODE } from "../product/frontlitPlexiAl06.js";
import { productTemplates } from "../product/productRegistry.js";
import {
  ACM_3MM_ID,
  ALUMINIUM_RETURN_PROFILE_ID,
  FOREX_10MM_ID,
  LAB_SITE_INSTALL_ID,
  PLEXIGLAS_3MM_OPAL_ID,
  RETURN_CANT_FORMING_ID,
  STEEL_FRAME_PROFILE_ID,
  SVC_CNC_FACE_ID,
  SVC_PACK_PRODUCT_ID,
  SVC_SITE_INSTALL_SUBCONTRACT_ID,
  costEvidence,
} from "./catalog.js";
import {
  listProductTemplateResourceUsages,
  usageForProductTemplate,
} from "./productTemplateUsage.js";
import { RCP_CNC_FACE_ID, RCP_CNC_SHEET_PANEL_ID, RCP_PACK_PRODUCT_ID } from "./recipes.js";
import { resourceWhereUsed } from "./whereUsed.js";

describe("product template resource usage", () => {
  const usages = listProductTemplateResourceUsages();

  it("projects every registered template without a frontend product list", () => {
    expect(usages.map((item) => item.templateCode)).toEqual(
      productTemplates.map((item) => item.code),
    );
    expect(usages.every((item) => item.templateLabel.length > 0)).toBe(true);
    expect(usages.every((item) => !item.templateLabel.includes(item.templateCode))).toBe(true);
  });

  it("inverts live type usage instead of a manual resource list", () => {
    for (const resourceId of [
      PLEXIGLAS_3MM_OPAL_ID,
      ALUMINIUM_RETURN_PROFILE_ID,
      FOREX_10MM_ID,
      ACM_3MM_ID,
      STEEL_FRAME_PROFILE_ID,
      RETURN_CANT_FORMING_ID,
    ]) {
      const usedBy = new Set(resourceWhereUsed(resourceId).map((use) => use.productCode));
      for (const usage of usages) {
        expect(usage.resourceIds.includes(resourceId)).toBe(usedBy.has(usage.templateCode));
      }
    }
  });

  it("keeps LETTERS materials and aluminium depth variants on one shared identity", () => {
    const letters = usageForProductTemplate(usages, CANONICAL_PRODUCT_CODE);
    expect(letters?.resourceIds).toEqual(
      expect.arrayContaining([
        PLEXIGLAS_3MM_OPAL_ID,
        ALUMINIUM_RETURN_PROFILE_ID,
        FOREX_10MM_ID,
        RETURN_CANT_FORMING_ID,
        SVC_CNC_FACE_ID,
      ]),
    );
    expect(letters?.recipeIds).toEqual(
      expect.arrayContaining([RCP_CNC_FACE_ID, RCP_PACK_PRODUCT_ID]),
    );
    expect(letters?.resourceIds).not.toContain(ACM_3MM_ID);
    expect(letters?.resourceIds).not.toContain(LAB_SITE_INSTALL_ID);
    expect(letters?.resourceIds).not.toContain(SVC_SITE_INSTALL_SUBCONTRACT_ID);
  });

  it("keeps ACM cassette usage separate from LETTERS-only rows", () => {
    const acm = usageForProductTemplate(usages, ACM_CASSETTE_NONE_PRODUCT_CODE);
    expect(acm?.resourceIds).toEqual(
      expect.arrayContaining([ACM_3MM_ID, STEEL_FRAME_PROFILE_ID]),
    );
    expect(acm?.recipeIds).toContain(RCP_CNC_SHEET_PANEL_ID);
    expect(acm?.resourceIds).not.toContain(PLEXIGLAS_3MM_OPAL_ID);
    expect(acm?.resourceIds).not.toContain(ALUMINIUM_RETURN_PROFILE_ID);
    expect(acm?.recipeIds).not.toContain(RCP_CNC_FACE_ID);
  });

  it("reuses one shared resource identity across templates", () => {
    const letters = usageForProductTemplate(usages, CANONICAL_PRODUCT_CODE);
    const acm = usageForProductTemplate(usages, ACM_CASSETTE_NONE_PRODUCT_CODE);
    expect(letters?.resourceIds).toContain(SVC_PACK_PRODUCT_ID);
    expect(acm?.resourceIds).toContain(SVC_PACK_PRODUCT_ID);
    expect(letters?.recipeIds).toContain(RCP_PACK_PRODUCT_ID);
    expect(acm?.recipeIds).toContain(RCP_PACK_PRODUCT_ID);
  });

  it("counts confirmed tariffs from cost evidence, not React", () => {
    const letters = usageForProductTemplate(usages, CANONICAL_PRODUCT_CODE);
    expect(letters?.resourceCount).toBe(letters?.resourceIds.length);
    expect(letters?.confirmedTariffCount).toBeGreaterThan(0);
    expect(letters?.resourcesWithoutConfirmedTariffCount).toBeGreaterThanOrEqual(0);
  });

  it("treats a resource as confirmed when only one qualifier has evidence", () => {
    const partial = costEvidence.filter(
      (row) =>
        row.resourceId !== ALUMINIUM_RETURN_PROFILE_ID || row.when?.volumeDepthMm === 60,
    );
    const letters = usageForProductTemplate(
      listProductTemplateResourceUsages(partial),
      CANONICAL_PRODUCT_CODE,
    );
    expect(letters?.resourceIds).toContain(ALUMINIUM_RETURN_PROFILE_ID);
    expect(
      partial.filter(
        (row) =>
          row.resourceId === ALUMINIUM_RETURN_PROFILE_ID &&
          row.classification === "OWNER_CONFIRMED",
      ),
    ).toHaveLength(1);
    expect(letters?.resourcesWithoutConfirmedTariffCount).toBe(
      letters!.resourceIds.filter(
        (resourceId) =>
          !partial.some(
            (row) =>
              row.resourceId === resourceId && row.classification === "OWNER_CONFIRMED",
          ),
      ).length,
    );
    expect(letters).not.toHaveProperty("needsSetupCount");
    expect(letters).not.toHaveProperty("eicCompleteness");
    expect(letters).not.toHaveProperty("productConfigured");
    expect(letters).not.toHaveProperty("allVariantsConfigured");
  });
});
