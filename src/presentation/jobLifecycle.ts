import type { JobListItemTransport } from "../api/types";

export type LifecycleMark = "done" | "current" | "next" | "blocked" | "unavailable";

export type LifecycleStep = {
  id: string;
  label: string;
  mark: LifecycleMark;
  markLabel: string;
};

function markOf(done: boolean, current: boolean): LifecycleMark {
  if (done) {
    return "done";
  }
  if (current) {
    return "current";
  }
  return "next";
}

function markLabel(mark: LifecycleMark): string {
  switch (mark) {
    case "done":
      return "Finalizat";
    case "current":
      return "Acum";
    case "next":
      return "Urmează";
    case "blocked":
      return "Incomplet";
    case "unavailable":
      return "Indisponibil";
    default: {
      const exhaustive: never = mark;
      return exhaustive;
    }
  }
}

/** Steps before the focus are complete. Only the immediate successor is next. */
function marksFor(length: number, focus: number, focusMark: "current" | "blocked" | "done"): LifecycleMark[] {
  return Array.from({ length }, (_, index) => {
    if (focusMark === "done") {
      return "done";
    }
    if (index < focus) {
      return "done";
    }
    if (index === focus) {
      return focusMark;
    }
    if (index === focus + 1) {
      return "next";
    }
    return "unavailable";
  });
}

function step(id: string, label: string, mark: LifecycleMark): LifecycleStep {
  return { id, label, mark, markLabel: markLabel(mark) };
}

const JOURNEY = [
  ["accepted", "Ofertă acceptată"],
  ["created", "Lucrare"],
  ["release", "Pregătire producție"],
  ["plan", "Plan disponibil"],
  ["execution", "Atelier"],
  ["finished", "Producție finalizată"],
] as const;

export function presentJobLifecycle(job: JobListItemTransport): LifecycleStep[] {
  const finished = job.stage === "EXECUTION_COMPLETED";
  const hasPlan = job.planId !== null || finished;
  const incompletePlan =
    !finished && !hasPlan && (job.nextAction === "CREATE_EXECUTION_PLAN" || job.releaseSnapshotId !== null);
  const focus = finished ? 5 : hasPlan ? 4 : incompletePlan ? 3 : 2;
  const focusMark = finished ? "done" : incompletePlan ? "blocked" : "current";
  const marks = marksFor(JOURNEY.length, focus, focusMark);
  return JOURNEY.map(([id, label], index) => step(id, label, marks[index] ?? "unavailable"));
}

export function presentQuoteContinuation(input: {
  accepted: boolean;
  ordered: boolean;
}): LifecycleStep[] {
  return [
    step("accept", "Acceptă oferta", markOf(input.accepted, !input.accepted)),
    step(
      "order",
      "Creează lucrarea",
      markOf(input.ordered, input.accepted && !input.ordered),
    ),
    step("job", "Continuă în lucrare", markOf(false, input.ordered)),
  ];
}
