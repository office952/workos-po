import {
  listPsuCapacityCatalog,
  type PsuCapacityEntry,
} from "../resources/catalog.js";

export const PSU_SELECTION_MAX_UNITS = 6;

export type SelectedPsuUnit = {
  resourceId: string;
  label: string;
  capacityW: number;
  quantity: number;
};

export function selectPsuUnits(
  requiredCapacityW: number,
  catalog: readonly PsuCapacityEntry[] = listPsuCapacityCatalog(),
): readonly SelectedPsuUnit[] {
  if (!Number.isFinite(requiredCapacityW) || requiredCapacityW <= 0) {
    return [];
  }
  const capacities = [...catalog]
    .filter((item) => item.capacityW > 0)
    .sort((left, right) => left.capacityW - right.capacityW);
  if (capacities.length === 0) {
    return [];
  }

  const candidates: PsuCapacityEntry[][] = [];

  function score(config: readonly PsuCapacityEntry[]): [number, number, number] {
    const total = config.reduce((sum, item) => sum + item.capacityW, 0);
    const maxCapacity = Math.max(...config.map((item) => item.capacityW));
    return [config.length, total - requiredCapacityW, -maxCapacity];
  }

  function better(
    candidate: readonly PsuCapacityEntry[],
    current: readonly PsuCapacityEntry[],
  ): boolean {
    const left = score(candidate);
    const right = score(current);
    if (left[0] !== right[0]) {
      return left[0] < right[0];
    }
    if (left[1] !== right[1]) {
      return left[1] < right[1];
    }
    return left[2] < right[2];
  }

  function search(picked: PsuCapacityEntry[]): void {
    const total = picked.reduce((sum, item) => sum + item.capacityW, 0);
    if (total >= requiredCapacityW) {
      candidates.push([...picked]);
      return;
    }
    if (picked.length >= PSU_SELECTION_MAX_UNITS) {
      return;
    }
    for (const entry of capacities) {
      search([...picked, entry]);
    }
  }

  search([]);
  if (candidates.length === 0) {
    return [];
  }
  const best = candidates.reduce((current, candidate) =>
    better(candidate, current) ? candidate : current,
  );

  const counts = new Map<string, SelectedPsuUnit>();
  for (const entry of best) {
    const current = counts.get(entry.resourceId);
    if (current) {
      current.quantity += 1;
      continue;
    }
    counts.set(entry.resourceId, {
      resourceId: entry.resourceId,
      label: entry.label,
      capacityW: entry.capacityW,
      quantity: 1,
    });
  }
  return [...counts.values()].sort((left, right) => right.capacityW - left.capacityW);
}
