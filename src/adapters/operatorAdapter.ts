import type {
  InboxTaskLane,
  InboxTaskTransport,
  OperatorCandidateTransport,
  OperatorSessionTransport,
} from "../api/types";
import { asRecord, asString, asStringList } from "./record";

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

const INBOX_LANES: readonly InboxTaskLane[] = [
  "in_progress_mine",
  "available_ready",
  "available_needs_provider",
  "waiting_dependencies",
  "blocked_material",
];

function inboxLane(value: unknown): InboxTaskLane | null {
  return typeof value === "string" && INBOX_LANES.some((lane) => lane === value)
    ? (value as InboxTaskLane)
    : null;
}

export function presentInboxDisplayNote(payload: unknown): string | null {
  const record = asRecord(payload);
  const inbox = asRecord(record?.inbox);
  return asString(inbox?.displayOrderNote);
}

export function presentInboxTasks(payload: unknown): InboxTaskTransport[] {
  const record = asRecord(payload);
  const inbox = asRecord(record?.inbox);
  if (!inbox) {
    return [];
  }
  const lanes: ReadonlyArray<readonly [InboxTaskLane, unknown]> = [
    ["in_progress_mine", inbox.inProgressMine],
    ["available_ready", inbox.availableReady],
    ["available_needs_provider", inbox.availableNeedsProvider],
    ["waiting_dependencies", inbox.waitingDependencies],
    ["blocked_material", inbox.blockedMaterial],
  ];
  return lanes.flatMap(([sourceLane, lane]) => {
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
          jobId: asString(row.jobId),
          processLabel: asString(row.processLabel) ?? "",
          scopeLabel: asString(row.scopeLabel) ?? "",
          statusLabel: asString(row.statusLabel) ?? "",
          productLabel: asString(row.productLabel) ?? "",
          inscription: asString(row.inscription) ?? "",
          customerDisplayName: asString(row.customerDisplayName) ?? "",
          seqLabel: asString(row.seqLabel) ?? "",
          waitingForLabels: asStringList(row.waitingForLabels),
          requiredCapabilityLabel: asString(row.requiredCapabilityLabel),
          providerLabel: asString(row.providerLabel),
          canClaimStart: row.canClaimStart === true,
          requiresProvider: row.requiresProvider === true,
          lane: inboxLane(row.lane) ?? sourceLane,
          materialBlockLabel: asString(row.materialBlockLabel),
        },
      ];
    });
  });
}
