import { describe, expect, it } from "vitest";
import {
  LAB_BOND_LETTER_BODY_ID,
  MAT_LED_MODULE_ID,
  SVC_CNC_FACE_ID,
} from "../resources/catalog.js";
import {
  confirmMaterialReadiness,
  materialDemandLines,
  materialParticipation,
  nextMaterialReadinessVersion,
  resolveMaterialReadinessMode,
} from "./materialReadiness.js";

const task = {
  taskId: "task:led",
  resourceDemands: [
    { resourceId: MAT_LED_MODULE_ID, label: "Modul LED" },
    { resourceId: SVC_CNC_FACE_ID, label: "CNC față" },
    { resourceId: LAB_BOND_LETTER_BODY_ID, label: "Lipire" },
    { resourceId: "MAT-MISSING", label: "Lipsește din catalog" },
  ],
};

describe("material readiness participation", () => {
  it("ignores service and labor demands and fails closed on an unknown resource", () => {
    const lines = materialDemandLines(task, []);
    expect(lines.map((line) => line.resourceId)).toEqual([MAT_LED_MODULE_ID, "MAT-MISSING"]);
    expect(lines.map((line) => line.status)).toEqual(["UNKNOWN", "UNRESOLVED"]);
    expect(materialParticipation("DISABLED", lines)).toBe("NOT_ADOPTED");
    expect(materialParticipation("REQUIRED", lines)).toBe("BLOCKED");
  });

  it("is ready only when every material line is AVAILABLE", () => {
    const confirmed = materialDemandLines(task, [
      {
        taskId: task.taskId,
        resourceId: MAT_LED_MODULE_ID,
        status: "AVAILABLE",
        confirmedBy: "owner",
        confirmedAt: "2026-09-26T10:00:00.000Z",
      },
    ]);
    expect(confirmed.find((line) => line.resourceId === MAT_LED_MODULE_ID)?.status).toBe(
      "AVAILABLE",
    );
    expect(materialParticipation("REQUIRED", confirmed)).toBe("BLOCKED");
  });

  it("does not write a row for the code default and keeps confirmations independent of mode", () => {
    const absent = resolveMaterialReadinessMode([]);
    expect(absent).toMatchObject({ mode: "DISABLED", source: "CODE_DEFAULT", version: 0 });
    expect(
      nextMaterialReadinessVersion(absent, "DISABLED", "2026-09-26T10:00:00.000Z", "owner"),
    ).toBeNull();
    const required = nextMaterialReadinessVersion(
      absent,
      "REQUIRED",
      "2026-09-26T10:00:00.000Z",
      "owner",
    );
    expect(required).toEqual({
      version: 1,
      mode: "REQUIRED",
      updatedAt: "2026-09-26T10:00:00.000Z",
      updatedBy: "owner",
    });
    const stored = resolveMaterialReadinessMode([required!]);
    expect(
      nextMaterialReadinessVersion(stored, "DISABLED", "2026-09-26T11:00:00.000Z", "owner"),
    ).toMatchObject({ version: 2, mode: "DISABLED" });
    const confirmation = confirmMaterialReadiness({
      task,
      resourceId: MAT_LED_MODULE_ID,
      status: "AVAILABLE",
      confirmedBy: "owner",
      confirmedAt: "2026-09-26T10:00:00.000Z",
      existing: [],
    });
    expect(confirmation.ok).toBe(true);
    expect(
      confirmMaterialReadiness({
        task,
        resourceId: SVC_CNC_FACE_ID,
        status: "AVAILABLE",
        confirmedBy: "owner",
        confirmedAt: "2026-09-26T10:00:00.000Z",
        existing: [],
      }),
    ).toEqual({ ok: false, error: "not_material_demand" });
    expect(
      confirmMaterialReadiness({
        task: null,
        resourceId: MAT_LED_MODULE_ID,
        status: "AVAILABLE",
        confirmedBy: "owner",
        confirmedAt: "2026-09-26T10:00:00.000Z",
        existing: [],
      }),
    ).toEqual({ ok: false, error: "task_not_found" });
  });
});
