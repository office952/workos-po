import { useId, useMemo } from "react";
import type { ProcessGraphView } from "../../../adapters/catalogProcessGraphAdapter";
import { DependencyTextList } from "./DependencyTextList";
import { GraphInspector } from "./GraphInspector";
import { ProcessNode } from "./ProcessNode";
import { useGraphSelection, type GraphViewMode } from "./useGraphSelection";

const COLUMN = 196;
const ROW = 88;

type ProductProcessGraphProps = {
  view: ProcessGraphView;
};

export function ProductProcessGraph({ view }: ProductProcessGraphProps) {
  const ordered = useMemo(
    () => view.topologicalOrder
      .map((id) => view.nodes.find((node) => node.id === id))
      .filter((node): node is ProcessGraphView["nodes"][number] => Boolean(node)),
    [view.nodes, view.topologicalOrder],
  );
  const selection = useGraphSelection(view.topologicalOrder);
  const activeEdgeIds = selection.viewMode === "SIMPLIFIED" ? view.simplifiedEdgeIds : view.directEdgeIds;
  const placed = useMemo(() => placeNodes(ordered, view.edges), [ordered, view.edges]);
  const selected = view.nodes.find((node) => node.id === selection.selectedNodeId) ?? null;
  const width = Math.max(...placed.map((item) => item.x), 0) + COLUMN;
  const height = Math.max(...placed.map((item) => item.y), 0) + ROW;
  const markerId = useId().replace(/:/g, "");

  return (
    <div className="process-graph__board">
      <div className="process-graph__modes" role="group" aria-label="Modul de afișare">
        <ModeButton mode="SIMPLIFIED" current={selection.viewMode} onSelect={selection.setViewMode} label="Simplificat" />
        <ModeButton mode="DIRECT" current={selection.viewMode} onSelect={selection.setViewMode} label="Toate relațiile" />
        <button type="button" onClick={selection.zoomOut}>Micșorează</button>
        <button type="button" onClick={selection.zoomIn}>Mărește</button>
      </div>
      {selection.viewMode === "SIMPLIFIED" ? (
        <p className="ui-note">Relații ascunse pentru că sunt deja implicate: {view.hiddenEdgeCount}. Săgeata intră în operația care urmează.</p>
      ) : (
        <p className="ui-note">Toate relațiile directe ale motorului. Săgeata intră în operația care urmează.</p>
      )}
      <p className="ui-note">Operațiile din prima coloană nu au o operație anterioară și pot începe independent.</p>
      <div className="process-graph__stage-row">
        <div
          className="process-graph__stage"
          aria-label="Harta traseului"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowRight") {
              event.preventDefault();
              selection.move(1);
            } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
              event.preventDefault();
              selection.move(-1);
            }
          }}
        >
          <div className="process-graph__canvas" style={{ width, height, transform: `scale(${selection.zoom})` }}>
            <svg className="process-graph__edges" width={width} height={height} aria-hidden="true">
              <defs>
                <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0 0 L8 4 L0 8 Z" />
                </marker>
              </defs>
              {view.edges.filter((edge) => activeEdgeIds.includes(edge.id)).map((edge) => {
                const from = placed.find((item) => item.id === edge.fromNodeId);
                const to = placed.find((item) => item.id === edge.toNodeId);
                if (!from || !to) return null;
                return (
                  <line
                    key={edge.id}
                    markerEnd={`url(#${markerId})`}
                    x1={from.x + 168}
                    y1={from.y + 36}
                    x2={to.x - 4}
                    y2={to.y + 36}
                  />
                );
              })}
            </svg>
            {placed.map((item) => (
              <div key={item.id} className="process-graph__slot" style={{ left: item.x, top: item.y }}>
                <ProcessNode
                  label={item.node.processLabel}
                  scopeLabel={item.node.scopeLabel}
                  readiness={item.node.nodeReadiness}
                  readinessLabel={item.node.nodeReadinessLabel}
                  selected={item.id === selection.selectedNodeId}
                  onSelect={() => selection.select(item.id)}
                />
              </div>
            ))}
          </div>
        </div>
        <GraphInspector node={selected} />
      </div>
      <DependencyTextList
        nodes={ordered}
        selectedNodeId={selection.selectedNodeId}
        onSelect={selection.select}
      />
    </div>
  );
}

function ModeButton({
  mode,
  current,
  label,
  onSelect,
}: {
  mode: GraphViewMode;
  current: GraphViewMode;
  label: string;
  onSelect: (mode: GraphViewMode) => void;
}) {
  return (
    <button type="button" aria-pressed={current === mode} onClick={() => onSelect(mode)}>
      {label}
    </button>
  );
}

function placeNodes(
  nodes: ProcessGraphView["nodes"],
  edges: ProcessGraphView["edges"],
): { id: string; x: number; y: number; node: ProcessGraphView["nodes"][number] }[] {
  const rank = new Map(nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    for (const edge of edges) {
      const next = (rank.get(edge.fromNodeId) ?? 0) + 1;
      if (next > (rank.get(edge.toNodeId) ?? 0)) {
        rank.set(edge.toNodeId, next);
      }
    }
  }
  const used = new Map<number, number>();
  return nodes.map((node) => {
    const column = rank.get(node.id) ?? 0;
    const row = used.get(column) ?? 0;
    used.set(column, row + 1);
    return { id: node.id, x: column * COLUMN, y: row * ROW, node };
  });
}
