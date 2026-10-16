import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ExecutionPlanTransport, ExecutionTaskTransport } from "../api/types";
import { JobProductionMap } from "./JobProductionMap";

const task = (
  id: string, scopeLabel: string, status = "PLANNED", waitingFor: string[] = [],
): ExecutionTaskTransport => ({
  taskId: id,
  scopeLabel,
  seqLabel: id,
  processLabel: "Operație " + id,
  status,
  statusLabel: status === "IN_PROGRESS" ? "În lucru" : "Planificată",
  assignmentLabel: "Nealocat",
  executorLabel: null,
  requiredCapabilityLabel: null,
  waitingFor,
  dependsOnLabels: waitingFor,
  startBlockReason: null,
  externalBlockLabel: null,
  qualityBlockLabel: null,
  materialBlockLabel: null,
  plannedTimeLabel: "Necunoscut",
  actualDurationLabel: "Necunoscut",
} as unknown as ExecutionTaskTransport);

const plan = (tasks: ExecutionTaskTransport[]): ExecutionPlanTransport => ({
  planId: "plan-synthetic",
  productLabel: "Panou ACM + litere",
  inscription: "NORD",
  progressLabel: "0 / 2",
  progress: {
    completed: 0, total: tasks.length, inProgress: 1, planned: tasks.length - 1,
    outside: 0, waitingDependencies: 1, noProvider: 0, varianceCount: 0,
  },
  tasks,
} as unknown as ExecutionPlanTransport);

const source = plan([
  task("01", "Litere", "IN_PROGRESS"),
  task("02", "Panou ACM", "PLANNED", ["Operație 01 — Litere"]),
]);

describe("JobProductionMap — adaptive dossier", () => {
  it("shows only scopes from the plan, and synchronizes selection with details", () => {
    render(<JobProductionMap plan={source} jobId="job-synthetic" />);
    expect(screen.getByRole("heading", { name: "Ce se întâmplă cu lucrarea" })).toBeInTheDocument();
    const scopes = screen.getByRole("group", { name: "Părțile lucrării" });
    expect(scopes).toHaveTextContent("COMPOZIȚIE");
    expect(scopes).toHaveTextContent("Litere");
    expect(scopes).toHaveTextContent("Panou ACM");
    fireEvent.click(within(scopes).getByRole("button", { name: /Panou ACM/ }));
    expect(screen.getByRole("heading", { name: "Operații · Panou ACM" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Detaliile operației selectate" })).toHaveTextContent("Operație 02");
    expect(screen.getByText("Dependențe raportate")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /VEZI ÎN EXECUȚIE/ })).toHaveAttribute(
      "href", "/executie/plan-synthetic?job=job-synthetic",
    );
  });

  it("does not invent a composition or panel for a single letters job", () => {
    render(<JobProductionMap plan={plan([task("01", "Litere")])} jobId="letters" />);
    const scopes = screen.getByRole("group", { name: "Părțile lucrării" });
    expect(scopes).toHaveTextContent("Litere");
    expect(scopes).not.toHaveTextContent("COMPOZIȚIE");
    expect(scopes).not.toHaveTextContent("Panou ACM");
    const stage = screen.getByLabelText("Reprezentare orientativă a lucrării");
    expect(stage.querySelector(".job-dossier__panel-shape")).toBeNull();
  });

  it("scales to many tasks through pagination and filtering", () => {
    const big = plan(Array.from({ length: 36 }, (_, i) => task(String(i + 1).padStart(2, "0"), "Litere")));
    render(<JobProductionMap plan={big} jobId="bulk" />);
    expect(screen.getByRole("group", { name: "Operațiile filtrate" }).querySelectorAll("button")).toHaveLength(7);
    expect(screen.getByText("1–7 din 36")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pagina următoare" }));
    expect(screen.getByText("8–14 din 36")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Caută operație" }), { target: { value: "36" } });
    expect(screen.getByRole("group", { name: "Operațiile filtrate" }).querySelectorAll("button")).toHaveLength(1);
    expect(screen.getByText("1–1 din 1")).toBeInTheDocument();
  });

  it("keeps readable dependency labels without manufacturing fake links", () => {
    render(<JobProductionMap plan={source} jobId="real-label-contract" />);
    fireEvent.click(screen.getByRole("group", { name: "Părțile lucrării" })
      .querySelectorAll("button")[2]);
    expect(screen.getByText("Operație 01 — Litere")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Operație 01 — Litere" })).not.toBeInTheDocument();
  });

  it("shows a factual empty plan", () => {
    render(<JobProductionMap plan={plan([])} jobId="empty" />);
    expect(screen.getByText("Planul nu conține operații afișabile.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Părțile lucrării" })).not.toBeInTheDocument();
  });
});
