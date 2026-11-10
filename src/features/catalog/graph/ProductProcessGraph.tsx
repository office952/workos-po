import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ProcessGraphNodeReadiness, ProcessGraphView } from "../../../adapters/catalogProcessGraphAdapter";
import { countNoun } from "../catalogStructure";
import { DependencyTextList } from "./DependencyTextList";
import { GraphInspector } from "./GraphInspector";
import { ProcessNode } from "./ProcessNode";
import { edgePath, LANE_LABEL_WIDTH, LANE_ROW_HEIGHT, layoutProcess, stepOf } from "./processLayout";
import { useGraphSelection, type GraphViewMode } from "./useGraphSelection";

const DEFAULT_WIDTH = 1344;

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
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) setAvailable(Math.floor(width));
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  const layout = useMemo(() => layoutProcess(ordered, view.edges, available), [ordered, view.edges, available]);
  const steps = useMemo(() => stepOf(ordered, view.edges), [ordered, view.edges]);
  const selected = view.nodes.find((node) => node.id === selection.selectedNodeId) ?? null;
  const markerId = useId().replace(/:/g, "");
  const readinessGroups = useMemo(() => {
    const groups = new Map<ProcessGraphNodeReadiness, { label: string; count: number }>();
    for (const node of ordered) {
      const current = groups.get(node.nodeReadiness);
      groups.set(node.nodeReadiness, { label: node.nodeReadinessLabel, count: (current?.count ?? 0) + 1 });
    }
    return [...groups.entries()];
  }, [ordered]);

  return (
    <div className="process-graph__board">
      <div className="process-graph__route-head">
        <h3 className="catv2-h3">Traseu <span className="catv2-count">{countNoun(ordered.length, "operație", "operații")} · {countNoun(layout.steps, "pas", "pași")}</span></h3>
        <div className="process-graph__modes" role="group" aria-label="Modul de afișare">
          <ModeButton mode="SIMPLIFIED" current={selection.viewMode} onSelect={selection.setViewMode} label="Simplificat" />
          <ModeButton mode="DIRECT" current={selection.viewMode} onSelect={selection.setViewMode} label="Toate relațiile" />
          <span className="process-graph__zoom">
            <button type="button" className="catv2-chip" aria-label="Micșorează" onClick={selection.zoomOut}>−</button>
            <button type="button" className="catv2-chip" aria-label="Mărește" onClick={selection.zoomIn}>+</button>
          </span>
        </div>
      </div>
      <div
        className="process-graph__stage"
        ref={stageRef}
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
        <div className="process-graph__canvas" style={{ width: layout.width, height: layout.height + 36, transform: `scale(${selection.zoom})` }}>
          <div className="process-graph__steps" aria-hidden="true" style={{ height: 36 }}>
            <span style={{ width: LANE_LABEL_WIDTH }}>Pasul</span>
            {Array.from({ length: layout.steps }, (_, index) => (
              <span key={index} style={{ width: layout.columnWidth }}>{index + 1}</span>
            ))}
          </div>
          <div className="process-graph__lanes" style={{ height: layout.height }}>
            {layout.lanes.map((lane) => (
              <div key={lane.label} className="process-graph__lane" style={{ top: lane.top, height: lane.rows * LANE_ROW_HEIGHT }}>
                <span>{lane.label}</span>
              </div>
            ))}
            <svg className="process-graph__edges" width={layout.width} height={layout.height} aria-hidden="true">
              <defs>
                <marker id={markerId} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0 0 L7 3.5 L0 7 Z" />
                </marker>
              </defs>
              {view.edges.filter((edge) => activeEdgeIds.includes(edge.id)).map((edge) => {
                const from = layout.nodes.find((item) => item.id === edge.fromNodeId);
                const to = layout.nodes.find((item) => item.id === edge.toNodeId);
                if (!from || !to) return null;
                const active = selection.selectedNodeId !== null && (edge.fromNodeId === selection.selectedNodeId || edge.toNodeId === selection.selectedNodeId);
                return (
                  <path
                    key={edge.id}
                    className="process-graph__edge"
                    data-active={active ? "true" : undefined}
                    markerEnd={`url(#${markerId})`}
                    d={edgePath(from, to, layout.nodeWidth)}
                  />
                );
              })}
            </svg>
            {layout.nodes.map((item) => (
              <div key={item.id} className="process-graph__slot" style={{ left: item.x, top: item.y, width: layout.nodeWidth }}>
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
      </div>
      <DependencyTextList
        nodes={ordered}
        steps={steps}
        selectedNodeId={selection.selectedNodeId}
        onSelect={selection.select}
      />
      <div className="process-graph__legend">
        <ul>
          {readinessGroups.map(([readiness, group]) => (
            <li key={readiness}>
              <span className="process-graph__dot" data-readiness={readiness} aria-hidden="true" />
              {group.label} · {group.count}
            </li>
          ))}
        </ul>
        <p>
          {selection.viewMode === "SIMPLIFIED"
            ? `Relații ascunse pentru că sunt deja implicate: ${view.hiddenEdgeCount}. Săgeata intră în operația care urmează.`
            : "Toate relațiile directe ale motorului. Săgeata intră în operația care urmează."}
        </p>
      </div>
      <GraphInspector node={selected} />
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
    <button type="button" className="catv2-chip" aria-pressed={current === mode} onClick={() => onSelect(mode)}>
      {label}
    </button>
  );
}
