import { describe, expect, it } from "vitest";
import { presentExecutionPlan } from "../adapters/executionAdapter";
import { jobTaskAttentionNotes, jobTaskNotes, presentJobProvider, presentJobStartBlockReason } from "./jobOperationNotes";

const task = presentExecutionPlan({ executionPlan: { plan: { planId: "plan" }, tasks: [{ taskId: "task", status: "PLANNED", assignmentLabel: "Nealocat", waitingFor: ["Debitare"] }] } })!.tasks[0]!;

describe("job operation presentation", () => {
  it("distinguishes routine dependencies from exceptional resource attention using server state", () => {
    expect(jobTaskNotes(task)).toEqual(["Așteaptă: Debitare"]);
    expect(jobTaskAttentionNotes(task)).toEqual([]);
    expect(jobTaskAttentionNotes({ ...task, providerBindingState: "UNIQUE_PENDING" })).toEqual([]);
    expect(jobTaskAttentionNotes({ ...task, providerBindingState: "NONE" })).toEqual(["Nicio resursă eligibilă configurată."]);
    expect(jobTaskAttentionNotes({ ...task, status: "COMPLETED", providerBindingState: "NONE" })).toEqual([]);
    expect(presentJobProvider({ ...task, providerBindingState: "NOT_REQUIRED" })).toBe("Nu este necesar");
  });

  it("shows operator explanations instead of internal start reason codes", () => {
    expect(presentJobStartBlockReason("executor_unavailable")).toBe("Executantul alocat nu mai este disponibil.");
    expect(presentJobStartBlockReason("unavailable_person")).toBe("Executantul alocat este temporar indisponibil.");
    expect(presentJobStartBlockReason("ineligible_executor")).toBe("Executantul alocat nu este eligibil pentru operație.");
    expect(presentJobStartBlockReason("future_reason")).toBe("Pornirea necesită verificare.");
  });
});
