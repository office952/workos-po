import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { JobIssue, JobRecord, WorkHoursTask } from "../../api/jobRecord";
import type { JobSheetSection } from "../../routing/appRoute";
import { jobRecordFixture } from "../../test/jobRecordFixture";
import { JobRecordView } from "../JobRecordView";

function task(over: Partial<WorkHoursTask> & Pick<WorkHoursTask, "taskId" | "seqLabel" | "processLabel" | "scopeLabel" | "status" | "statusLabel">): WorkHoursTask {
  return {
    completedQuantityLabel: null,
    varianceLabel: null,
    providerLabel: null,
    externalProviderLabel: null,
    actualConsumption: [],
    startedAt: null,
    completedAt: null,
    timeLabel: "Neînregistrat",
    complete: over.status === "COMPLETED",
    coverageLabel: "Fără sesiuni înregistrate",
    activeSessionCount: 0,
    provisional: false,
    undocumented: false,
    evidenceGap: null,
    evidenceGapLabel: null,
    declaredDurationLabel: null,
    machineTimeLabel: null,
    people: [],
    sessions: [],
    ...over,
  };
}

function recordWith(tasks: WorkHoursTask[], hoursOver: Partial<NonNullable<JobRecord["hours"]>> = {}): JobRecord {
  return {
    ...jobRecordFixture,
    hours: {
      ...jobRecordFixture.hours!,
      totalLabel: "ORE MUNCA",
      elapsedLabel: "DURATA CALENDAR",
      machineTimeLabel: "ORE UTILAJ",
      tasks,
      ...hoursOver,
    },
  };
}

const planned = [
  task({ taskId: "t1", seqLabel: "01", processLabel: "Debitare", scopeLabel: "Față", status: "PLANNED", statusLabel: "Planificat" }),
  task({ taskId: "t2", seqLabel: "02", processLabel: "Frezare", scopeLabel: "Față", status: "PLANNED", statusLabel: "Planificat" }),
  task({ taskId: "t3", seqLabel: "03", processLabel: "Vopsire", scopeLabel: "Cant", status: "PLANNED", statusLabel: "Planificat" }),
];

const idle = task({
  taskId: "t4", seqLabel: "04", processLabel: "Lipire", scopeLabel: "Ansamblu", status: "IN_PROGRESS", statusLabel: "În lucru",
  timeLabel: "40 min", coverageLabel: "În lucru · fără sesiuni active",
});

const done = task({
  taskId: "t5", seqLabel: "05", processLabel: "Control", scopeLabel: "Ansamblu", status: "COMPLETED", statusLabel: "Finalizat",
  timeLabel: "1 h 15 min", startedAt: "2026-10-20T08:00:00Z", completedAt: "2026-10-20T09:10:00Z",
});

const plan = recordWith([...planned, idle, done]);

function View({ record, section, initialTask = null }: { record: JobRecord; section: JobSheetSection; initialTask?: string | null }) {
  const [taskId, setTaskId] = useState<string | null>(initialTask);
  return (
    <JobRecordView
      section={section}
      record={record}
      canWriteFiles={false}
      operationHref={(id) => `/lucrari/job-1?task=${id}&sectiune=operatii`}
      selectedTaskId={section === "operatii" ? taskId : null}
      selectedLabel={null}
      invalidTask={false}
      planUnavailable={false}
      workspaceHref={null}
      onOpenTask={setTaskId}
      onCloseTask={() => setTaskId(null)}
      dossier={null}
      dates={null}
    />
  );
}

function operationNames() {
  const register = screen.getByRole("table", { name: "Registrul operațiilor" });
  return within(register).getAllByRole("button").map((button) => button.textContent);
}

