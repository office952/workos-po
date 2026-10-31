import { describe, expect, it } from "vitest";
import type { JobRecord } from "../../../api/jobRecord";
import { hoursSentence, memoryMatches, planPresence, planSentence, quantityLine } from "./workMemoryModel";

const hours = { tasks: [{ taskId: "t1" }] } as JobRecord["hours"];

describe("work memory · missing and zero stay apart", () => {
  it("a missing plan is not zero operations", () => {
    expect(planPresence(null)).toBe("missing");
    expect(planSentence("missing")).toBe("Plan de execuție neînregistrat");
    expect(hoursSentence(null)).toBe("Ore neînregistrate");
  });

  it("an empty recorded plan is zero, and a recorded hour label is kept", () => {
    expect(planPresence({ ...hours!, tasks: [] })).toBe("empty");
    expect(planSentence("empty")).toBe("Plan fără operații înregistrate");
    expect(planPresence(hours)).toBe("recorded");
    expect(planSentence("recorded")).toBeNull();
    expect(hoursSentence({ ...hours!, coverageLabel: "Evidența orelor: lucrare neîncepută", totalLabel: "Neînregistrat" })).toBe(
      "Evidența orelor: lucrare neîncepută · Neînregistrat",
    );
    expect(quantityLine("Consum", 0, "m")).toBe("Consum: 0 m");
  });

  it("every word must be found, without case or diacritics", () => {
    expect(memoryMatches("lipire litere", ["01", "Lipire", "Litere volumetrice"])).toBe(true);
    expect(memoryMatches("lipire factură", ["Lipire"])).toBe(false);
    expect(memoryMatches("", ["Lipire"])).toBe(true);
  });
});
