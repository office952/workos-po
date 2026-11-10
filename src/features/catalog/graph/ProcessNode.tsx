import type { ProcessGraphNodeReadiness } from "../../../adapters/catalogProcessGraphAdapter";

type ProcessNodeProps = {
  label: string;
  scopeLabel: string;
  readiness: ProcessGraphNodeReadiness;
  readinessLabel: string;
  selected: boolean;
  onSelect: () => void;
};

/** One operation on the route. The lane names the scope; the dot and the hidden text give the state. */
export function ProcessNode({ label, scopeLabel, readiness, readinessLabel, selected, onSelect }: ProcessNodeProps) {
  return (
    <button
      type="button"
      className="process-graph__node"
      data-readiness={readiness}
      aria-pressed={selected}
      aria-label={`${label} · ${scopeLabel} · ${readinessLabel}`}
      title={`${scopeLabel} · ${readinessLabel}`}
      onClick={onSelect}
    >
      <span className="process-graph__dot" data-readiness={readiness} aria-hidden="true" />
      <span className="process-graph__node-label">{label}</span>
    </button>
  );
}