describe("N-010 job sheet UX correction", () => {
  it("shows an in-progress operation without an active session, before the hour totals", () => {
    const live = task({
      taskId: "t6", seqLabel: "06", processLabel: "Montaj", scopeLabel: "Litere", status: "IN_PROGRESS", statusLabel: "În lucru",
      activeSessionCount: 1, provisional: true, timeLabel: "12 min",
      people: [{ personId: "ion", label: "Ion", timeLabel: "12 min", active: true }],
      sessions: [{ sessionId: "s-live", personId: "ion", personLabel: "Ion", startedAt: "2026-10-21T09:00:00Z", endedAt: null, timeLabel: "12 min", endKind: null }],
    });
    render(<View record={recordWith([idle, live])} section="situatie" />);
    const activity = screen.getByRole("region", { name: "Activitate în curs" });
    const metrics = document.querySelector(".job-record__metrics")!;
    expect(activity.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const waiting = within(activity).getByRole("heading", { name: "04 · Lipire" }).closest("article")!;
    expect(within(waiting).getByText("Ansamblu")).toBeVisible();
    expect(within(waiting).getByText("În lucru")).toBeVisible();
    expect(within(waiting).getByText("Fără sesiuni active")).toBeVisible();
    expect(within(waiting).queryByText("Sesiune activă")).toBeNull();
    expect(within(waiting).getByRole("link", { name: "Deschide operația 04 · Lipire" })).toHaveAttribute("href", "/lucrari/job-1?task=t4&sectiune=operatii");
    const working = within(activity).getByRole("heading", { name: "06 · Montaj" }).closest("article")!;
    expect(within(working).getByText("În lucru")).toBeVisible();
    expect(within(working).getByText("Sesiune activă")).toBeVisible();
    expect(within(working).getByText("Litere")).toBeVisible();
    expect(screen.queryByText(/Blocată/)).toBeNull();
  });

  it("keeps calendar duration apart from recorded work hours and machine time", () => {
    render(<View record={plan} section="situatie" />);
    const work = screen.getByText("Ore de muncă înregistrate").parentElement!;
    const calendar = screen.getByText("De la început la final").parentElement!;
    const machine = screen.getByText("Timp utilaj înregistrat").parentElement!;
    expect(work).toHaveTextContent("ORE MUNCA");
    expect(work).not.toHaveTextContent("DURATA CALENDAR");
    expect(calendar).toHaveTextContent("DURATA CALENDAR");
    expect(calendar).not.toHaveTextContent("ORE MUNCA");
    expect(machine).toHaveTextContent("ORE UTILAJ");
    expect(machine).not.toHaveTextContent("ORE MUNCA");
    expect(screen.getByText(/Durata calendaristică pornește/)).toBeVisible();
  });

  it("offers three planned operations from the existing planned status, without changing the overall totals", async () => {
    const user = userEvent.setup();
    render(<View record={plan} section="operatii" />);
    const filters = screen.getByRole("group", { name: "Filtrează operațiile" });
    expect(within(filters).getByRole("button", { name: "Toate · 5" })).toHaveAttribute("aria-pressed", "true");
    expect(within(filters).getByRole("button", { name: "Planificate · 3" })).toBeVisible();
    await user.click(within(filters).getByRole("button", { name: "Planificate · 3" }));
    expect(operationNames()).toEqual(["01 · Debitare", "02 · Frezare", "03 · Vopsire"]);
    expect(screen.getByText("3 rezultate")).toBeVisible();
    const register = screen.getByRole("table", { name: "Registrul operațiilor" });
    const totals = within(register).getAllByText("ORE MUNCA");
    expect(totals.length).toBeGreaterThan(0);
    expect(within(register).getByText(/ORE UTILAJ/)).toBeVisible();
    expect(within(filters).getByRole("button", { name: "Toate · 5" })).toBeVisible();
  });

  it("counts a search combined with a filter without shrinking the status totals", async () => {
    const user = userEvent.setup();
    render(<View record={plan} section="operatii" />);
    const filters = screen.getByRole("group", { name: "Filtrează operațiile" });
    await user.click(within(filters).getByRole("button", { name: "Planificate · 3" }));
    await user.type(screen.getByRole("searchbox", { name: "Caută operație, componentă sau persoană" }), "Debit");
    expect(operationNames()).toEqual(["01 · Debitare"]);
    expect(screen.getByText("1 rezultat")).toBeVisible();
    expect(within(filters).getByRole("button", { name: "Toate · 5" })).toBeVisible();
    expect(within(filters).getByRole("button", { name: "Planificate · 3" })).toHaveAttribute("aria-pressed", "true");
    expect(within(filters).getByRole("button", { name: "În lucru · 1" })).toBeVisible();
    expect(within(filters).getByRole("button", { name: "Finalizate · 1" })).toBeVisible();
  });

  it("says when a search matches nothing and keeps the recorded totals", async () => {
    const user = userEvent.setup();
    render(<View record={plan} section="operatii" />);
    await user.type(screen.getByRole("searchbox", { name: "Caută operație, componentă sau persoană" }), "inexistent");
    expect(screen.getByText("0 rezultate")).toBeVisible();
    expect(screen.getByText("Nicio operație nu corespunde filtrelor.")).toBeVisible();
    expect(screen.queryByText(/Blocată/)).toBeNull();
    const register = screen.getByRole("table", { name: "Registrul operațiilor" });
    expect(within(register).getByText("ORE MUNCA")).toBeVisible();
    expect(within(register).queryByRole("button")).toBeNull();
    expect(screen.getByRole("button", { name: "Toate · 5" })).toBeVisible();
  });

  it("keeps technological order when statuses differ", () => {
    render(<View record={plan} section="operatii" />);
    expect(operationNames()).toEqual(["01 · Debitare", "02 · Frezare", "03 · Vopsire", "04 · Lipire", "05 · Control"]);
    const lipire = screen.getByRole("button", { name: "04 · Lipire" }).closest("tr")!;
    expect(within(lipire).getByText("În lucru")).toBeVisible();
    expect(within(lipire).getByText("Fără sesiuni active")).toBeVisible();
    expect(within(lipire).queryByText(/Blocată/)).toBeNull();
  });

  it("keeps the selected operation, its neighbours and keyboard focus when the dossier opens and closes", async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    const user = userEvent.setup();
    render(<View record={plan} section="operatii" />);
    await user.click(screen.getByRole("button", { name: "04 · Lipire" }));
    const switcher = screen.getByRole("navigation", { name: "Comutator operații" });
    expect(within(switcher).getByText("Operația 04 din 5 · Ansamblu")).toBeVisible();
    expect(within(switcher).getByRole("button", { name: /Anterioara/ })).toHaveTextContent("03 · Vopsire");
    expect(within(switcher).getByRole("button", { name: /Următoarea/ })).toHaveTextContent("05 · Control");
    expect(screen.getByRole("region", { name: "Dosarul operației selectate" })).toBeVisible();
    expect(scroll).not.toHaveBeenCalled();
    const close = screen.getByRole("button", { name: "Închide detaliul" });
    close.focus();
    await user.keyboard("{Enter}");
    const returned = screen.getByRole("button", { name: "04 · Lipire" });
    await waitFor(() => expect(returned).toHaveFocus());
    expect(returned).toHaveAttribute("aria-expanded", "false");
    expect(operationNames()).toEqual(["01 · Debitare", "02 · Frezare", "03 · Vopsire", "04 · Lipire", "05 · Control"]);
  });

  it("lists reported issues on the job situation with the affected operation", () => {
    const issue: JobIssue = {
      entryId: "iss-1",
      taskId: "t4",
      taskLabel: "04 · Lipire · Ansamblu",
      body: "Vibrație anormală CNC. Am oprit lucrul.",
      reasonCode: "MACHINE",
      reasonLabel: "Utilaj",
      status: "OPEN",
      statusLabel: "Deschisă",
      authorLabel: "Florin CNC",
      createdAt: "2026-11-07T09:00:00.000Z",
      acknowledgedAt: null,
      acknowledgedByLabel: null,
      resolvedAt: null,
      resolvedByLabel: null,
      canAcknowledge: true,
      canResolve: true,
      history: [
        {
          kind: "ISSUE_REPORTED",
          label: "Problemă semnalată",
          actorLabel: "Florin CNC",
          occurredAt: "2026-11-07T09:00:00.000Z",
        },
      ],
    };
    render(<View record={{ ...plan, issues: [issue] }} section="situatie" />);
    const issues = screen.getByRole("region", { name: "Probleme semnalate" });
    expect(within(issues).getByText("Deschisă")).toBeVisible();
    expect(within(issues).getByText("Vibrație anormală CNC. Am oprit lucrul.")).toBeVisible();
    expect(within(issues).getByRole("link", { name: "04 · Lipire · Ansamblu" })).toHaveAttribute(
      "href",
      "/lucrari/job-1?task=t4&sectiune=operatii",
    );
    expect(within(issues).getByRole("button", { name: "Preia problema" })).toBeVisible();
    expect(within(issues).getByRole("button", { name: "Marchează rezolvată" })).toBeVisible();
  });

  it("lists a job that has no plan without turning the absence into a blockage", () => {
    const bare = { ...jobRecordFixture, hours: null };
    const { rerender } = render(<View record={bare} section="situatie" />);
    expect(screen.getByText("Evidența orelor, a duratei calendaristice și a timpului de utilaj nu este disponibilă.")).toBeVisible();
    expect(screen.queryByText(/Blocată/)).toBeNull();
    rerender(<View record={bare} section="operatii" />);
    expect(screen.getByText("Planul de execuție nu există încă.")).toBeVisible();
    expect(screen.queryByRole("table", { name: "Registrul operațiilor" })).toBeNull();
  });

  it("filters finished operations and leaves the others in the plan totals", async () => {
    const user = userEvent.setup();
    render(<View record={plan} section="operatii" />);
    await user.click(screen.getByRole("button", { name: "Finalizate · 1" }));
    expect(operationNames()).toEqual(["05 · Control"]);
    expect(screen.getByText("1 rezultat")).toBeVisible();
    const row = screen.getByRole("button", { name: "05 · Control" }).closest("tr")!;
    expect(within(row).getByText("Finalizat")).toBeVisible();
    expect(within(row).queryByText("Fără sesiuni active")).toBeNull();
    expect(screen.getByRole("button", { name: "Toate · 5" })).toBeVisible();
    expect(within(screen.getByRole("table", { name: "Registrul operațiilor" })).getAllByText("ORE MUNCA").length).toBeGreaterThan(0);
  });
});
