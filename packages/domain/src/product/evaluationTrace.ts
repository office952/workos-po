export type ProductEvaluationTrace = {
  evaluateProductComponents: number;
  compileEic: number;
  runtimePresent: number;
  runtimeLabels: number;
  listActiveCostEvidence: number;
};

let activeTrace: ProductEvaluationTrace | null = null;

function emptyTrace(): ProductEvaluationTrace {
  return {
    evaluateProductComponents: 0,
    compileEic: 0,
    runtimePresent: 0,
    runtimeLabels: 0,
    listActiveCostEvidence: 0,
  };
}

export function runWithProductEvaluationTrace<T>(fn: () => T): {
  result: T;
  trace: ProductEvaluationTrace;
} {
  const previous = activeTrace;
  const trace = emptyTrace();
  activeTrace = trace;
  try {
    return { result: fn(), trace };
  } finally {
    activeTrace = previous;
  }
}

export async function runWithProductEvaluationTraceAsync<T>(
  fn: () => T | Promise<T>,
): Promise<{ result: T; trace: ProductEvaluationTrace }> {
  const previous = activeTrace;
  const trace = emptyTrace();
  activeTrace = trace;
  try {
    return { result: await fn(), trace };
  } finally {
    activeTrace = previous;
  }
}

export function noteEvaluateProductComponents(): void {
  if (activeTrace) {
    activeTrace.evaluateProductComponents += 1;
  }
}

export function noteCompileEic(): void {
  if (activeTrace) {
    activeTrace.compileEic += 1;
  }
}

export function noteRuntimePresent(): void {
  if (activeTrace) {
    activeTrace.runtimePresent += 1;
  }
}

export function noteRuntimeLabels(): void {
  if (activeTrace) {
    activeTrace.runtimeLabels += 1;
  }
}

export function noteListActiveCostEvidence(): void {
  if (activeTrace) {
    activeTrace.listActiveCostEvidence += 1;
  }
}
