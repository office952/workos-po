import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  ACM_CASSETTE_NONE_READY_VALUES,
  APPLY_SURFACE_FINISH_ID,
  CANONICAL_PRODUCT_CODE,
  PRODUCTION_CAPABILITY_CLASS_IDS,
  composeProductProcessTopology,
  getOperationalProcess,
  getProductTemplate,
  lettersCapabilityCoverage,
  lettersProcessCompositionInspections,
  processProviderRequirement,
  type ProductionCapabilityClassId,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { applyOperationalBootstrap } from "../src/cloud/bootstrapPolicy.js";
import { ensureOperationalPlane } from "../src/cloud/provision.js";
import { openSqliteDatabase, type SqliteDatabase } from "../src/persistence/sqlite.js";
import {
  METAL_CUTTING_OPERATOR_SKILL_CODE,
  METAL_CUTTING_OPERATOR_SKILL_ID,
  OPERATIONAL_FOUNDATION_CAPABILITY_SKILLS,
  OPERATIONAL_FOUNDATION_SKILLS,
  OPERATIONAL_SKILL_FOUNDATION_MARKER,
  PAINTING_SKILL_CODE,
  PAINTING_SKILL_ID,
  VINYL_APPLICATOR_NEW_ORG_LABEL,
  VINYL_APPLICATOR_SKILL_CODE,
  VINYL_APPLICATOR_SKILL_ID,
} from "../src/people/operationalSkillFoundation.js";
import {
  applyOperationalSkillFoundation,
  isOperationalSkillFoundationApplied,
  isTrustedWorkforceApplied,
  listCapabilitySkillRequirements,
  listPersonSkillAssignments,
  listPeople,
  OperationalSkillFoundationReconcileError,
  PEOPLE_TRUSTED_WORKFORCE_MARKER,
} from "../src/people/store.js";
import { TRUSTED_CAPABILITY_SKILLS, TRUSTED_PEOPLE, TRUSTED_SKILLS } from "../src/people/trustedWorkforce.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  OWNER_PASSWORD,
} from "./cloud-harness.js";

const temps: string[] = [];

afterEach(() => {
  cleanupCloudTemps();
  for (const dir of temps.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows may briefly keep a handle on a closed SQLite file.
    }
  }
});

function tempSqlitePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "workos-people-coverage-"));
  temps.push(dir);
  return join(dir, "product-system.sqlite");
}

function skillCodes(runtime: ReturnType<typeof createProductSystemRuntime>): string[] {
  return runtime.listSkills().map((item) => item.code).sort();
}

function mappingPairs(db: SqliteDatabase): Array<{ capabilityId: string; skillCode: string }> {
  const rows = db
    .prepare(
      `
      SELECT r.capability_id AS capability_id, s.code AS skill_code
      FROM capability_skill_requirements r
      JOIN skills s ON s.skill_id = r.skill_id
      ORDER BY r.capability_id, s.code
    `,
    )
    .all() as Array<{ capability_id: string; skill_code: string }>;
  return rows.map((row) => ({ capabilityId: row.capability_id, skillCode: row.skill_code }));
}

function insertSkillRow(
  db: SqliteDatabase,
  input: {
    skillId: string;
    code: string;
    displayLabel: string;
    status?: "ACTIVE" | "RETIRED";
    createdAt?: string;
  },
): void {
  const createdAt = input.createdAt ?? "2026-01-01T00:00:00.000Z";
  db.prepare(
    `
    INSERT INTO skills
      (skill_id, code, display_label, description, status, created_at, updated_at, retired_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?, ?)
  `,
  ).run(
    input.skillId,
    input.code,
    input.displayLabel,
    input.status ?? "ACTIVE",
    createdAt,
    createdAt,
    input.status === "RETIRED" ? createdAt : null,
  );
}

function seedHistoricalV1Foundation(db: SqliteDatabase): void {
  const createdAt = "2026-01-01T00:00:00.000Z";
  insertSkillRow(db, {
    skillId: "skl:operational:cnc-operator",
    code: "SK_CNC_OPERATOR",
    displayLabel: "CNC",
    createdAt,
  });
  insertSkillRow(db, {
    skillId: "skl:operational:letter-cant",
    code: "SK_LETTER_CANT_OPERATOR",
    displayLabel: "Operator CNC cant litere",
    createdAt,
  });
  insertSkillRow(db, {
    skillId: "skl:operational:letter-modeling",
    code: "SK_LETTER_MODELING",
    displayLabel: "Modelare cant litere",
    createdAt,
  });
  insertSkillRow(db, {
    skillId: "skl:operational:assembly",
    code: "SK_ASSEMBLY",
    displayLabel: "Ansamblare",
    createdAt,
  });
  insertSkillRow(db, {
    skillId: "skl:operational:electrician",
    code: "SK_ELECTRICIAN",
    displayLabel: "Electrician",
    createdAt,
  });
  const mappings: Array<[string, string]> = [
    ["CNC_ROUTING", "skl:operational:cnc-operator"],
    ["PROFILE_FORMING", "skl:operational:letter-cant"],
    ["PROFILE_FORMING", "skl:operational:letter-modeling"],
    ["MANUAL_ASSEMBLY", "skl:operational:assembly"],
    ["ELECTRICAL_ASSEMBLY", "skl:operational:electrician"],
    ["QUALITY_CONTROL", "skl:operational:assembly"],
    ["PACKAGING", "skl:operational:assembly"],
    ["PAINTING", "skl:operational:assembly"],
  ];
  for (const [capabilityId, skillId] of mappings) {
    db.prepare(
      "INSERT INTO capability_skill_requirements (capability_id, skill_id) VALUES (?, ?)",
    ).run(capabilityId, skillId);
  }
  db.prepare(
    "INSERT INTO runtime_bootstrap_markers (marker_id, applied_at) VALUES (?, ?)",
  ).run(OPERATIONAL_SKILL_FOUNDATION_MARKER, createdAt);
}

