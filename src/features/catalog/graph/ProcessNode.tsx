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
      <span className="process-graph__node-label">{label}</span>
      <span className="process-graph__node-state">{readinessLabel}</span>
    </button>
  );
}
