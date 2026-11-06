export const COMMERCIAL_STATES = ["OPEN", "CLOSED"] as const;
export type CommercialState = (typeof COMMERCIAL_STATES)[number];

export const COMMERCIAL_OFFER_DISPOSITIONS = [
  "NOT_PURSUED",
  "DECLINED_BY_CUSTOMER",
] as const;
export type CommercialOfferDisposition = (typeof COMMERCIAL_OFFER_DISPOSITIONS)[number];

export const COMMERCIAL_LEDGER_EVENT_KINDS = [
  "OFFER_DISPOSITION",
  "OFFER_RESUMED",
  "REQUEST_CLOSED",
  "REQUEST_REOPENED",
] as const;
export type CommercialLedgerEventKind = (typeof COMMERCIAL_LEDGER_EVENT_KINDS)[number];

export const COMMERCIAL_AVAILABLE_ACTIONS = [
  "SAVE_DECISIONS",
  "SAVE_AND_CLOSE",
  "CLOSE_OFFERLESS",
  "REOPEN",
  "RESUME_OFFER",
  "CREATE_QUOTE",
  "ACCEPT_QUOTE",
  "CREATE_ORDER",
  "ADMINISTRATIVE_CANCEL",
] as const;
export type CommercialAvailableAction = (typeof COMMERCIAL_AVAILABLE_ACTIONS)[number];

export const COMMERCIAL_MUTATION_ERRORS = [
  "not_found",
  "forbidden",
  "invalid_payload",
  "commercial_revision_mismatch",
  "commercial_operation_conflict",
  "unresolved_offers",
  "offer_not_eligible",
  "commercial_request_closed",
  "commercial_request_open",
  "reason_required",
  "homogeneous_reason_required",
  "accepted_offer_not_declinable",
  "ordered_offer_not_declinable",
  "superseded_offer_not_resumable",
  "offer_not_resumable",
  "close_reason_required",
  "offers_present",
] as const;
export type CommercialMutationErrorCode = (typeof COMMERCIAL_MUTATION_ERRORS)[number];

export const COMMERCIAL_OFFER_RESOLUTION_SOURCES = [
  "UNRESOLVED",
  "DISPOSITION",
  "ACCEPTED",
  "ORDERED",
  "SUPERSEDED_LINEAGE",
] as const;
export type CommercialOfferResolutionSource =
  (typeof COMMERCIAL_OFFER_RESOLUTION_SOURCES)[number];

export const COMMERCIAL_ACTOR_ROLES = ["owner", "member"] as const;
export type CommercialActorRole = (typeof COMMERCIAL_ACTOR_ROLES)[number];

export const COMMERCIAL_REASON_MAX_LENGTH = 2000;
export const COMMERCIAL_OPERATION_ID_MAX_LENGTH = 128;

export type CommercialActor = {
  accountId: string;
  role: CommercialActorRole;
  displayName: string;
};

export type CommercialOfferFacts = {
  quoteSnapshotId: string;
  kind: "PRODUCT" | "ASSEMBLY";
  superseded: boolean;
  accepted: boolean;
  ordered: boolean;
  currentDisposition: CommercialOfferDisposition | null;
  currentDispositionEventId: string | null;
};

export type CommercialOfferResolution = {
  quoteSnapshotId: string;
  source: CommercialOfferResolutionSource;
  commerciallyResolved: boolean;
  outstandingOrderObligation: boolean;
  resumable: boolean;
  decisionRequired: boolean;
};

export type CommercialDecisionGroup = {
  disposition: CommercialOfferDisposition;
  reason: string;
  quoteSnapshotIds: readonly string[];
};

export type CommercialLedgerState = {
  requestId: string;
  state: CommercialState;
  revision: number;
  closedAt: string | null;
  closedBy: CommercialActor | null;
  closeReason: string | null;
  reopenedAt: string | null;
  reopenedBy: CommercialActor | null;
  reopenReason: string | null;
  updatedAt: string;
};

export type CommercialLedgerEvent = {
  eventId: string;
  requestId: string;
  ledgerRevision: number;
  sequenceInOperation: number;
  eventKind: CommercialLedgerEventKind;
  quoteSnapshotId: string | null;
  disposition: CommercialOfferDisposition | null;
  reason: string;
  actor: CommercialActor;
  occurredAt: string;
  operationId: string;
  correlationId: string;
  payloadFingerprint: string;
  supersedesEventId: string | null;
};

export type CommercialLedgerEventDraft = {
  eventKind: CommercialLedgerEventKind;
  quoteSnapshotId: string | null;
  disposition: CommercialOfferDisposition | null;
  reason: string;
  supersedesEventId: string | null;
};

