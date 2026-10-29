/** Process-graph editing remains unimplemented. Catalog capabilities cite this constant; they do not restate it. */
export const OPERATIONAL_PROCESS_GRAPH_WRITE_STATE = "NOT_IMPLEMENTED" as const;

export type OperationalProcessGraphWriteState =
  typeof OPERATIONAL_PROCESS_GRAPH_WRITE_STATE;
