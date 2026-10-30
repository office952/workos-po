import type { ProcessGraphNodeReadiness } from "../../../adapters/catalogProcessGraphAdapter";

type ProcessNodeProps = {
  label: string;
  scopeLabel: string;
  readiness: ProcessGraphNodeReadiness;
  readinessLabel: string;
  selected: boolean;
  onSelect: () => void;
};

export function ProcessNode({ label, scopeLabel, readiness, readinessLabel, selected, onSelect }: ProcessNodeProps) {
  return (
    <button
      type="button"
      className="process-graph__node"
      data-readiness={readiness}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="process-graph__node-scope">{scopeLabel}</span>
      <span className="process-graph__node-title">
        <OperationMark label={label} />
        <span className="process-graph__node-label">{label}</span>
      </span>
      <span className="process-graph__node-state">{readinessLabel}</span>
    </button>
  );
}

type OperationMarkKind = "cut" | "form" | "power" | "check" | "pack" | "join" | "step";

function markKind(label: string): OperationMarkKind {
  const value = label.toLocaleLowerCase("ro");
  if (value.includes("debit")) return "cut";
  if (value.includes("formar") || value.includes("caset")) return "form";
  if (value.includes("cabl") || value.includes("surs") || value.includes("led") || value.includes("aprind") || value.includes("uniform")) return "power";
  if (value.includes("control")) return "check";
  if (value.includes("ambal")) return "pack";
  if (value.includes("lipire") || value.includes("închid") || value.includes("inchid") || value.includes("prindere")) return "join";
  return "step";
}

function OperationMark({ label }: { label: string }) {
  return (
    <svg className="process-graph__mark" viewBox="0 0 16 16" aria-hidden="true">
      <OperationMarkShape kind={markKind(label)} />
    </svg>
  );
}

function OperationMarkShape({ kind }: { kind: OperationMarkKind }) {
  switch (kind) {
    case "cut":
      return <path d="M2 13 L8 3 L14 13" />;
    case "form":
      return <path d="M2 4 H14 V13 H2 Z" />;
    case "power":
      return <path d="M8 2 V8 M4.5 6.5 A4 4 0 1 0 11.5 6.5" />;
    case "check":
      return <path d="M3 8 L7 12 L13 4" />;
    case "pack":
      return <path d="M3 5 H13 V13 H3 Z M3 5 L8 8 L13 5" />;
    case "join":
      return <path d="M3 8 H13 M8 3 V13" />;
    case "step":
      return <circle cx="8" cy="8" r="2.5" />;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}
