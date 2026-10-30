import { describe, expect, it } from "vitest";
import { ACM_CASSETTE_NONE_PRODUCT_CODE } from "./acmCassetteNone.js";
import { CANONICAL_PRODUCT_CODE } from "./frontlitPlexiAl06.js";
import { LOGO_PRODUCT_CODE } from "./logoFrontlitPlexiAl06.js";
import {
  acceptedSnapshotAfterPresetChange,
  mergePresetSelectionsIntoDraft,
  planOrganizationPresetRevision,
  presetEligibleFields,
  projectOrganizationPresetContract,
  type OrganizationPresetRevision,
} from "./organizationPreset.js";

const painted80 = [
  { fieldId: "volume.depthMm", value: "80" },
  { fieldId: "volume.finish", value: "painted" },
];

function plan(overrides: Partial<Parameters<typeof planOrganizationPresetRevision>[0]> = {}) {
  return planOrganizationPresetRevision({
    actorRole: "owner",
    organizationId: "org-a",
    presetId: "letters-80-painted",
    expectedRevision: null,
    existing: null,
    name: "Litere volumetrice — cant aluminiu 80 mm, finisaj vopsit",
    description: "Opțiuni reutilizabile. Măsurătorile rămân pe lucrare.",
    templateCode: CANONICAL_PRODUCT_CODE,
    selections: painted80,
    lifecycle: "PUBLISHED",
    ...overrides,
  });
}

describe("organization presets", () => {
  it("offers only closed, always-visible choices and blocks an unprepared groove", () => {
    const letters = presetEligibleFields(CANONICAL_PRODUCT_CODE).map((field) => field.fieldId);
    expect(letters).toEqual(["face.finish", "volume.depthMm", "volume.finish", "back.profile"]);
    expect(letters).not.toContain("root.inscription");
    expect(letters).not.toContain("face.confirmedAreaMm2");
    expect(letters).not.toContain("volume.color");
    expect(letters).not.toContain("back.supportKind");
    const groove = presetEligibleFields(CANONICAL_PRODUCT_CODE)
      .find((field) => field.fieldId === "back.profile")
      ?.options.find((option) => option.value === "GROOVED");
    expect(groove?.support).toBe("NOT_PREPARED");
    expect(presetEligibleFields(LOGO_PRODUCT_CODE).map((field) => field.fieldId)).toEqual([
      "face.finish",
      "volume.depthMm",
      "volume.finish",
    ]);
    expect(presetEligibleFields(ACM_CASSETTE_NONE_PRODUCT_CODE)).toEqual([]);
    const contract = projectOrganizationPresetContract(CANONICAL_PRODUCT_CODE);
    expect(contract).toMatchObject({
      persistence: "ORGANIZATION_VERSIONED",
      canonicalWriter: { method: "POST", path: "/api/catalog/presets", permission: "owner" },
    });
  });

  it("plans a published revision without touching an accepted snapshot", () => {
    const snapshot = { reviewId: "accepted-1", values: { "volume.depthMm": "30" } };
    const result = plan();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.revision.revision).toBe(1);
    expect(result.revision.templateVersion).toBe("1");
    expect(result.revision.selections).toEqual(painted80);
    expect(acceptedSnapshotAfterPresetChange(snapshot)).toBe(snapshot);
  });

  it("rejects job facts, fixed platform values, unknown options and the missing groove recipe", () => {
    for (const selections of [
      [{ fieldId: "root.inscription", value: "ACME" }],
      [{ fieldId: "face.confirmedAreaMm2", value: "1000" }],
      [{ fieldId: "face.thicknessMm", value: "5" }],
      [{ fieldId: "volume.depthMm", value: "70" }],
      [{ fieldId: "back.profile", value: "GROOVED" }],
    ]) {
      const result = plan({ selections, lifecycle: "DRAFT" });
      expect(result.ok).toBe(false);
    }
    const unknown = plan({ templateCode: "PRD-HALO" });
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.issues.some((item) => item.code === "unknown_template")).toBe(true);
  });

  it("keeps organizations, roles and revisions apart", () => {
    const created = plan();
    if (!created.ok) throw new Error("expected plan");
    const member = plan({ existing: created.revision, expectedRevision: 1, actorRole: "member" });
    expect(member.ok).toBe(false);
    if (member.ok) return;
    expect(member.issues[0]?.code).toBe("member_cannot_change");
    const otherOrg = plan({
      existing: created.revision,
      expectedRevision: 1,
      organizationId: "org-b",
    });
    expect(otherOrg.ok).toBe(false);
    if (otherOrg.ok) return;
    expect(otherOrg.issues.some((item) => item.code === "organization_mismatch")).toBe(true);
    const stale = plan({ existing: created.revision, expectedRevision: 0, selections: painted80 });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.issues.some((item) => item.code === "revision_conflict")).toBe(true);
    const next = plan({
      existing: created.revision,
      expectedRevision: 1,
      selections: [{ fieldId: "volume.depthMm", value: "100" }, { fieldId: "volume.finish", value: "painted" }],
    });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.revision.revision).toBe(2);
    expect(created.revision.revision).toBe(1);
    expect(created.revision.selections[0]?.value).toBe("80");
  });

  it("refuses a superseded template and retires without rewriting the previous revision", () => {
    const created = plan();
    if (!created.ok) throw new Error("expected plan");
    const superseded: OrganizationPresetRevision = { ...created.revision, templateVersion: "0" };
    const republish = plan({ existing: superseded, expectedRevision: 1 });
    expect(republish.ok).toBe(false);
    if (republish.ok) return;
    expect(republish.issues.some((item) => item.code === "template_version_mismatch")).toBe(true);
    expect(superseded.templateVersion).toBe("0");
    const retired = plan({
      existing: created.revision,
      expectedRevision: 1,
      lifecycle: "RETIRED",
    });
    expect(retired.ok).toBe(true);
    if (!retired.ok) return;
    expect(retired.revision.lifecycle).toBe("RETIRED");
    expect(retired.revision.selections).toEqual(created.revision.selections);
    expect(created.revision.lifecycle).toBe("PUBLISHED");
    const reopen = plan({ existing: retired.revision, expectedRevision: 2, lifecycle: "PUBLISHED" });
    expect(reopen.ok).toBe(false);
  });

  it("copies preset choices onto a request draft and leaves job facts in place", () => {
    const drafts = {
      "root.inscription": "ACME",
      "face.confirmedAreaMm2": "1000",
      "volume.depthMm": "30",
    };
    const next: Record<string, string> = mergePresetSelectionsIntoDraft(drafts, painted80);
    expect(next["root.inscription"]).toBe("ACME");
    expect(next["face.confirmedAreaMm2"]).toBe("1000");
    expect(next["volume.depthMm"]).toBe("80");
    expect(next["volume.finish"]).toBe("painted");
    expect(drafts["volume.depthMm"]).toBe("30");
  });
});
