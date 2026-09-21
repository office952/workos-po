import { describe, expect, it } from "vitest";
import { ACM_CASSETTE_NONE_PRODUCT_CODE } from "./acmCassetteNone.js";
import { CANONICAL_PRODUCT_CODE } from "./frontlitPlexiAl06.js";
import { seededDisplayLabelCatalog } from "./displayMetadata.js";
import { productTemplates } from "./productRegistry.js";
import type { CatalogTreeNode } from "./types.js";
import {
  CODE_DEFAULT_ENABLEMENT_GUIDANCE,
  INACTIVE_PRODUCT_ENABLEMENT,
  PLATFORM_DEFAULT_ENABLED_TEMPLATE_CODES_V1,
  PRODUCT_NOT_ENABLED_FOR_NEW_WORK_REASON,
  defaultEnabledTemplateCodes,
  isTemplateEnabledForNewWork,
  knownProductTemplateCodes,
  planProductEnablementSave,
  productEnablementEntries,
  productEnablementSourceLabel,
  projectNewWorkProductCatalog,
  resolveProductEnablement,
} from "./productEnablement.js";

function collectProductCodes(tree: readonly CatalogTreeNode[]): string[] {
  return tree.flatMap((node) => walk(node));
}

function walk(node: CatalogTreeNode): string[] {
  switch (node.kind) {
    case "product":
      return [node.code];
    case "family":
    case "category":
      return node.children.flatMap((child) => walk(child));
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

describe("product enablement", () => {
  it("freezes CODE_DEFAULT to the V1 pair, not the live registry", () => {
    expect([...PLATFORM_DEFAULT_ENABLED_TEMPLATE_CODES_V1]).toEqual([
      CANONICAL_PRODUCT_CODE,
      ACM_CASSETTE_NONE_PRODUCT_CODE,
    ]);
    expect([...defaultEnabledTemplateCodes()]).toEqual([
      CANONICAL_PRODUCT_CODE,
      ACM_CASSETTE_NONE_PRODUCT_CODE,
    ]);
    expect([...defaultEnabledTemplateCodes()]).toEqual([
      ...PLATFORM_DEFAULT_ENABLED_TEMPLATE_CODES_V1,
    ]);
    expect(defaultEnabledTemplateCodes()).not.toContain("PRD-FUTURE-UNCONFIGURED");
    expect(CODE_DEFAULT_ENABLEMENT_GUIDANCE).toContain("Produsele existente");
    expect(CODE_DEFAULT_ENABLEMENT_GUIDANCE).not.toContain("Toate produsele partajate");
  });

  it("defaults the frozen V1 products without organization rows", () => {
    const resolution = resolveProductEnablement([]);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) {
      throw new Error("expected default enablement");
    }
    expect(resolution.source).toBe("CODE_DEFAULT");
    expect(resolution.version).toBeNull();
    expect([...resolution.enabledTemplateCodes]).toEqual([
      CANONICAL_PRODUCT_CODE,
      ACM_CASSETTE_NONE_PRODUCT_CODE,
    ]);
    expect(resolution.guidance).toBe(CODE_DEFAULT_ENABLEMENT_GUIDANCE);
    expect(productEnablementSourceLabel(resolution.source)).toBe("Selecție de sistem");
    expect(isTemplateEnabledForNewWork(CANONICAL_PRODUCT_CODE, resolution)).toBe(true);
    expect(isTemplateEnabledForNewWork(ACM_CASSETTE_NONE_PRODUCT_CODE, resolution)).toBe(
      true,
    );
    expect(isTemplateEnabledForNewWork("PRD-FUTURE-UNCONFIGURED", resolution)).toBe(false);
  });

  it("lists every registered template in Admin independently of the default-enabled set", () => {
    const noneEnabled = productEnablementEntries([]);
    expect(noneEnabled.map((item) => item.templateCode)).toEqual(knownProductTemplateCodes());
    expect(noneEnabled.every((item) => item.enabled === false)).toBe(true);
    const defaults = productEnablementEntries(defaultEnabledTemplateCodes());
    expect(defaults.map((item) => item.templateCode)).toEqual(knownProductTemplateCodes());
    expect(
      defaults.find((item) => item.templateCode === CANONICAL_PRODUCT_CODE)?.enabled,
    ).toBe(true);
    expect(
      defaults.find((item) => item.templateCode === ACM_CASSETTE_NONE_PRODUCT_CODE)
        ?.enabled,
    ).toBe(true);
    const lettersOnly = productEnablementEntries([CANONICAL_PRODUCT_CODE]);
    expect(lettersOnly.map((item) => item.templateCode)).toEqual(
      knownProductTemplateCodes(),
    );
    expect(
      lettersOnly.find((item) => item.templateCode === ACM_CASSETTE_NONE_PRODUCT_CODE)
        ?.enabled,
    ).toBe(false);
  });

  it("hides a disabled template from new-work catalog only", () => {
    const tree = projectNewWorkProductCatalog(seededDisplayLabelCatalog(), [
      CANONICAL_PRODUCT_CODE,
    ]);
    expect(collectProductCodes(tree)).toEqual([CANONICAL_PRODUCT_CODE]);
    expect(productTemplates.map((item) => item.code)).toEqual([
      CANONICAL_PRODUCT_CODE,
      ACM_CASSETTE_NONE_PRODUCT_CODE,
    ]);
  });

  it("persists an organization selection and allows re-enable", () => {
    const first = planProductEnablementSave(
      [],
      [
        { templateCode: CANONICAL_PRODUCT_CODE, enabled: true },
        { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, enabled: false },
      ],
      { now: "2026-09-21T00:00:00.000Z", actorUserId: "owner-1", rowId: "pev:1" },
    );
    expect(first.ok).toBe(true);
    if (!first.ok || !first.next) {
      throw new Error("expected first save");
    }
    const afterDisable = resolveProductEnablement([first.next]);
    expect(afterDisable.ok).toBe(true);
    if (!afterDisable.ok) {
      throw new Error("expected organization enablement");
    }
    expect(afterDisable.source).toBe("ORGANIZATION");
    expect(isTemplateEnabledForNewWork(ACM_CASSETTE_NONE_PRODUCT_CODE, afterDisable)).toBe(
      false,
    );
    const second = planProductEnablementSave(
      [first.next],
      [
        { templateCode: CANONICAL_PRODUCT_CODE, enabled: true },
        { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, enabled: true },
      ],
      { now: "2026-09-21T01:00:00.000Z", actorUserId: "owner-1", rowId: "pev:2" },
    );
    expect(second.ok).toBe(true);
    if (!second.ok || !second.next) {
      throw new Error("expected re-enable");
    }
    expect(second.retire).toEqual({ version: 1 });
    const afterEnable = resolveProductEnablement([
      { ...first.next, status: "RETIRED" },
      second.next,
    ]);
    expect(afterEnable.ok).toBe(true);
    if (!afterEnable.ok) {
      throw new Error("expected re-enabled resolution");
    }
    expect(isTemplateEnabledForNewWork(ACM_CASSETTE_NONE_PRODUCT_CODE, afterEnable)).toBe(
      true,
    );
  });

  it("rejects unknown templates and incomplete selections", () => {
    const unknown = planProductEnablementSave(
      [],
      [
        { templateCode: CANONICAL_PRODUCT_CODE, enabled: true },
        { templateCode: "PRD-NOT-A-SHARED-SKU", enabled: true },
      ],
      { now: "2026-09-21T00:00:00.000Z", actorUserId: null, rowId: "pev:x" },
    );
    expect(unknown.ok).toBe(false);
    const incomplete = planProductEnablementSave(
      [],
      [{ templateCode: CANONICAL_PRODUCT_CODE, enabled: false }],
      { now: "2026-09-21T00:00:00.000Z", actorUserId: null, rowId: "pev:y" },
    );
    expect(incomplete.ok).toBe(false);
  });

  it("fails closed when organization history has no single active version", () => {
    const resolution = resolveProductEnablement([
      {
        enablementVersionRowId: "pev:1",
        version: 1,
        status: "RETIRED",
        source: "ORGANIZATION",
        enabledTemplateCodes: defaultEnabledTemplateCodes(),
        createdAt: "2026-09-21T00:00:00.000Z",
        effectiveFrom: "2026-09-21T00:00:00.000Z",
        actorUserId: null,
        supersedesVersion: null,
      },
    ]);
    expect(resolution).toMatchObject({
      ok: false,
      error: INACTIVE_PRODUCT_ENABLEMENT,
    });
  });

  it("keeps the operator-facing new-work refusal reason", () => {
    expect(PRODUCT_NOT_ENABLED_FOR_NEW_WORK_REASON).toContain("lucrări noi");
    expect(PRODUCT_NOT_ENABLED_FOR_NEW_WORK_REASON).toContain("rămân deschise");
  });
});
