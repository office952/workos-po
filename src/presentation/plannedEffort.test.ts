import { describe, expect, it } from "vitest";
import {
  formatKnownMinutes,
  formatPlannedEffort,
  formatUnknownEffortCount,
  parseEffortFields,
  UNKNOWN_EFFORT_LABEL,
} from "./plannedEffort";

describe("planned effort presentation", () => {
  it("formats known minutes without calling unknown zero", () => {
    expect(formatPlannedEffort(null)).toBe(UNKNOWN_EFFORT_LABEL);
    expect(formatPlannedEffort(45)).toBe("45 min");
    expect(formatKnownMinutes(60)).toBe("1h");
    expect(formatPlannedEffort(90)).toBe("1h 30m");
    expect(formatPlannedEffort(135)).toBe("2h 15m");
    expect(formatUnknownEffortCount(1)).toBe("Fără estimare 1 sarcină");
    expect(formatUnknownEffortCount(2)).toBe("Fără estimare 2 sarcini");
  });

  it("parses hours and minutes without decimal hours", () => {
    expect(parseEffortFields("", "")).toEqual({ ok: true, plannedEffortMinutes: null });
    expect(parseEffortFields("", "45")).toEqual({ ok: true, plannedEffortMinutes: 45 });
    expect(parseEffortFields("2", "15")).toEqual({ ok: true, plannedEffortMinutes: 135 });
    expect(parseEffortFields("0", "0")).toEqual({ ok: false, error: "invalid_planned_effort" });
    expect(parseEffortFields("1", "90")).toEqual({ ok: false, error: "invalid_planned_effort" });
    expect(parseEffortFields("1.5", "")).toEqual({ ok: false, error: "invalid_planned_effort" });
    expect(parseEffortFields("-1", "0")).toEqual({ ok: false, error: "invalid_planned_effort" });
  });
});
