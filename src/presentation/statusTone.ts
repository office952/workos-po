import type { PresentationTone } from "./foundationProof";

export type StatusKind = "workflow" | "warning" | "danger" | "success";

export function statusTone(kind: StatusKind): PresentationTone {
  switch (kind) {
    case "workflow":
      return "neutral";
    case "warning":
      return "incomplete";
    case "danger":
      return "blocked";
    case "success":
      return "ready";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}
