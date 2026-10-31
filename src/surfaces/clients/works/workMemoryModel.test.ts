import { describe, expect, it } from "vitest";
import type { JobRecord } from "../../../api/jobRecord";
import { fileRevisionSentence, hoursSentence, memoryMatches, planPresence, planSentence, quantityLine, usageSentence } from "./workMemoryModel";

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

  it("names a revision only when the previous version is in the record", () => {
    const first = { artifactId: "a1", originalFileName: "schiță.dxf", supersedesArtifactId: null };
    const next = { artifactId: "a2", originalFileName: "schiță.dxf", supersedesArtifactId: "a1" };
    const orphan = { artifactId: "a3", originalFileName: "schiță.dxf", supersedesArtifactId: "missing" };
    expect(fileRevisionSentence(first, [first, next])).toBe("Fișier inițial");
    expect(fileRevisionSentence(next, [first, next])).toBe("Revizie 2 din 2 · versiunea anterioară rămâne păstrată");
    expect(fileRevisionSentence(orphan, [orphan])).toBe("Revizie înregistrată · versiunea anterioară nu este în acest dosar");
    expect(usageSentence(null)).toBe("Asociat · utilizare neconfirmată");
    expect(usageSentence("2026-10-31T08:00:00.000Z")).toBe("Utilizare înregistrată");
  });

  it("every word must be found, without case or diacritics", () => {
    expect(memoryMatches("lipire litere", ["01", "Lipire", "Litere volumetrice"])).toBe(true);
    expect(memoryMatches("lipire factură", ["Lipire"])).toBe(false);
    expect(memoryMatches("", ["Lipire"])).toBe(true);
  });
});
