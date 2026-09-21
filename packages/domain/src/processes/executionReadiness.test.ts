import { describe, expect, it } from "vitest";
import { starterFormulaVersionsForType } from "../product/resolveFormulas.js";
import {
  compileDefinition,
  confirmReviewedDefinition,
} from "../product/compiler.js";
import {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "../product/frontlitPlexiAl06.js";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  ACM_CASSETTE_NONE_READY_VALUES,
  acmCassetteNoneFormSchema,
  acmCassetteNoneTemplate,
} from "../product/acmCassetteNone.js";
import { createPerson } from "../people/identity.js";
import { createSkill } from "../people/skills.js";
import { assignPersonSkill } from "../people/assignment.js";
import { resolveEligiblePeople } from "../people/eligibility.js";
import { projectPeopleRegistry } from "../people/projection.js";
import {
  createWorkcenterRegistry,
  workcenterRegistry,
} from "../workcenters/catalog.js";
import { projectWorkcentersAdministration } from "../workcenters/projection.js";
import {
  applyCompositionCostCompleteness,
  composeProductProcesses,
  composeProductProcessesFromTruth,
  deriveExecutionReadiness,
  executionReadinessLabel,
  lettersProcessCompositionInspections,
  topologicalOrder,
  type MissingProcessGap,
  type ProcessCompositionNode,
} from "./composition.js";

const noneFinish = {
  "face.finish": "none",
  "volume.finish": "none",
} as const;

const vinylFinish = {
  "face.finish": "vinyl",
  "volume.finish": "vinyl",
} as const;

const paintedFinish = {
  "face.finish": "none",
  "volume.finish": "painted",
} as const;

const canonicalGeometry = {
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.confirmedPerimeterMm": 12500,
} as const;

function composeLetters(
  values: Record<string, string | number>,
  options?: Parameters<typeof composeProductProcesses>[2],
) {
  return composeProductProcesses(frontlitPlexiAl06Template, values, {
    formulaVersionsForType: starterFormulaVersionsForType,
    ...options,
  });
}

function confirmedLetters(values: Record<string, string | number>) {
  const definition = compileDefinition(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    {
      templateCode: CANONICAL_PRODUCT_CODE,
      values: {
        "root.inscription": "WORKOS",
        ...values,
      },
    },
  );
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error("expected confirmed Letters truth");
  }
  return composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template, undefined, {
    formulaVersionsForType: starterFormulaVersionsForType,
  });
}

function confirmedAcm() {
  const definition = compileDefinition(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, {
    templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
    values: ACM_CASSETTE_NONE_READY_VALUES,
  });
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error("expected confirmed ACM truth");
  }
  return composeProductProcessesFromTruth(truth, acmCassetteNoneTemplate);
}

function gap(
  classification: MissingProcessGap["classification"],
): MissingProcessGap {
  return {
    id: `gap:${classification}`,
    label: classification,
    classification,
    classificationLabel: classification,
    note: "synthetic gap",
  };
}

