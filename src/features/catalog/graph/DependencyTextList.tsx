import type { ProcessGraphNodeView } from "../../../adapters/catalogProcessGraphAdapter";

type DependencyTextListProps = {
  nodes: readonly ProcessGraphNodeView[];
  steps: ReadonlyMap<string, number>;
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
};

function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} și ${labels[labels.length - 1]}`;
}

/** The route as a list of steps. It replaces the graph on narrow screens. */
export function DependencyTextList({ nodes, steps, selectedNodeId, onSelect }: DependencyTextListProps) {
  const stepCount = Math.max(0, ...nodes.map((node) => steps.get(node.id) ?? 0)) + 1;
  const groups = Array.from({ length: stepCount }, (_, step) => nodes.filter((node) => (steps.get(node.id) ?? 0) === step));
  return (
    <ol className="process-graph__text-list" aria-label="Traseul pe pași">
      {groups.map((group, step) => (
        <li key={step} className="process-graph__step">
          <span className="process-graph__step-number" aria-label={`Pasul ${step + 1}`}>{step + 1}</span>
          <ul>
            {group.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  className="process-graph__text-node"
                  aria-pressed={node.id === selectedNodeId}
                  aria-label={node.processLabel}
                  onClick={() => onSelect(node.id)}
                >
                  <span className="process-graph__dot" data-readiness={node.nodeReadiness} aria-hidden="true" />
                  <span className="process-graph__text-copy">
                    <strong>{node.processLabel}</strong>
                    <small>
                      {node.scopeLabel} · {node.dependsOnLabels.length > 0 ? `după ${joinLabels(node.dependsOnLabels)}` : "fără operație anterioară"}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