export type RecordedCommercialOperation = {
  operationId: string;
  requestId: string;
  payloadFingerprint: string;
  resultRevision: number;
};

export type CommercialMutationRefusal = {
  ok: false;
  error: CommercialMutationErrorCode;
  currentRevision: number;
  blockingQuoteSnapshotIds: readonly string[];
  reasons: readonly string[];
};

export type CommercialMutationPlan = {
  ok: true;
  idempotent: boolean;
  nextRevision: number;
  nextState: CommercialState;
  events: readonly CommercialLedgerEventDraft[];
  dispositionWrites: ReadonlyArray<{
    quoteSnapshotId: string;
    disposition: CommercialOfferDisposition;
    reason: string;
  }>;
  dispositionDeletes: readonly string[];
  payloadFingerprint: string;
  operationId: string;
  closeReason: string | null;
  reopenReason: string | null;
};

export type CommercialMutationResult = CommercialMutationPlan | CommercialMutationRefusal;

export function isCommercialState(value: string): value is CommercialState {
  return (COMMERCIAL_STATES as readonly string[]).includes(value);
}

export function isCommercialOfferDisposition(
  value: string,
): value is CommercialOfferDisposition {
  return (COMMERCIAL_OFFER_DISPOSITIONS as readonly string[]).includes(value);
}

export function isCommercialActorRole(value: string): value is CommercialActorRole {
  return (COMMERCIAL_ACTOR_ROLES as readonly string[]).includes(value);
}

export function commercialStateLabel(state: CommercialState): string {
  switch (state) {
    case "OPEN":
      return "Urmărire comercială deschisă";
    case "CLOSED":
      return "Urmărire comercială încheiată";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function commercialOfferDispositionLabel(
  disposition: CommercialOfferDisposition,
): string {
  switch (disposition) {
    case "NOT_PURSUED":
      return "Nu se mai urmărește";
    case "DECLINED_BY_CUSTOMER":
      return "Refuzată de client";
    default: {
      const _exhaustive: never = disposition;
      return _exhaustive;
    }
  }
}

export function commercialLedgerEventKindLabel(kind: CommercialLedgerEventKind): string {
  switch (kind) {
    case "OFFER_DISPOSITION":
      return "Decizie pe ofertă";
    case "OFFER_RESUMED":
      return "Ofertă reluată";
    case "REQUEST_CLOSED":
      return "Urmărire comercială încheiată";
    case "REQUEST_REOPENED":
      return "Urmărire comercială redeschisă";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function commercialActorRoleLabel(role: CommercialActorRole): string {
  switch (role) {
    case "owner":
      return "Proprietar";
    case "member":
      return "Membru";
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export function commercialMutationErrorLabel(error: CommercialMutationErrorCode): string {
  switch (error) {
    case "not_found":
      return "Cererea nu a fost găsită.";
    case "forbidden":
      return "Doar proprietarul poate încheia, redeschide sau decide ofertele.";
    case "invalid_payload":
      return "Datele operației comerciale nu sunt valide.";
    case "commercial_revision_mismatch":
      return "Cererea a fost modificată între timp. Reîncarcă datele actuale.";
    case "commercial_operation_conflict":
      return "Aceeași operație a fost trimisă cu alt conținut.";
    case "unresolved_offers":
      return "Toate ofertele nerezolvate trebuie să aibă o decizie înainte de încheiere.";
    case "offer_not_eligible":
      return "Oferta nu poate primi această decizie.";
    case "commercial_request_closed":
      return "Urmărirea comercială este încheiată.";
    case "commercial_request_open":
      return "Urmărirea comercială este deja deschisă.";
    case "reason_required":
      return "Motivul este obligatoriu.";
    case "homogeneous_reason_required":
      return "Fiecare grup de decizii identice are propriul motiv obligatoriu.";
    case "accepted_offer_not_declinable":
      return "O ofertă acceptată nu se marchează ca refuzată sau neurmărită.";
    case "ordered_offer_not_declinable":
      return "O ofertă cu comandă nu se marchează ca refuzată sau neurmărită.";
    case "superseded_offer_not_resumable":
      return "O ofertă de ansamblu înlocuită nu poate fi reluată.";
    case "offer_not_resumable":
      return "Oferta nu poate fi reluată acum.";
    case "close_reason_required":
      return "Încheierea comercială cere un motiv separat.";
    case "offers_present":
      return "Cererea are oferte; încheierea fără oferte nu se aplică.";
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

export function defaultOpenCommercialLedger(requestId: string, updatedAt: string): CommercialLedgerState {
  return {
    requestId,
    state: "OPEN",
    revision: 0,
    closedAt: null,
    closedBy: null,
    closeReason: null,
    reopenedAt: null,
    reopenedBy: null,
    reopenReason: null,
    updatedAt,
  };
}
