import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ExecutionPlanTransport } from "../api/types";
import { JobProductionMap } from "./JobProductionMap";

const plan = {
  planId: "plan-synthetic",
  progressLabel: "0 / 2",
  progress: { completed: 0, total: 2, inProgress: 0, planned: 2, outside: 0, waitingDependencies: 1, noProvider: 0, varianceCount: 0 },
  tasks: [
    {
      taskId: "cut",
      scopeLabel: "Panou ACM",
      seqLabel: "01",
      processLabel: "Debitare panou",
      status: "PLANNED",
      statusLabel: "Planificată",
      assignmentLabel: "Nealocat",
      executorLabel: null,
      requiredCapabilityLabel: "Router CNC",
      waitingFor: [],
      dependsOnLabels: [],
      startBlockReason: null,
      externalBlockLabel: null,
      qualityBlockLabel: null,
      materialBlockLabel: null,
      plannedTimeLabel: "45 minute",
      actualDurationLabel: "Necunoscut",
    },
    {
      taskId: "assemble",
      scopeLabel: "Ansamblu",
      seqLabel: "02",
      processLabel: "Asamblare",
      status: "PLANNED",
      statusLabel: "Planificată",
      assignmentLabel: "Nealocat",
      executorLabel: null,
      requiredCapabilityLabel: null,
      waitingFor: ["cut"],
      dependsOnLabels: ["Debitare panou"],
      startBlockReason: null,
      externalBlockLabel: null,
      qualityBlockLabel: null,
      materialBlockLabel: null,
      plannedTimeLabel: "30 minute",
      actualDurationLabel: "Necunoscut",
    },
  ],
} as unknown as ExecutionPlanTransport;

describe("JobProductionMap", () => {
  it("uses actual plan scopes and supports selecting operations without performing mutations", () => {
    render(<JobProductionMap plan={plan} jobId="job-synthetic" />);
    expect(screen.getByRole("heading", { name: "Harta producției" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Subansamblele planului" })).toHaveTextContent("Panou ACM");
    expect(screen.getByRole("group", { name: "Subansamblele planului" })).toHaveTextContent("Ansamblu");
    const next = screen.getByRole("button", { name: "Asamblare" });
    fireEvent.click(next);
    expect(screen.getByRole("complementary", { name: "Detaliile operației selectate" }).querySelector("h3")?.textContent).toBe("Asamblare");
    expect(screen.getByText("Dependențe raportate")).toBeInTheDocument();
    expect(screen.getAllByText("Debitare panou").length).toBeGreaterThan(0);
    const predecessor = screen.getByRole("button", { name: "Debitare panou" });
    fireEvent.click(predecessor);
    expect(screen.getByRole("complementary", { name: "Detaliile operației selectate" })
      .querySelector("h3")?.textContent).toBe("Debitare panou");
    expect(screen.getByRole("link", { name: /Deschide planul în Execuție/ })).toHaveAttribute(
      "href", "/executie/plan-synthetic?job=job-synthetic",
    );
  });

  it("keeps navigation truthful when the selected operation has no upstream relation", () => {
    render(<JobProductionMap plan={plan} jobId="job-synthetic" />);
    expect(screen.getByText("Nicio dependență activă identificată.")).toBeInTheDocument();
    const group = screen.getByRole("button", { name: /Ansamblu1 operație/ });
    fireEvent.click(group);
    expect(screen.getByText("Nicio operație nu așteaptă acum această operație.")).toBeInTheDocument();
    expect(screen.getByText("Dependențe raportate")).toBeInTheDocument();
  });

  it("does not fabricate component groups when tasks are missing", () => {
    render(<JobProductionMap plan={{ ...plan, tasks: [] }} jobId="job-empty" />);
    expect(screen.getByText("Planul nu conține operații afișabile.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Subansamblele planului" })).not.toBeInTheDocument();
  });
});