describe("execution readiness", () => {
  it("marks accepted Letters none, vinyl, and painted compositions READY", () => {
    const inspections = lettersProcessCompositionInspections(frontlitPlexiAl06Template);
    const none = inspections.find((item) => item.id === "letters-finish-none");
    const vinyl = inspections.find((item) => item.id === "letters-finish-vinyl");
    const painted = inspections.find((item) => item.id === "letters-volume-painted");
    expect(none?.composition.executionReadiness).toBe("READY");
    expect(vinyl?.composition.executionReadiness).toBe("READY");
    expect(painted?.composition.executionReadiness).toBe("READY");
    expect(confirmedLetters({ ...noneFinish, ...canonicalGeometry }).executionReadiness).toBe(
      "READY",
    );
    expect(
      confirmedLetters({
        ...vinylFinish,
        ...canonicalGeometry,
        "face.color": "alb",
        "volume.color": "alb",
      }).executionReadiness,
    ).toBe("READY");
    expect(
      confirmedLetters({
        ...paintedFinish,
        ...canonicalGeometry,
        "volume.color": "RAL 9010",
      }).executionReadiness,
    ).toBe("READY");
    expect(executionReadinessLabel("READY")).toBe("Pregătită pentru execuție");
  });

  it("marks current ACM V2 composition READY", () => {
    const composition = confirmedAcm();
    expect(composition.productCode).toBe(ACM_CASSETTE_NONE_PRODUCT_CODE);
    expect(composition.nodes.length).toBeGreaterThan(0);
    expect(composition.executionReadiness).toBe("READY");
    expect(composition.executionReadinessLabel).toBe("Pregătită pentru execuție");
  });

  it("blocks when a required execution node is REQUIRED_BLOCKED", () => {
    const blocked = composeLetters(noneFinish);
    expect(
      blocked.nodes.some((item) => item.nodeReadiness === "REQUIRED_BLOCKED"),
    ).toBe(true);
    expect(blocked.executionReadiness).toBe("BLOCKED");
    expect(blocked.executionReadinessLabel).toBe("Blocată pentru execuție");
  });

  it("does not treat REQUIRED_INCOMPLETE as an execution blocker", () => {
    const ready = composeLetters({ ...noneFinish, ...canonicalGeometry });
    expect(
      ready.nodes.some((item) => item.nodeReadiness === "REQUIRED_INCOMPLETE"),
    ).toBe(true);
    expect(
      ready.nodes.some((item) => item.nodeReadiness === "REQUIRED_BLOCKED"),
    ).toBe(false);
    expect(ready.completeness).not.toBe("READY");
    expect(ready.executionReadiness).toBe("READY");
  });

  it("blocks REQUIRED_FOR_V1, BLOCKED, and UNKNOWN_OWNER_DECISION gaps only", () => {
    const ready = composeLetters({ ...noneFinish, ...canonicalGeometry });
    expect(deriveExecutionReadiness(ready.nodes, [gap("REQUIRED_FOR_V1")])).toBe(
      "BLOCKED",
    );
    expect(deriveExecutionReadiness(ready.nodes, [gap("BLOCKED")])).toBe("BLOCKED");
    expect(
      deriveExecutionReadiness(ready.nodes, [gap("UNKNOWN_OWNER_DECISION")]),
    ).toBe("BLOCKED");
    expect(deriveExecutionReadiness(ready.nodes, [gap("LATER")])).toBe("READY");
    expect(deriveExecutionReadiness(ready.nodes, [])).toBe("READY");
    expect(deriveExecutionReadiness([], [])).toBe("BLOCKED");
  });

  it("keeps cost completeness independent of execution readiness", () => {
    const complete = composeLetters({ ...noneFinish, ...canonicalGeometry });
    expect(complete.costCompleteness).toBe("COMPLETE");
    expect(complete.executionReadiness).toBe("READY");
    const forcedPartial = applyCompositionCostCompleteness(complete, {
      completeness: "PARTIAL",
    });
    expect(forcedPartial.costCompleteness).toBe("PARTIAL");
    expect(forcedPartial.executionReadiness).toBe(complete.executionReadiness);
    const emptyEvidence = composeLetters(
      { ...noneFinish, ...canonicalGeometry },
      { costEvidenceRows: [] },
    );
    expect(emptyEvidence.costCompleteness).toBe("PARTIAL");
    expect(emptyEvidence.executionReadiness).toBe("READY");
  });

  it("does not change Layer-A readiness when Machines or People change", () => {
    const advanced = composeLetters({ ...noneFinish, ...canonicalGeometry });
    const emptyRegistry = createWorkcenterRegistry([], []);
    const emptyShop = projectWorkcentersAdministration(emptyRegistry);
    const fullShop = projectWorkcentersAdministration(workcenterRegistry);
    expect(emptyShop.overview.machineCount).toBe(0);
    expect(fullShop.overview.machineCount).toBeGreaterThan(0);
    expect(
      composeLetters({ ...noneFinish, ...canonicalGeometry }).executionReadiness,
    ).toBe(advanced.executionReadiness);

    const personCreated = createPerson("Operator test", { personId: "per:exe1" });
    const skillCreated = createSkill({
      code: "SK_VINYL_APPLICATOR",
      displayLabel: "Aplicare autocolant",
      skillId: "skl:exe1",
    });
    expect(personCreated.ok && skillCreated.ok).toBe(true);
    if (!personCreated.ok || !skillCreated.ok) {
      return;
    }
    const assigned = assignPersonSkill({
      personId: personCreated.person.personId,
      skillId: skillCreated.skill.skillId,
      personStatus: "ACTIVE",
      skillStatus: "ACTIVE",
      existing: [],
    });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }
    const withPeople = projectPeopleRegistry(
      [personCreated.person],
      [skillCreated.skill],
      [assigned.assignment],
    );
    const withoutPeople = projectPeopleRegistry([], [], []);
    expect(withPeople.summary.total).toBe(1);
    expect(withoutPeople.summary.total).toBe(0);
    expect(
      resolveEligiblePeople({
        capabilityId: "VINYL_APPLICATION",
        people: [personCreated.person],
        skills: [skillCreated.skill],
        assignments: [assigned.assignment],
        requirements: [
          { capabilityId: "VINYL_APPLICATION", skillId: skillCreated.skill.skillId },
        ],
      }).length,
    ).toBe(1);
    expect(advanced.executionReadiness).toBe("READY");
    expect(JSON.stringify(advanced)).not.toMatch(
      /workcenterId|machineId|personId|employeeId/,
    );
  });

  it("keeps unknown and cyclic topology fail-closed instead of READY or BLOCKED", () => {
    const ready = composeLetters({ ...noneFinish, ...canonicalGeometry });
    const sample = ready.nodes[0];
    if (!sample) {
      throw new Error("expected composition node");
    }
    const unknown: ProcessCompositionNode = {
      ...sample,
      dependsOn: ["missing-process"],
    };
    expect(() => topologicalOrder([unknown])).toThrow(/unknown_process_dependency/);
    const cyclic: ProcessCompositionNode[] = [
      { ...sample, id: "A", dependsOn: ["B"] },
      { ...sample, id: "B", dependsOn: ["A"] },
    ];
    expect(() => topologicalOrder(cyclic)).toThrow("cyclic_process_composition");
    expect(ready.derivedOrder).toEqual(topologicalOrder(ready.nodes));
    expect(ready.executionReadiness).toBe("READY");
  });
});
