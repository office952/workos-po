import type { InboxTaskLane, InboxTaskTransport } from "../api/types";
import type { StatusKind } from "./statusTone";

export type InboxLane =
  | "in_progress_mine"
  | "ready"
  | "needs_provider"
  | "waiting"
  | "blocked";

export type InboxLanePresentation = {
  lane: InboxLane;
  laneLabel: string;
  reason: string;
  actionLabel: string;
  tone: StatusKind;
};

const LANE_LABEL: Record<InboxLane, string> = {
  in_progress_mine: "În lucru de tine",
  ready: "Poate fi pornită",
  needs_provider: "Necesită alocare utilaj / zonă",
  waiting: "Așteaptă dependențe",
  blocked: "Material blocant",
};

const LANE_TONE: Record<InboxLane, StatusKind> = {
  in_progress_mine: "workflow",
  ready: "success",
  needs_provider: "warning",
  waiting: "warning",
  blocked: "danger",
};

export function presentInboxLane(task: InboxTaskTransport): InboxLanePresentation {
  const lane = presentLane(task.lane);
  return {
    lane,
    laneLabel: LANE_LABEL[lane],
    reason: presentInboxReason(task, lane),
    actionLabel: "Deschide execuția",
    tone: LANE_TONE[lane],
  };
}

export function inboxLaneLabel(lane: InboxTaskLane): string {
  return LANE_LABEL[presentLane(lane)];
}

export function presentInboxContext(task: InboxTaskTransport): string {
  const customer = task.customerDisplayName.trim();
  const product = task.productLabel.trim();
  const inscription = task.inscription.trim();
  const parts = [customer, product];
  if (inscription && inscription !== product && inscription !== customer) {
    parts.push(inscription);
  }
  return parts.filter((part, index, all) => part !== "" && all.indexOf(part) === index).join(" · ");
}

function presentLane(lane: InboxTaskLane): InboxLane {
  switch (lane) {
    case "in_progress_mine":
      return "in_progress_mine";
    case "available_ready":
      return "ready";
    case "available_needs_provider":
      return "needs_provider";
    case "waiting_dependencies":
      return "waiting";
    case "blocked_material":
      return "blocked";
    default: {
      const exhaustive: never = lane;
      return exhaustive;
    }
  }
}

function presentInboxReason(task: InboxTaskTransport, lane: InboxLane): string {
  switch (lane) {
    case "in_progress_mine":
      return task.providerLabel
        ? `În lucru de tine · ${task.providerLabel}`
        : "În lucru de tine";
    case "ready":
      return "Poate fi pornită";
    case "needs_provider":
      return task.requiredCapabilityLabel
        ? `Necesită alocare: ${task.requiredCapabilityLabel}`
        : "Necesită alocare utilaj / zonă";
    case "waiting":
      return task.waitingForLabels.length > 0
        ? `Așteaptă: ${task.waitingForLabels.join(", ")}`
        : "Așteaptă dependențe";
    case "blocked":
      return task.materialBlockLabel ?? "Material blocant";
    default: {
      const exhaustive: never = lane;
      return exhaustive;
    }
  }
}
