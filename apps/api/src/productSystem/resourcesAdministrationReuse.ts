import {
  applyActiveCostEvidenceWrite,
  applyResourcesAdministrationWrite,
  calendarDateFromUtcInstant,
  type CostEvidence,
  type ResourcesAdministrationWriteStats,
  type ResourcesAdminProjection,
} from "@workos-final/domain";

export type ResourcesAdministrationReuse = {
  evidence(): CostEvidence[];
  admin(): ResourcesAdminProjection;
  applySuccessfulWrite(next: CostEvidence, supersededRowId?: string | null): void;
};

export function createResourcesAdministrationReuse(input: {
  loadEvidence: () => CostEvidence[];
  project: (
    rows: readonly CostEvidence[],
    asOf: string,
  ) => ResourcesAdminProjection;
  now?: () => string;
  observeEvidenceLoad?: () => void;
  observeFullBuild?: () => void;
  observeDelta?: (stats: ResourcesAdministrationWriteStats) => void;
}): ResourcesAdministrationReuse {
  const now = input.now ?? (() => new Date().toISOString());
  let evidence: CostEvidence[] | undefined;
  let admin: ResourcesAdminProjection | undefined;
  let adminUtcDate: string | undefined;

  const currentAsOf = (): string => now();

  const currentUtcDate = (asOf: string): string | null => {
    const parsed = calendarDateFromUtcInstant(asOf);
    return parsed.ok ? parsed.date : null;
  };

  const currentEvidence = (): CostEvidence[] => {
    if (!evidence) {
      input.observeEvidenceLoad?.();
      evidence = input.loadEvidence();
    }
    return evidence;
  };

  const rebuildAdmin = (
    rows: readonly CostEvidence[],
    asOf: string,
  ): ResourcesAdminProjection => {
    input.observeFullBuild?.();
    admin = input.project(rows, asOf);
    adminUtcDate = currentUtcDate(asOf) ?? undefined;
    return admin;
  };

  const adminForCurrentDate = (): ResourcesAdminProjection => {
    const rows = currentEvidence();
    const asOf = currentAsOf();
    const utcDate = currentUtcDate(asOf);
    if (admin && utcDate !== null && utcDate === adminUtcDate) {
      return admin;
    }
    return rebuildAdmin(rows, asOf);
  };

  return {
    evidence: currentEvidence,
    admin: adminForCurrentDate,
    applySuccessfulWrite(next, supersededRowId) {
      if (!evidence) {
        return;
      }
      evidence = applyActiveCostEvidenceWrite(evidence, next, supersededRowId);
      const asOf = currentAsOf();
      const utcDate = currentUtcDate(asOf);
      if (!admin || utcDate === null || utcDate !== adminUtcDate) {
        rebuildAdmin(evidence, asOf);
        return;
      }
      const result = applyResourcesAdministrationWrite(admin, evidence, next, asOf);
      admin = result.admin;
      input.observeDelta?.(result.stats);
    },
  };
}
