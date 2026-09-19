import type { JobListItemTransport } from "../api/types";

export type LifecycleMark = "done" | "current" | "next";

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
    default: {
      const exhaustive: never = mark;
      return exhaustive;
    }
  }
}

function step(id: string, label: string, mark: LifecycleMark): LifecycleStep {
  return { id, label, mark, markLabel: markLabel(mark) };
}

export function presentJobLifecycle(job: JobListItemTransport): LifecycleStep[] {
  const complete = job.stage === "EXECUTION_COMPLETED";
  const planned = job.planId !== null || complete;
  const releasing = job.nextAction === "RELEASE_TO_PRODUCTION";
  const creatingPlan = job.nextAction === "CREATE_EXECUTION_PLAN";
  const released =
    job.releaseSnapshotId !== null || creatingPlan || planned || complete;
  const executing = planned && !complete;

  return [
    step("accepted", "Ofertă acceptată", "done"),
    step("created", "Lucrare creată", "done"),
    step("release", "Eliberare în producție", markOf(released && !releasing, releasing)),
    step("plan", "Plan de execuție", markOf(planned && !creatingPlan, creatingPlan)),
    step("execution", "Atelier / execuție", markOf(complete, executing)),
  ];
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