function diagnosisOf(
  runtime: ReturnType<typeof createProductSystemRuntime>,
  capabilityId: ProductionCapabilityClassId,
  personId: string,
) {
  return runtime.readEligibility(capabilityId).diagnoses.find((item) => item.personId === personId);
}

type ExecutionFingerprint = {
  plans: unknown;
  tasks: unknown;
  dependencies: unknown;
  snapshots: unknown;
  people: unknown;
  assignments: unknown;
};

function executionFingerprint(db: SqliteDatabase): ExecutionFingerprint {
  return {
    plans: db
      .prepare(
        `
        SELECT plan_id, source_snapshot_id, source_snapshot_hash, product_code, status,
               schema_version, task_count, eic_total, eic_currency, eic_completeness
        FROM execution_plans
        ORDER BY plan_id
      `,
      )
      .all(),
    tasks: db
      .prepare(
        `
        SELECT task_id, plan_id, source_operation_id, process_id, process_label, scope,
               status, required_capability_id
        FROM execution_tasks
        ORDER BY task_id
      `,
      )
      .all(),
    dependencies: db
      .prepare(
        `
        SELECT plan_id, task_id, depends_on_task_id
        FROM execution_task_dependencies
        ORDER BY task_id, depends_on_task_id
      `,
      )
      .all(),
    snapshots: db
      .prepare(
        `
        SELECT snapshot_id, content_hash
        FROM accepted_production_snapshots
        ORDER BY snapshot_id
      `,
      )
      .all(),
    people: db
      .prepare(
        `
        SELECT person_id, display_name, status, availability, role_label, provenance
        FROM people
        ORDER BY person_id
      `,
      )
      .all(),
    assignments: db
      .prepare(
        `
        SELECT assignment_id, person_id, skill_id, status, assigned_at, retired_at
        FROM person_skill_assignments
        ORDER BY assignment_id
      `,
      )
      .all(),
  };
}

const lettersReadyValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

