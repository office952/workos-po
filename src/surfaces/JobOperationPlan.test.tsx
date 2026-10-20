import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { presentExecutionPlan } from "../adapters/executionAdapter";
import { JobOperationPlan } from "./JobOperationPlan";

const plan = presentExecutionPlan({ executionPlan: {
  plan: { planId: "plan-1", productLabel: "Litere", inscription: "NORD", sourceSnapshotId: "source-1" },
  statusLabel: "În lucru",
  tasks: [
    { taskId: "cut", seqLabel: "01", processLabel: "Debitare CNC", scopeLabel: "Spate", status: "IN_PROGRESS", statusLabel: "În lucru", assignmentLabel: "CNC Router", startedByLabel: "Ion", waitingFor: [] },
    { taskId: "led", seqLabel: "02", processLabel: "Montare LED", scopeLabel: "Iluminare", status: "PLANNED", statusLabel: "Planificată", assignmentLabel: "Nu este necesar", waitingFor: ["Debitare CNC"], materialBlockLabel: "Material neconfirmat disponibil" },
    { taskId: "done", seqLabel: "03", processLabel: "Probă", scopeLabel: "Față", status: "COMPLETED", statusLabel: "Finalizată", assignmentLabel: "Nu este necesar", waitingFor: [] },
  ],
} })!;

describe("JobOperationPlan", () => {
  it("combines search with a status filter and opens the exact operation dossier", async () => {
    const user = userEvent.setup();
    render(<JobOperationPlan jobId="job-1" plan={plan} />);
    expect(screen.getByRole("link", { name: "01 · Debitare CNC" })).toHaveAttribute("href", "/lucrari/job-1?task=cut&sectiune=operatii");
    await user.click(screen.getByRole("button", { name: /De verificat/ }));
    expect(screen.getByRole("link", { name: "02 · Montare LED" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "01 · Debitare CNC" })).toBeNull();
    expect(screen.getByText("Material neconfirmat disponibil")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "absent" } });
    expect(screen.getByText("Nicio operație în această selecție.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: /De verificat/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /Finalizate/ }));
    expect(screen.getByRole("link", { name: "03 · Probă" })).toBeInTheDocument();
  });

  it("labels recorded assignment honestly without claiming current worker presence", () => {
    render(<JobOperationPlan jobId="job-1" plan={plan} />);
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Executant înregistrat" })).toBeInTheDocument();
    expect(within(table).getByText("Ion")).toBeInTheDocument();
    expect(screen.queryByText("Lucrează acum")).toBeNull();
    expect(screen.queryByRole("button", { name: /Pornește|Finalizează/ })).toBeNull();
  });

  it("finds the executor and attention reason actually shown in the plan", () => {
    render(<JobOperationPlan jobId="job-1" plan={plan} />);
    const search = screen.getByRole("searchbox", { name: "Caută operație, componentă sau executant" });
    fireEvent.change(search, { target: { value: "  ION  " } });
    expect(screen.getByRole("link", { name: "01 · Debitare CNC" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "02 · Montare LED" })).toBeNull();
    fireEvent.change(search, { target: { value: "neconfirmat" } });
    expect(screen.getByRole("link", { name: "02 · Montare LED" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "01 · Debitare CNC" })).toBeNull();
  });
});
