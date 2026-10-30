import type { ProcessGraphNodeView } from "../../../adapters/catalogProcessGraphAdapter";

type DependencyTextListProps = {
  nodes: readonly ProcessGraphNodeView[];
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
};

export function DependencyTextList({ nodes, selectedNodeId, onSelect }: DependencyTextListProps) {
  return (
    <ol className="process-graph__text-list">
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            className="process-graph__text-node"
            aria-pressed={node.id === selectedNodeId}
            onClick={() => onSelect(node.id)}
          >
            {node.processLabel}
          </button>
          <p>
            Depinde de: {node.dependsOnLabels.length > 0 ? node.dependsOnLabels.join(", ") : "nimic"}
          </p>
          <p>
            Urmează: {node.successorLabels.length > 0 ? node.successorLabels.join(", ") : "nimic"}
          </p>
        </li>
      ))}
    </ol>
  );
}
