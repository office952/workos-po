import type { ProcessGraphView } from "../../../adapters/catalogProcessGraphAdapter";

type GraphNode = ProcessGraphView["nodes"][number];

export type ProcessLane = { label: string; top: number; rows: number };

export type PlacedNode = {
  id: string;
  node: GraphNode;
  step: number;
  lane: number;
  x: number;
  y: number;
};

export type ProcessLayout = {
  steps: number;
  lanes: ProcessLane[];
  nodes: PlacedNode[];
  width: number;
  height: number;
  columnWidth: number;
  nodeWidth: number;
};

export const LANE_LABEL_WIDTH = 120;
export const LANE_ROW_HEIGHT = 78;
export const NODE_HEIGHT = 56;
const COLUMN_MIN = 108;
const COLUMN_MAX = 176;
const NODE_GAP = 16;

/** Step of every operation: one more than the latest operation it waits for. Presentation only. */
export function stepOf(nodes: readonly GraphNode[], edges: ProcessGraphView["edges"]): Map<string, number> {
  const rank = new Map(nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    for (const edge of edges) {
      const next = (rank.get(edge.fromNodeId) ?? 0) + 1;
      if (rank.has(edge.toNodeId) && next > (rank.get(edge.toNodeId) ?? 0)) rank.set(edge.toNodeId, next);
    }
  }
  return rank;
}

/** Lanes by scope, columns by step. The column width follows the space available, within limits. */
export function layoutProcess(nodes: readonly GraphNode[], edges: ProcessGraphView["edges"], availableWidth: number): ProcessLayout {
  const rank = stepOf(nodes, edges);
  const steps = Math.max(0, ...nodes.map((node) => rank.get(node.id) ?? 0)) + 1;
  const laneLabels: string[] = [];
  for (const node of nodes) {
    if (!laneLabels.includes(node.scopeLabel)) laneLabels.push(node.scopeLabel);
  }
  const columnWidth = Math.min(COLUMN_MAX, Math.max(COLUMN_MIN, Math.floor((availableWidth - LANE_LABEL_WIDTH) / steps)));
  const nodeWidth = columnWidth - NODE_GAP;
  const used = new Map<string, number>();
  const draft = nodes.map((node) => {
    const lane = laneLabels.indexOf(node.scopeLabel);
    const step = rank.get(node.id) ?? 0;
    const key = `${lane}:${step}`;
    const slot = used.get(key) ?? 0;
    used.set(key, slot + 1);
    return { node, lane, step, slot };
  });
  const lanes: ProcessLane[] = [];
  let top = 0;
  laneLabels.forEach((label, lane) => {
    const rows = Math.max(1, ...draft.filter((item) => item.lane === lane).map((item) => item.slot + 1));
    lanes.push({ label, top, rows });
    top += rows * LANE_ROW_HEIGHT;
  });
  return {
    steps,
    lanes,
    columnWidth,
    nodeWidth,
    width: LANE_LABEL_WIDTH + steps * columnWidth,
    height: top,
    nodes: draft.map((item) => ({
      id: item.node.id,
      node: item.node,
      step: item.step,
      lane: item.lane,
      x: LANE_LABEL_WIDTH + item.step * columnWidth,
      y: (lanes[item.lane]?.top ?? 0) + item.slot * LANE_ROW_HEIGHT + (LANE_ROW_HEIGHT - NODE_HEIGHT) / 2,
    })),
  };
}

/** Right-angle connector from the right edge of one operation to the left edge of the next. */
export function edgePath(from: PlacedNode, to: PlacedNode, nodeWidth: number): string {
  const x1 = from.x + nodeWidth;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x - 2;
  const y2 = to.y + NODE_HEIGHT / 2;
  if (y1 === y2) return `M${x1} ${y1} H${x2}`;
  const turn = x2 - 9;
  return `M${x1} ${y1} H${turn} V${y2} H${x2}`;
}
