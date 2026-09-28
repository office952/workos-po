import type { ReactNode } from "react";

export type StateNoticeKind =
  | "empty"
  | "loading"
  | "error"
  | "blocked"
  | "read-only"
  | "disabled"
  | "complete"
  | "no-selection";

type StateNoticeProps = {
  kind: StateNoticeKind;
  title: string;
  reason: string;
  action?: ReactNode;
};

function kindLabel(kind: StateNoticeKind): string {
  switch (kind) {
    case "empty":
      return "Gol";
    case "loading":
      return "Se încarcă";
    case "error":
      return "Eroare";
    case "blocked":
      return "Blocat";
    case "read-only":
      return "Doar citire";
    case "disabled":
      return "Indisponibil";
    case "complete":
      return "Finalizat";
    case "no-selection":
      return "Nicio selecție";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function noticeRole(kind: StateNoticeKind): "status" | "alert" {
  switch (kind) {
    case "error":
    case "blocked":
      return "alert";
    case "empty":
    case "loading":
    case "read-only":
    case "disabled":
    case "complete":
    case "no-selection":
      return "status";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function StateNotice({ kind, title, reason, action }: StateNoticeProps) {
  return (
    <div className={`state-notice state-notice--${kind}`} role={noticeRole(kind)}>
      <p className="state-notice__kind">{kindLabel(kind)}</p>
      <p className="state-notice__title">{title}</p>
      <p className="state-notice__reason">{reason}</p>
      {action ? <div className="state-notice__action">{action}</div> : null}
    </div>
  );
}