async function createLettersExecutionPlan(app: ReturnType<typeof createApp>) {
  const compiled = (await (
    await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: lettersReadyValues }),
    })
  ).json()) as { reviewId: string };
  const accepted = (await (
    await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        values: lettersReadyValues,
        reviewId: compiled.reviewId,
      }),
    })
  ).json()) as { snapshot: { snapshotId: string } };
  const created = (await (
    await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${accepted.snapshot.snapshotId}/execution-plan`,
      { method: "POST" },
    )
  ).json()) as { executionPlan: { plan: { planId: string }; tasks: unknown[] } };
  return created.executionPlan;
}

function currentSupportedProductCapabilities(): ProductionCapabilityClassId[] {
  const letters = lettersCapabilityCoverage().requiredCapabilityIds;
  const acmTemplate = getProductTemplate(ACM_CASSETTE_NONE_PRODUCT_CODE);
  const acmCaps = acmTemplate
    ? composeProductProcessTopology(acmTemplate, ACM_CASSETTE_NONE_READY_VALUES).nodes.flatMap(
        (node) => {
          const capabilityId = getOperationalProcess(node.processId)?.requiredCapabilityId;
          return capabilityId ? [capabilityId] : [];
        },
      )
    : [];
  return PRODUCTION_CAPABILITY_CLASS_IDS.filter(
    (capabilityId) => letters.includes(capabilityId) || acmCaps.includes(capabilityId),
  );
}

describe("people eligibility capability coverage closure", () => {
  it("keeps a single vinyl identity and the locked capability mappings in seed arrays", () => {
    expect(
      OPERATIONAL_FOUNDATION_SKILLS.filter((item) => item.code === VINYL_APPLICATOR_SKILL_CODE),
    ).toEqual([
      {
        skillId: VINYL_APPLICATOR_SKILL_ID,
        code: VINYL_APPLICATOR_SKILL_CODE,
        displayLabel: VINYL_APPLICATOR_NEW_ORG_LABEL,
        description: null,
      },
    ]);
    expect(TRUSTED_SKILLS.filter((item) => item.code === VINYL_APPLICATOR_SKILL_CODE)).toHaveLength(1);
    expect(TRUSTED_SKILLS.filter((item) => item.skillId === VINYL_APPLICATOR_SKILL_ID)).toHaveLength(1);
    expect(new Set(TRUSTED_SKILLS.map((item) => item.code)).size).toBe(TRUSTED_SKILLS.length);
    expect(
      TRUSTED_CAPABILITY_SKILLS.filter((item) => item.capabilityId === "VINYL_APPLICATION"),
    ).toEqual([{ capabilityId: "VINYL_APPLICATION", skillCode: VINYL_APPLICATOR_SKILL_CODE }]);
    expect(TRUSTED_CAPABILITY_SKILLS.filter((item) => item.capabilityId === "PAINTING")).toEqual([
      { capabilityId: "PAINTING", skillCode: PAINTING_SKILL_CODE },
    ]);
    expect(TRUSTED_CAPABILITY_SKILLS.filter((item) => item.capabilityId === "METAL_CUTTING")).toEqual([
      { capabilityId: "METAL_CUTTING", skillCode: METAL_CUTTING_OPERATOR_SKILL_CODE },
    ]);
    expect(
      TRUSTED_PEOPLE.some((person) =>
        person.skillCodes.includes(PAINTING_SKILL_CODE) ||
        person.skillCodes.includes(METAL_CUTTING_OPERATOR_SKILL_CODE),
      ),
    ).toBe(false);
    expect(processProviderRequirement(getOperationalProcess(APPLY_SURFACE_FINISH_ID))).toBe(
      "REQUIRED",
    );
    expect(processProviderRequirement(getOperationalProcess("PAINT_RAL"))).toBe("REQUIRED");
    expect(processProviderRequirement(getOperationalProcess("CUT_METAL_STOCK"))).toBe("REQUIRED");
  });

  it("materializes the shared foundation for NEW_ORGANIZATION without inventing People", () => {
    const runtime = createProductSystemRuntime(tempSqlitePath(), {
      bootstrapPolicy: "NEW_ORGANIZATION",
    });
    try {
      expect(runtime.listPeople()).toEqual([]);
      expect(skillCodes(runtime)).toEqual(
        [...OPERATIONAL_FOUNDATION_SKILLS.map((item) => item.code)].sort(),
      );
      const vinyl = runtime.listSkills().find((item) => item.code === VINYL_APPLICATOR_SKILL_CODE);
      expect(vinyl?.skillId).toBe(VINYL_APPLICATOR_SKILL_ID);
      expect(vinyl?.displayLabel).toBe(VINYL_APPLICATOR_NEW_ORG_LABEL);
      const db = openSqliteDatabase(runtime.sqlitePath);
      expect(mappingPairs(db)).toEqual(
        [...OPERATIONAL_FOUNDATION_CAPABILITY_SKILLS].sort((left, right) =>
          left.capabilityId === right.capabilityId
            ? left.skillCode.localeCompare(right.skillCode)
            : left.capabilityId.localeCompare(right.capabilityId),
        ),
      );
      expect(
        mappingPairs(db).some(
          (item) => item.capabilityId === "PAINTING" && item.skillCode === "SK_ASSEMBLY",
        ),
      ).toBe(false);
      expect(isOperationalSkillFoundationApplied(db)).toBe(true);
      expect(isTrustedWorkforceApplied(db)).toBe(false);
      db.close();

      const created = runtime.createPerson("Ana Noua");
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }
      const vinylDiagnosis = diagnosisOf(runtime, "VINYL_APPLICATION", created.person.personId);
      expect(vinylDiagnosis?.eligible).toBe(false);
      expect(vinylDiagnosis?.reason).toBe("MISSING_SKILL");
      expect(diagnosisOf(runtime, "PAINTING", created.person.personId)?.reason).toBe("MISSING_SKILL");
      expect(diagnosisOf(runtime, "METAL_CUTTING", created.person.personId)?.reason).toBe(
        "MISSING_SKILL",
      );
    } finally {
      runtime.close();
    }
  });

  it("uses the same shared foundation for SYNTHETIC_TEST", () => {
    const runtime = createProductSystemRuntime(tempSqlitePath(), {
      bootstrapPolicy: "SYNTHETIC_TEST",
    });
    try {
      expect(runtime.listPeople()).toEqual([]);
      expect(skillCodes(runtime)).toContain(VINYL_APPLICATOR_SKILL_CODE);
      expect(skillCodes(runtime)).toContain(PAINTING_SKILL_CODE);
      expect(skillCodes(runtime)).toContain(METAL_CUTTING_OPERATOR_SKILL_CODE);
    } finally {
      runtime.close();
    }
  });

  it("reconciles missing closure skills when the historical V1 marker already exists", () => {
    const runtime = createProductSystemRuntime(tempSqlitePath());
    try {
      const db = openSqliteDatabase(runtime.sqlitePath);
      seedHistoricalV1Foundation(db);
      const created = runtime.createPerson("Ana Existenta");
      expect(created.ok).toBe(true);
      if (!created.ok) {
        db.close();
        return;
      }
      const cnc = runtime.listSkills().find((item) => item.code === "SK_CNC_OPERATOR");
      expect(cnc).toBeTruthy();
      if (!cnc) {
        db.close();
        return;
      }
      expect(runtime.assignPersonSkill(created.person.personId, cnc.skillId).ok).toBe(true);
      const custom = runtime.createSkill({
        code: "SK_CUSTOM_SHOP",
        displayLabel: "Calificare client",
      });
      expect(custom.ok).toBe(true);
      const peopleBefore = listPeople(db);
      const assignmentsBefore = listPersonSkillAssignments(db);
      const customBefore = runtime.listSkills().find((item) => item.code === "SK_CUSTOM_SHOP");
      expect(isOperationalSkillFoundationApplied(db)).toBe(true);
      expect(runtime.listSkills().some((item) => item.code === PAINTING_SKILL_CODE)).toBe(false);

      applyOperationalSkillFoundation(db);
      applyOperationalSkillFoundation(db);

      expect(isOperationalSkillFoundationApplied(db)).toBe(true);
      expect(
        (
          db
            .prepare("SELECT COUNT(*) AS count FROM runtime_bootstrap_markers WHERE marker_id = ?")
            .get(OPERATIONAL_SKILL_FOUNDATION_MARKER) as { count: number }
        ).count,
      ).toBe(1);
      expect(listPeople(db)).toEqual(peopleBefore);
      expect(listPersonSkillAssignments(db)).toEqual(assignmentsBefore);
      expect(runtime.listSkills().find((item) => item.code === "SK_CUSTOM_SHOP")).toEqual(
        customBefore,
      );
      expect(
        runtime.listSkills().filter((item) => item.code === VINYL_APPLICATOR_SKILL_CODE),
      ).toHaveLength(1);
      expect(runtime.listSkills().filter((item) => item.code === PAINTING_SKILL_CODE)).toHaveLength(1);
      expect(
        runtime.listSkills().filter((item) => item.code === METAL_CUTTING_OPERATOR_SKILL_CODE),
      ).toHaveLength(1);
      const pairs = mappingPairs(db);
      expect(pairs.filter((item) => item.capabilityId === "PAINTING")).toEqual([
        { capabilityId: "PAINTING", skillCode: PAINTING_SKILL_CODE },
      ]);
      expect(pairs.filter((item) => item.capabilityId === "MANUAL_ASSEMBLY")).toEqual([
        { capabilityId: "MANUAL_ASSEMBLY", skillCode: "SK_ASSEMBLY" },
      ]);
      expect(pairs.filter((item) => item.capabilityId === "VINYL_APPLICATION")).toHaveLength(1);
      expect(pairs.filter((item) => item.capabilityId === "METAL_CUTTING")).toHaveLength(1);
      expect(listCapabilitySkillRequirements(db).filter((item) => item.capabilityId === "PAINTING")).toHaveLength(
        1,
      );
      db.close();
    } finally {
      runtime.close();
    }
  });

  it("reuses an existing stable skill code and does not overwrite its label", () => {
    const runtime = createProductSystemRuntime(tempSqlitePath());
    try {
      const db = openSqliteDatabase(runtime.sqlitePath);
      insertSkillRow(db, {
        skillId: "skl:org:paint-legacy",
        code: PAINTING_SKILL_CODE,
        displayLabel: "Vopsitor vechi",
      });
      applyOperationalSkillFoundation(db);
      const painting = runtime.listSkills().filter((item) => item.code === PAINTING_SKILL_CODE);
      expect(painting).toHaveLength(1);
      expect(painting[0]?.skillId).toBe("skl:org:paint-legacy");
      expect(painting[0]?.displayLabel).toBe("Vopsitor vechi");
      expect(runtime.listSkills().some((item) => item.skillId === PAINTING_SKILL_ID)).toBe(false);
      expect(
        listCapabilitySkillRequirements(db).some(
          (item) => item.capabilityId === "PAINTING" && item.skillId === "skl:org:paint-legacy",
        ),
      ).toBe(true);
      db.close();
    } finally {
      runtime.close();
    }
  });

  it("does not rewrite an existing Colantator vinyl row", () => {
    const runtime = createProductSystemRuntime(tempSqlitePath());
    try {
      const db = openSqliteDatabase(runtime.sqlitePath);
      insertSkillRow(db, {
        skillId: VINYL_APPLICATOR_SKILL_ID,
        code: VINYL_APPLICATOR_SKILL_CODE,
        displayLabel: "Colantator",
      });
      const created = runtime.createPerson("Vali Pastrat");
      expect(created.ok).toBe(true);
      if (!created.ok) {
        db.close();
        return;
      }
      expect(runtime.assignPersonSkill(created.person.personId, VINYL_APPLICATOR_SKILL_ID).ok).toBe(
        true,
      );
      applyOperationalSkillFoundation(db);
      const vinyl = runtime.listSkills().filter((item) => item.code === VINYL_APPLICATOR_SKILL_CODE);
      expect(vinyl).toHaveLength(1);
      expect(vinyl[0]?.skillId).toBe(VINYL_APPLICATOR_SKILL_ID);
      expect(vinyl[0]?.displayLabel).toBe("Colantator");
      expect(
        listPersonSkillAssignments(db).filter(
          (item) =>
            item.personId === created.person.personId && item.skillId === VINYL_APPLICATOR_SKILL_ID,
        ),
      ).toHaveLength(1);
      db.close();
    } finally {
      runtime.close();
    }
  });

  it("does not reactivate a retired shared skill during reconciliation", () => {
    const runtime = createProductSystemRuntime(tempSqlitePath());
    try {
      const db = openSqliteDatabase(runtime.sqlitePath);
      insertSkillRow(db, {
        skillId: METAL_CUTTING_OPERATOR_SKILL_ID,
        code: METAL_CUTTING_OPERATOR_SKILL_CODE,
        displayLabel: "Operator debitare metale",
        status: "RETIRED",
      });
      applyOperationalSkillFoundation(db);
      const metal = runtime.listSkills().find((item) => item.code === METAL_CUTTING_OPERATOR_SKILL_CODE);
      expect(metal?.status).toBe("RETIRED");
      expect(metal?.skillId).toBe(METAL_CUTTING_OPERATOR_SKILL_ID);
      db.close();
    } finally {
      runtime.close();
    }
  });

  it("fails closed on an ambiguous stable-code collision", () => {
    const runtime = createProductSystemRuntime(tempSqlitePath());
    try {
      const db = openSqliteDatabase(runtime.sqlitePath);
      insertSkillRow(db, {
        skillId: PAINTING_SKILL_ID,
        code: "SK_OTHER_PAINT",
        displayLabel: "Altă vopsire",
      });
      insertSkillRow(db, {
        skillId: "skl:org:paint-other",
        code: PAINTING_SKILL_CODE,
        displayLabel: "Vopsire existentă",
      });
      expect(() => applyOperationalSkillFoundation(db)).toThrow(
        OperationalSkillFoundationReconcileError,
      );
      db.close();
    } finally {
      runtime.close();
    }
  });

  it("reconciles ADOPT_EXISTING shared foundation without trusted workforce or invented assignments", () => {
    const path = tempSqlitePath();
    const first = createProductSystemRuntime(path);
    const created = first.createPerson("Ada Adopt");
    expect(created.ok).toBe(true);
    if (!created.ok) {
      first.close();
      return;
    }
    first.close();

    const adopted = createProductSystemRuntime(path, { bootstrapPolicy: "ADOPT_EXISTING" });
    try {
      expect(adopted.listPeople().map((item) => item.displayName)).toEqual(["Ada Adopt"]);
      expect(adopted.listPeople().some((item) => item.displayName === "Florin CNC")).toBe(false);
      expect(skillCodes(adopted)).toEqual(
        [...OPERATIONAL_FOUNDATION_SKILLS.map((item) => item.code)].sort(),
      );
      const db = openSqliteDatabase(adopted.sqlitePath);
      expect(listPersonSkillAssignments(db)).toEqual([]);
      expect(isTrustedWorkforceApplied(db)).toBe(false);
      expect(
        (
          db
            .prepare("SELECT COUNT(*) AS count FROM runtime_bootstrap_markers WHERE marker_id = ?")
            .get(PEOPLE_TRUSTED_WORKFORCE_MARKER) as { count: number }
        ).count,
      ).toBe(0);
      expect(isOperationalSkillFoundationApplied(db)).toBe(true);
      applyOperationalBootstrap(db, "ADOPT_EXISTING");
      expect(listPeople(db).map((item) => item.displayName)).toEqual(["Ada Adopt"]);
      expect(listPersonSkillAssignments(db)).toEqual([]);
      db.close();
    } finally {
      adopted.close();
    }
  });

  it("preserves trusted vinyl assignments and does not invent painting or metal-cutting qualifications", () => {
    const runtime = createProductSystemRuntime(tempSqlitePath());
    try {
      runtime.materializeTrustedWorkforce();
      const vinyl = runtime.listSkills().filter((item) => item.code === VINYL_APPLICATOR_SKILL_CODE);
      expect(vinyl).toHaveLength(1);
      expect(vinyl[0]?.skillId).toBe(VINYL_APPLICATOR_SKILL_ID);
      const vali = runtime.listPeople().find((item) => item.displayName === "Vali Colantator");
      const florin = runtime.listPeople().find((item) => item.displayName === "Florin CNC");
      expect(vali && florin && vinyl[0]).toBeTruthy();
      if (!vali || !florin || !vinyl[0]) {
        return;
      }
      expect(diagnosisOf(runtime, "VINYL_APPLICATION", vali.personId)?.eligible).toBe(true);
      expect(runtime.retirePersonSkill(vali.personId, vinyl[0].skillId).ok).toBe(true);
      expect(diagnosisOf(runtime, "VINYL_APPLICATION", vali.personId)?.eligible).toBe(false);
      expect(diagnosisOf(runtime, "VINYL_APPLICATION", vali.personId)?.reason).toBe("RETIRED_SKILL");

      const assembler = runtime.createPerson("Ansamblor doar");
      expect(assembler.ok).toBe(true);
      if (!assembler.ok) {
        return;
      }
      const assembly = runtime.listSkills().find((item) => item.code === "SK_ASSEMBLY");
      expect(assembly).toBeTruthy();
      if (!assembly) {
        return;
      }
      expect(runtime.assignPersonSkill(assembler.person.personId, assembly.skillId).ok).toBe(true);
      expect(diagnosisOf(runtime, "PAINTING", assembler.person.personId)?.eligible).toBe(false);
      expect(diagnosisOf(runtime, "PAINTING", assembler.person.personId)?.reason).toBe("MISSING_SKILL");
      expect(diagnosisOf(runtime, "METAL_CUTTING", florin.personId)?.eligible).toBe(false);
      expect(diagnosisOf(runtime, "METAL_CUTTING", florin.personId)?.reason).toBe("MISSING_SKILL");

      const registry = runtime.listPeopleRegistry();
      expect(
        registry.people.every(
          (person) =>
            !person.skills.some(
              (skill) =>
                skill.code === PAINTING_SKILL_CODE ||
                skill.code === METAL_CUTTING_OPERATOR_SKILL_CODE,
            ),
        ),
      ).toBe(true);

      const db = openSqliteDatabase(runtime.sqlitePath);
      expect(
        mappingPairs(db).some(
          (item) => item.capabilityId === "PAINTING" && item.skillCode === "SK_ASSEMBLY",
        ),
      ).toBe(false);
      db.close();
    } finally {
      runtime.close();
    }
  });

  it("applies the locked vinyl, painting, and metal-cutting eligibility contract", () => {
    const runtime = createProductSystemRuntime(tempSqlitePath(), {
      bootstrapPolicy: "NEW_ORGANIZATION",
    });
    try {
      const person = runtime.createPerson("Operator Contract");
      expect(person.ok).toBe(true);
      if (!person.ok) {
        return;
      }
      const vinyl = runtime.listSkills().find((item) => item.code === VINYL_APPLICATOR_SKILL_CODE);
      const painting = runtime.listSkills().find((item) => item.code === PAINTING_SKILL_CODE);
      const metal = runtime
        .listSkills()
        .find((item) => item.code === METAL_CUTTING_OPERATOR_SKILL_CODE);
      const assembly = runtime.listSkills().find((item) => item.code === "SK_ASSEMBLY");
      const cnc = runtime.listSkills().find((item) => item.code === "SK_CNC_OPERATOR");
      expect(vinyl && painting && metal && assembly && cnc).toBeTruthy();
      if (!vinyl || !painting || !metal || !assembly || !cnc) {
        return;
      }

      expect(diagnosisOf(runtime, "VINYL_APPLICATION", person.person.personId)?.reason).toBe(
        "MISSING_SKILL",
      );
      expect(runtime.assignPersonSkill(person.person.personId, vinyl.skillId).ok).toBe(true);
      expect(diagnosisOf(runtime, "VINYL_APPLICATION", person.person.personId)?.eligible).toBe(true);
      expect(runtime.retirePersonSkill(person.person.personId, vinyl.skillId).ok).toBe(true);
      expect(diagnosisOf(runtime, "VINYL_APPLICATION", person.person.personId)?.eligible).toBe(false);

      expect(runtime.assignPersonSkill(person.person.personId, assembly.skillId).ok).toBe(true);
      expect(diagnosisOf(runtime, "PAINTING", person.person.personId)?.eligible).toBe(false);
      expect(runtime.assignPersonSkill(person.person.personId, painting.skillId).ok).toBe(true);
      expect(diagnosisOf(runtime, "PAINTING", person.person.personId)?.eligible).toBe(true);
      expect(runtime.retirePersonSkill(person.person.personId, painting.skillId).ok).toBe(true);
      expect(diagnosisOf(runtime, "PAINTING", person.person.personId)?.eligible).toBe(false);

      expect(runtime.assignPersonSkill(person.person.personId, cnc.skillId).ok).toBe(true);
      expect(diagnosisOf(runtime, "METAL_CUTTING", person.person.personId)?.eligible).toBe(false);
      expect(runtime.assignPersonSkill(person.person.personId, metal.skillId).ok).toBe(true);
      expect(diagnosisOf(runtime, "METAL_CUTTING", person.person.personId)?.eligible).toBe(true);
      expect(runtime.retirePersonSkill(person.person.personId, metal.skillId).ok).toBe(true);
      expect(diagnosisOf(runtime, "METAL_CUTTING", person.person.personId)?.eligible).toBe(false);

      expect(runtime.assignPersonSkill(person.person.personId, painting.skillId).ok).toBe(true);
      expect(
        runtime.updatePerson(person.person.personId, {
          availability: "TEMPORARILY_UNAVAILABLE",
          unavailableReason: "Concediu",
        }).ok,
      ).toBe(true);
      expect(diagnosisOf(runtime, "PAINTING", person.person.personId)?.reason).toBe(
        "TEMPORARILY_UNAVAILABLE",
      );
      expect(
        runtime.updatePerson(person.person.personId, { availability: "AVAILABLE" }).ok,
      ).toBe(true);
      expect(diagnosisOf(runtime, "PAINTING", person.person.personId)?.eligible).toBe(true);
      expect(runtime.retirePerson(person.person.personId).ok).toBe(true);
      expect(diagnosisOf(runtime, "PAINTING", person.person.personId)?.reason).toBe("RETIRED");
    } finally {
      runtime.close();
    }
  });

  it("keeps current product capabilities mapped and leaves unused catalog capabilities unmapped", () => {
    const runtime = createProductSystemRuntime(tempSqlitePath(), {
      bootstrapPolicy: "NEW_ORGANIZATION",
    });
    try {
      const union = currentSupportedProductCapabilities();
      expect(union).toEqual([
        "CNC_ROUTING",
        "PROFILE_FORMING",
        "MANUAL_ASSEMBLY",
        "VINYL_APPLICATION",
        "ELECTRICAL_ASSEMBLY",
        "PAINTING",
        "QUALITY_CONTROL",
        "PACKAGING",
        "METAL_CUTTING",
      ]);
      const db = openSqliteDatabase(runtime.sqlitePath);
      const mapped = new Set(mappingPairs(db).map((item) => item.capabilityId));
      db.close();
      expect(union.filter((capabilityId) => !mapped.has(capabilityId))).toEqual([]);

      const lettersTemplate = getProductTemplate(CANONICAL_PRODUCT_CODE);
      expect(lettersTemplate).toBeTruthy();
      if (!lettersTemplate) {
        return;
      }
      const inspections = lettersProcessCompositionInspections(lettersTemplate);
      const vinylCaps = new Set(
        inspections
          .find((item) => item.id === "letters-finish-vinyl")
          ?.composition.nodes.flatMap((node) => {
            const capabilityId = getOperationalProcess(node.processId)?.requiredCapabilityId;
            return capabilityId ? [capabilityId] : [];
          }) ?? [],
      );
      const paintedCaps = new Set(
        inspections
          .find((item) => item.id === "letters-volume-painted")
          ?.composition.nodes.flatMap((node) => {
            const capabilityId = getOperationalProcess(node.processId)?.requiredCapabilityId;
            return capabilityId ? [capabilityId] : [];
          }) ?? [],
      );
      expect(vinylCaps.has("VINYL_APPLICATION")).toBe(true);
      expect(paintedCaps.has("PAINTING")).toBe(true);
      expect(mapped.has("VINYL_APPLICATION")).toBe(true);
      expect(mapped.has("PAINTING")).toBe(true);
      expect(mapped.has("METAL_CUTTING")).toBe(true);
      expect(mapped.has("CNC_ROUTING")).toBe(true);
      expect(mapped.has("MANUAL_ASSEMBLY")).toBe(true);
      expect(mapped.has("ELECTRICAL_ASSEMBLY")).toBe(true);
      expect(mapped.has("LASER_CUTTING")).toBe(false);
      expect(mapped.has("PRINTING")).toBe(false);

      const person = runtime.createPerson("Operator Produse");
      expect(person.ok).toBe(true);
      if (!person.ok) {
        return;
      }
      expect(diagnosisOf(runtime, "CNC_ROUTING", person.person.personId)?.reason).toBe("MISSING_SKILL");
      expect(diagnosisOf(runtime, "MANUAL_ASSEMBLY", person.person.personId)?.reason).toBe(
        "MISSING_SKILL",
      );
      expect(diagnosisOf(runtime, "ELECTRICAL_ASSEMBLY", person.person.personId)?.reason).toBe(
        "MISSING_SKILL",
      );
      expect(diagnosisOf(runtime, "LASER_CUTTING", person.person.personId)?.reason).toBe(
        "CAPABILITY_UNMAPPED",
      );
    } finally {
      runtime.close();
    }
  });

  it("supports modular assignment without machines, unused capabilities, or history rewrite", async () => {
    const runtime = createProductSystemRuntime(tempSqlitePath(), {
      bootstrapPolicy: "NEW_ORGANIZATION",
    });
    const app = createApp({ productSystem: runtime });
    try {
      expect(runtime.providerRegistry.machines).toEqual([]);
      const advanced = runtime.createPerson("Companie avansata");
      const small = runtime.createPerson("Companie mica");
      expect(advanced.ok && small.ok).toBe(true);
      if (!advanced.ok || !small.ok) {
        return;
      }
      const vinyl = runtime.listSkills().find((item) => item.code === VINYL_APPLICATOR_SKILL_CODE);
      const painting = runtime.listSkills().find((item) => item.code === PAINTING_SKILL_CODE);
      const metal = runtime
        .listSkills()
        .find((item) => item.code === METAL_CUTTING_OPERATOR_SKILL_CODE);
      const assembly = runtime.listSkills().find((item) => item.code === "SK_ASSEMBLY");
      expect(vinyl && painting && metal && assembly).toBeTruthy();
      if (!vinyl || !painting || !metal || !assembly) {
        return;
      }
      expect(runtime.assignPersonSkill(advanced.person.personId, vinyl.skillId).ok).toBe(true);
      expect(runtime.assignPersonSkill(advanced.person.personId, painting.skillId).ok).toBe(true);
      expect(runtime.assignPersonSkill(advanced.person.personId, metal.skillId).ok).toBe(true);
      expect(diagnosisOf(runtime, "VINYL_APPLICATION", advanced.person.personId)?.eligible).toBe(true);
      expect(diagnosisOf(runtime, "PAINTING", advanced.person.personId)?.eligible).toBe(true);
      expect(diagnosisOf(runtime, "METAL_CUTTING", advanced.person.personId)?.eligible).toBe(true);

      expect(runtime.assignPersonSkill(small.person.personId, vinyl.skillId).ok).toBe(true);
      expect(diagnosisOf(runtime, "VINYL_APPLICATION", small.person.personId)?.eligible).toBe(true);
      expect(diagnosisOf(runtime, "PAINTING", small.person.personId)?.reason).toBe("MISSING_SKILL");
      expect(diagnosisOf(runtime, "METAL_CUTTING", small.person.personId)?.reason).toBe("MISSING_SKILL");
      expect(diagnosisOf(runtime, "LASER_CUTTING", small.person.personId)?.reason).toBe(
        "CAPABILITY_UNMAPPED",
      );

      expect(runtime.assignPersonSkill(small.person.personId, assembly.skillId).ok).toBe(true);
      expect(diagnosisOf(runtime, "MANUAL_ASSEMBLY", small.person.personId)?.eligible).toBe(true);

      const plan = await createLettersExecutionPlan(app);
      expect(plan.plan.planId).toBeTruthy();
      const db = openSqliteDatabase(runtime.sqlitePath);
      const before = executionFingerprint(db);
      applyOperationalSkillFoundation(db);
      expect(runtime.assignPersonSkill(small.person.personId, painting.skillId).ok).toBe(true);
      expect(diagnosisOf(runtime, "PAINTING", small.person.personId)?.eligible).toBe(true);
      const after = executionFingerprint(db);
      expect(after.plans).toEqual(before.plans);
      expect(after.tasks).toEqual(before.tasks);
      expect(after.dependencies).toEqual(before.dependencies);
      expect(after.snapshots).toEqual(before.snapshots);
      expect(after.people).toEqual(before.people);
      db.close();
    } finally {
      runtime.close();
    }
  });

  it("reconciles shared foundation on a cloud ADOPT_EXISTING organization without trusted people", async () => {
    const fixture = createCloudFixture();
    try {
      const org = await addOrganization(fixture, "Firma adoptata", "ADOPT_EXISTING");
      ensureOperationalPlane(fixture.controlPlane, org.organization, org.plane);
      await addUser(fixture, {
        email: "adopt@coverage.test",
        password: OWNER_PASSWORD,
        organizationId: org.organization.organizationId,
        role: "owner",
      });
      const login = await loginCloud(
        fixture.app,
        "adopt@coverage.test",
        OWNER_PASSWORD,
        org.organization.organizationId,
      );
      const headers = { cookie: login.cookie ?? "" };
      const people = (await (
        await fixture.app.request("/api/people", { headers })
      ).json()) as { people: Array<{ displayName: string }> };
      expect(people.people).toEqual([]);
      expect(JSON.stringify(people)).not.toMatch(/Florin CNC|Vali Colantator|per:legacy/i);
      const skills = (await (
        await fixture.app.request("/api/people/skills", { headers })
      ).json()) as { skills: Array<{ code: string }> };
      expect(skills.skills.map((item) => item.code).sort()).toEqual(
        [...OPERATIONAL_FOUNDATION_SKILLS.map((item) => item.code)].sort(),
      );
    } finally {
      fixture.close();
    }
  });

  it("isolates skill assignments across organizations", async () => {
    const fixture = createCloudFixture();
    try {
      const orgA = await addOrganization(fixture, "Org A", "NEW_ORGANIZATION");
      const orgB = await addOrganization(fixture, "Org B", "NEW_ORGANIZATION");
      await addUser(fixture, {
        email: "a@coverage.test",
        password: OWNER_PASSWORD,
        organizationId: orgA.organization.organizationId,
        role: "owner",
      });
      await addUser(fixture, {
        email: "b@coverage.test",
        password: OWNER_PASSWORD,
        organizationId: orgB.organization.organizationId,
        role: "owner",
      });
      const loginA = await loginCloud(
        fixture.app,
        "a@coverage.test",
        OWNER_PASSWORD,
        orgA.organization.organizationId,
      );
      const loginB = await loginCloud(
        fixture.app,
        "b@coverage.test",
        OWNER_PASSWORD,
        orgB.organization.organizationId,
      );
      const headersA = { cookie: loginA.cookie ?? "", "content-type": "application/json" };
      const headersB = { cookie: loginB.cookie ?? "", "content-type": "application/json" };

      const skillsA = (await (
        await fixture.app.request("/api/people/skills", { headers: headersA })
      ).json()) as { skills: Array<{ skillId: string; code: string }> };
      const vinyl = skillsA.skills.find((item) => item.code === VINYL_APPLICATOR_SKILL_CODE);
      expect(vinyl).toBeTruthy();
      const created = (await (
        await fixture.app.request("/api/people", {
          method: "POST",
          headers: headersA,
          body: JSON.stringify({ displayName: "Operator A" }),
        })
      ).json()) as { person: { personId: string } };
      expect(
        (
          await fixture.app.request(`/api/people/${created.person.personId}/skills`, {
            method: "POST",
            headers: headersA,
            body: JSON.stringify({ skillId: vinyl?.skillId }),
          })
        ).status,
      ).toBe(200);

      const peopleB = (await (
        await fixture.app.request("/api/people", { headers: headersB })
      ).json()) as { people: Array<{ displayName: string }> };
      expect(peopleB.people.map((item) => item.displayName)).not.toContain("Operator A");
      const eligibilityB = (await (
        await fixture.app.request("/api/people/eligibility?capabilityId=VINYL_APPLICATION", {
          headers: headersB,
        })
      ).json()) as { eligiblePeople: Array<{ displayName: string }> };
      expect(eligibilityB.eligiblePeople.map((item) => item.displayName)).not.toContain("Operator A");
    } finally {
      fixture.close();
    }
  });

  it("lets an owner assign and retire the three shared qualifications through the current People API", async () => {
    const fixture = createCloudFixture();
    try {
      const org = await addOrganization(fixture, "Org sintetica", "SYNTHETIC_TEST");
      await addUser(fixture, {
        email: "owner@coverage.test",
        password: OWNER_PASSWORD,
        organizationId: org.organization.organizationId,
        role: "owner",
      });
      const login = await loginCloud(
        fixture.app,
        "owner@coverage.test",
        OWNER_PASSWORD,
        org.organization.organizationId,
      );
      const headers = { cookie: login.cookie ?? "", "content-type": "application/json" };
      const skills = (await (
        await fixture.app.request("/api/people/skills", { headers })
      ).json()) as { skills: Array<{ skillId: string; code: string; displayLabel: string }> };
      const painting = skills.skills.find((item) => item.code === PAINTING_SKILL_CODE);
      expect(painting?.displayLabel).toBe("Vopsire spray / pistol");
      expect(skills.skills.some((item) => item.code === VINYL_APPLICATOR_SKILL_CODE)).toBe(true);
      expect(skills.skills.some((item) => item.code === METAL_CUTTING_OPERATOR_SKILL_CODE)).toBe(
        true,
      );

      const created = (await (
        await fixture.app.request("/api/people", {
          method: "POST",
          headers,
          body: JSON.stringify({ displayName: "Operator sintetic" }),
        })
      ).json()) as { person: { personId: string } };
      const before = (await (
        await fixture.app.request("/api/people/eligibility?capabilityId=PAINTING", { headers })
      ).json()) as { diagnoses: Array<{ personId: string; eligible: boolean; reason: string | null }> };
      expect(before.diagnoses.find((item) => item.personId === created.person.personId)?.reason).toBe(
        "MISSING_SKILL",
      );

      expect(
        (
          await fixture.app.request(`/api/people/${created.person.personId}/skills`, {
            method: "POST",
            headers,
            body: JSON.stringify({ skillId: painting?.skillId }),
          })
        ).status,
      ).toBe(200);
      const afterAssign = (await (
        await fixture.app.request("/api/people/eligibility?capabilityId=PAINTING", { headers })
      ).json()) as { eligiblePeople: Array<{ personId: string }> };
      expect(afterAssign.eligiblePeople.map((item) => item.personId)).toContain(
        created.person.personId,
      );

      expect(
        (
          await fixture.app.request(
            `/api/people/${created.person.personId}/skills/${painting?.skillId}`,
            {
              method: "PATCH",
              headers,
              body: JSON.stringify({ status: "RETIRED" }),
            },
          )
        ).status,
      ).toBe(200);
      const afterRetire = (await (
        await fixture.app.request("/api/people/eligibility?capabilityId=PAINTING", { headers })
      ).json()) as {
        eligiblePeople: Array<{ personId: string }>;
        diagnoses: Array<{ personId: string; eligible: boolean }>;
      };
      expect(afterRetire.eligiblePeople.map((item) => item.personId)).not.toContain(
        created.person.personId,
      );
      expect(afterRetire.diagnoses.find((item) => item.personId === created.person.personId)?.eligible).toBe(
        false,
      );
    } finally {
      fixture.close();
    }
  });
});
