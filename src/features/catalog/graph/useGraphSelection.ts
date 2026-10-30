import { useState } from "react";

export type GraphViewMode = "SIMPLIFIED" | "DIRECT";

export function useGraphSelection(nodeIds: readonly string[]) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<GraphViewMode>("SIMPLIFIED");
  const [zoom, setZoom] = useState(1);
  const selectedNodeId = chosenId && nodeIds.includes(chosenId) ? chosenId : null;
  function move(direction: 1 | -1) {
    if (nodeIds.length === 0) return;
    const index = selectedNodeId ? nodeIds.indexOf(selectedNodeId) : -1;
    const next = nodeIds[(index + direction + nodeIds.length) % nodeIds.length] ?? null;
    setChosenId(next);
  }
  return {
    selectedNodeId,
    select: setChosenId,
    viewMode,
    setViewMode,
    zoom,
    zoomIn: () => setZoom((current) => Math.min(1.75, Math.round((current + 0.25) * 100) / 100)),
    zoomOut: () => setZoom((current) => Math.max(0.75, Math.round((current - 0.25) * 100) / 100)),
    move,
  };
}
