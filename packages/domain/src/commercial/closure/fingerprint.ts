import {
  COMMERCIAL_OPERATION_ID_MAX_LENGTH,
  COMMERCIAL_REASON_MAX_LENGTH,
  isCommercialOfferDisposition,
  type CommercialDecisionGroup,
  type CommercialOfferDisposition,
} from "./types.js";

export function normalizeCommercialReason(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > COMMERCIAL_REASON_MAX_LENGTH) {
    return null;
  }
  return trimmed;
}

export function normalizeCommercialOperationId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > COMMERCIAL_OPERATION_ID_MAX_LENGTH) {
    return null;
  }
  return trimmed;
}

export function normalizeExpectedRevision(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

export function sortedUniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function canonicalizeDecisionGroups(
  groups: readonly CommercialDecisionGroup[],
): CommercialDecisionGroup[] {
  const byDisposition = new Map<CommercialOfferDisposition, CommercialDecisionGroup>();
  for (const group of groups) {
    if (!isCommercialOfferDisposition(group.disposition)) {
      continue;
    }
    byDisposition.set(group.disposition, {
      disposition: group.disposition,
      reason: group.reason.trim(),
      quoteSnapshotIds: sortedUniqueIds(group.quoteSnapshotIds),
    });
  }
  return [...byDisposition.values()].sort((left, right) =>
    left.disposition.localeCompare(right.disposition),
  );
}

export function commercialDecisionsFingerprint(input: {
  requestId: string;
  groups: readonly CommercialDecisionGroup[];
  close: boolean;
  closeReason: string | null;
}): string {
  return JSON.stringify({
    kind: "decisions",
    requestId: input.requestId,
    groups: canonicalizeDecisionGroups(input.groups),
    close: input.close,
    closeReason: input.closeReason,
  });
}

export function commercialReopenFingerprint(input: {
  requestId: string;
  reason: string;
}): string {
  return JSON.stringify({
    kind: "reopen",
    requestId: input.requestId,
    reason: input.reason.trim(),
  });
}

export function commercialResumeFingerprint(input: {
  requestId: string;
  quoteSnapshotId: string;
  reason: string;
}): string {
  return JSON.stringify({
    kind: "resume",
    requestId: input.requestId,
    quoteSnapshotId: input.quoteSnapshotId,
    reason: input.reason.trim(),
  });
}
