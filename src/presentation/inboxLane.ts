import type { InboxTaskTransport } from "../api/types";

export type InboxLane = "ready" | "next" | "blocked";

export type InboxLanePresentation = {
  lane: InboxLane;
  laneLabel: string;
  actionLabel: string;
};

export function presentInboxLane(task: InboxTaskTransport): InboxLanePresentation {
  if (task.lane === "blocked_material") {
    return {
      lane: "blocked",
      laneLabel: "Material",
      actionLabel: "Deschide execuția",
    };
  }
  if (task.canClaimStart) {
    return {
      lane: "ready",
      laneLabel: task.statusLabel,
      actionLabel: "Deschide execuția",
    };
  }
  return {
    lane: "next",
    laneLabel: task.statusLabel,
    actionLabel: "Deschide execuția",
  };
}
