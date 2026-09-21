import { describe, expect, it } from "vitest";
import { liveEligibleProviders } from "../execution/plan.js";
import { createWorkcenterRegistry } from "./catalog.js";
import {
  createMachine,
  createWorkcenter,
  generateMachineId,
  generateWorkcenterId,
  updateMachine,
  updateWorkcenter,
} from "./mutations.js";

const noHistory = { referencedByHistory: false, hasOpenAssignment: false };
const completedHistory = { referencedByHistory: true, hasOpenAssignment: false };
const openAssignment = { referencedByHistory: true, hasOpenAssignment: true };

describe("workcenter and machine admin mutations", () => {
  it("creates a planned workcenter with a server-generated id", () => {
    const created = createWorkcenter({ label: "Zonă CNC" });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.value.id.startsWith("wc:")).toBe(true);
    expect(created.value.lifecycle).toBe("PLANNED");
    expect(created.value.capabilityIds).toEqual([]);
    expect(generateWorkcenterId().startsWith("wc:")).toBe(true);
  });

  it("creates a machine in a live workcenter with a server-generated id", () => {
    const workcenter = createWorkcenter({
      label: "Zonă CNC",
      lifecycle: "ACTIVE",
      workcenterId: "wc:test",
    });
    if (!workcenter.ok) {
      throw new Error("expected workcenter");
    }
    const created = createMachine(
      { label: "Router CNC", workcenterId: "wc:test", capabilityIds: ["CNC_ROUTING"] },
      [workcenter.value],
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.value.id.startsWith("mch:")).toBe(true);
    expect(created.value.workcenterId).toBe("wc:test");
    expect(created.value.capabilityIds).toEqual(["CNC_ROUTING"]);
    expect(generateMachineId().startsWith("mch:")).toBe(true);
  });

  it("rejects an unknown capability and an unknown workcenter", () => {
    expect(createWorkcenter({ label: "Zonă", capabilityIds: ["NOT_A_CAPABILITY"] })).toEqual({
      ok: false,
      error: "invalid_capability",
    });
    expect(createMachine({ label: "Router", workcenterId: "wc:missing" }, [])).toEqual({
      ok: false,
      error: "invalid_workcenter",
    });
  });

  it("treats an identical workcenter patch as a no-op", () => {
    const created = createWorkcenter({
      label: "Zonă CNC",
      lifecycle: "ACTIVE",
      workcenterId: "wc:test",
    });
    if (!created.ok) {
      throw new Error("expected workcenter");
    }
    const updated = updateWorkcenter(
      created.value,
      { label: "Zonă CNC", lifecycle: "ACTIVE" },
      noHistory,
      [],
    );
    expect(updated).toEqual({ ok: true, alreadyApplied: true, value: created.value });
  });

  it("keeps planned providers out of live eligibility until activation", () => {
    const workcenter = createWorkcenter({
      label: "Zonă CNC",
      workcenterId: "wc:test",
    });
    if (!workcenter.ok) {
      throw new Error("expected workcenter");
    }
    const machine = createMachine(
      {
        label: "Router CNC",
        workcenterId: "wc:test",
        capabilityIds: ["CNC_ROUTING"],
        machineId: "mch:test",
      },
      [workcenter.value],
    );
    if (!machine.ok) {
      throw new Error("expected machine");
    }
    const planned = createWorkcenterRegistry([workcenter.value], [machine.value]);
    expect(liveEligibleProviders("CNC_ROUTING", planned)).toEqual([]);

    const activatedMachine = updateMachine(
      machine.value,
      { lifecycle: "ACTIVE" },
      noHistory,
      [workcenter.value],
    );
    const activatedWorkcenter = updateWorkcenter(
      workcenter.value,
      { lifecycle: "ACTIVE" },
      noHistory,
      activatedMachine.ok ? [activatedMachine.value] : [],
    );
    if (!activatedMachine.ok || !activatedWorkcenter.ok) {
      throw new Error("expected activation");
    }
    const live = createWorkcenterRegistry([activatedWorkcenter.value], [activatedMachine.value]);
    expect(liveEligibleProviders("CNC_ROUTING", live).map((item) => item.id)).toEqual([
      "mch:test",
    ]);
  });

  it("blocks capability and machine-move changes when history exists", () => {
    const workcenter = createWorkcenter({
      label: "Zonă CNC",
      lifecycle: "ACTIVE",
      workcenterId: "wc:one",
    });
    const other = createWorkcenter({
      label: "Zonă print",
      lifecycle: "ACTIVE",
      workcenterId: "wc:two",
    });
    if (!workcenter.ok || !other.ok) {
      throw new Error("expected workcenters");
    }
    const machine = createMachine(
      {
        label: "Router CNC",
        workcenterId: "wc:one",
        capabilityIds: ["CNC_ROUTING"],
        lifecycle: "ACTIVE",
        machineId: "mch:test",
      },
      [workcenter.value],
    );
    if (!machine.ok) {
      throw new Error("expected machine");
    }
    expect(
      updateMachine(
        machine.value,
        { capabilityIds: ["CNC_ROUTING", "LASER_CUTTING"] },
        completedHistory,
        [workcenter.value, other.value],
      ),
    ).toEqual({ ok: false, error: "provider_referenced" });
    expect(
      updateMachine(
        machine.value,
        { workcenterId: "wc:two" },
        completedHistory,
        [workcenter.value, other.value],
      ),
    ).toEqual({ ok: false, error: "provider_referenced" });
    expect(
      updateWorkcenter(
        workcenter.value,
        { capabilityIds: ["MANUAL_ASSEMBLY"] },
        completedHistory,
        [machine.value],
      ),
    ).toEqual({ ok: false, error: "provider_referenced" });
  });

  it("allows label edits and completed-history retirement, but blocks open assignments", () => {
    const workcenter = createWorkcenter({
      label: "Zonă CNC",
      lifecycle: "ACTIVE",
      workcenterId: "wc:test",
    });
    if (!workcenter.ok) {
      throw new Error("expected workcenter");
    }
    const machine = createMachine(
      {
        label: "Router CNC",
        workcenterId: "wc:test",
        lifecycle: "ACTIVE",
        machineId: "mch:test",
      },
      [workcenter.value],
    );
    if (!machine.ok) {
      throw new Error("expected machine");
    }
    const renamed = updateMachine(
      machine.value,
      { label: "Router CNC 4020" },
      completedHistory,
      [workcenter.value],
    );
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) {
      return;
    }
    expect(renamed.value.label).toBe("Router CNC 4020");
    expect(renamed.value.id).toBe("mch:test");

    expect(
      updateMachine(machine.value, { lifecycle: "RETIRED" }, openAssignment, [workcenter.value]),
    ).toEqual({ ok: false, error: "has_open_assignment" });

    const retired = updateMachine(
      machine.value,
      { lifecycle: "RETIRED" },
      completedHistory,
      [workcenter.value],
    );
    expect(retired.ok).toBe(true);
    if (!retired.ok) {
      return;
    }
    expect(retired.value.lifecycle).toBe("RETIRED");
    const live = createWorkcenterRegistry([workcenter.value], [retired.value]);
    expect(liveEligibleProviders("CNC_ROUTING", live)).toEqual([]);
  });

  it("blocks workcenter retirement while a non-retired machine remains", () => {
    const workcenter = createWorkcenter({
      label: "Zonă CNC",
      lifecycle: "ACTIVE",
      workcenterId: "wc:test",
    });
    if (!workcenter.ok) {
      throw new Error("expected workcenter");
    }
    const machine = createMachine(
      {
        label: "Router CNC",
        workcenterId: "wc:test",
        lifecycle: "ACTIVE",
        machineId: "mch:test",
      },
      [workcenter.value],
    );
    if (!machine.ok) {
      throw new Error("expected machine");
    }
    expect(
      updateWorkcenter(workcenter.value, { lifecycle: "RETIRED" }, noHistory, [machine.value]),
    ).toEqual({ ok: false, error: "has_active_machines" });

    const retiredMachine = updateMachine(
      machine.value,
      { lifecycle: "RETIRED" },
      noHistory,
      [workcenter.value],
    );
    if (!retiredMachine.ok) {
      throw new Error("expected retired machine");
    }
    const retiredWorkcenter = updateWorkcenter(
      workcenter.value,
      { lifecycle: "RETIRED" },
      noHistory,
      [retiredMachine.value],
    );
    expect(retiredWorkcenter.ok).toBe(true);
    if (!retiredWorkcenter.ok) {
      return;
    }
    expect(retiredWorkcenter.value.lifecycle).toBe("RETIRED");
  });
});
