import type {
  InboxTaskTransport,
  OperatorCandidateTransport,
  OperatorSessionTransport,
} from "../api/types";
import { asRecord, asString } from "./record";

export function presentOperatorCandidates(payload: unknown): OperatorCandidateTransport[] {
  const record = asRecord(payload);
  const candidates = record?.candidates;
  if (!Array.isArray(candidates)) {
    return [];
  }
  return candidates.flatMap((item) => {
    const row = asRecord(item);
    if (!row || typeof row.personId !== "string" || typeof row.displayName !== "string") {
      return [];
    }
    return [
      {
        personId: row.personId,
        displayName: row.displayName,
        pinConfigured: row.pinConfigured === true,
        availabilityLabel: asString(row.availabilityLabel) ?? "",
      },
    ];
  });
}

export function presentOperatorSession(payload: unknown): OperatorSessionTransport | null {
  const record = asRecord(payload);
  const operator = asRecord(record?.operator);
  if (!operator || typeof operator.personId !== "string" || typeof operator.displayName !== "string") {
    return null;
  }
  return {
    personId: operator.personId,
    displayName: operator.displayName,
  };
}

export function presentInboxTasks(payload: unknown): InboxTaskTransport[] {
  const record = asRecord(payload);
  const inbox = asRecord(record?.inbox);
  if (!inbox) {
    return [];
  }
  const lanes = [
    inbox.inProgressMine,
    inbox.availableReady,
    inbox.availableNeedsProvider,
    inbox.waitingDependencies,
  ];
  return lanes.flatMap((lane) => {
    if (!Array.isArray(lane)) {
      return [];
    }
    return lane.flatMap((item) => {
      const row = asRecord(item);
      if (!row || typeof row.taskId !== "string" || typeof row.planId !== "string") {
        return [];
      }
      return [
        {
          taskId: row.taskId,
          planId: row.planId,
          processLabel: asString(row.processLabel) ?? "",
          scopeLabel: asString(row.scopeLabel) ?? "",
          statusLabel: asString(row.statusLabel) ?? "",
          productLabel: asString(row.productLabel) ?? "",
          inscription: asString(row.inscription) ?? "",
          canClaimStart: row.canClaimStart === true,
          requiresProvider: row.requiresProvider === true,
          lane: asString(row.lane) ?? "",
        },
      ];
    });
  });
}
