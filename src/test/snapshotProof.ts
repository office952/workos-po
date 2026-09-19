import type { QuoteSnapshotTransport } from "../api/types";

export type FrozenProfileComparison = {
  snapshotAId: string;
  snapshotBId: string;
  rateA: number | null;
  costA: number | null;
  rateB: number | null;
  costB: number | null;
  historicalReprice: boolean;
};

export function compareFrozenProfileLines(
  snapshotA: QuoteSnapshotTransport,
  snapshotB: QuoteSnapshotTransport,
  resourceId: string,
): FrozenProfileComparison {
  const lineA = snapshotA.lines.find((line) => line.resourceId === resourceId) ?? null;
  const lineB = snapshotB.lines.find((line) => line.resourceId === resourceId) ?? null;
  return {
    snapshotAId: snapshotA.quoteSnapshotId,
    snapshotBId: snapshotB.quoteSnapshotId,
    rateA: lineA?.rate ?? null,
    costA: lineA?.cost ?? null,
    rateB: lineB?.rate ?? null,
    costB: lineB?.cost ?? null,
    historicalReprice: false,
  };
}

export function frozenProfileMatches(
  snapshot: QuoteSnapshotTransport,
  resourceId: string,
  expected: { rate: number; cost: number; quantity: number },
): boolean {
  const line = snapshot.lines.find((item) => item.resourceId === resourceId);
  return (
    line?.rate === expected.rate &&
    line?.cost === expected.cost &&
    line?.quantity === expected.quantity
  );
}
