import { useRef, useState } from "react";
import {
  resumeCommercialOffer,
  reopenCommercialRequest,
  saveCommercialDecisions,
} from "../../../api/commercialClosure";
import {
  newCommercialOperationId,
  presentCommercialMutation,
  presentCommercialMutationFailure,
} from "../../../adapters/commercialClosureAdapter";
import type { CommercialRequestTransport, RequestDetailTransport } from "../../../api/types";
import { invalidateResourcePrefix, invalidateResources, writeResource } from "../../../data/resourceCache";
import { resourceKeys } from "../../../data/resourceKeys";
import {
  coversUnresolved,
  groupsFromDraft,
  type CommercialDecisionDraft,
} from "../../../presentation/commercialClosureUi";

export function invalidateAfterCommercialMutation(requestId: string, customerId: string | null): void {
  invalidateResources(resourceKeys.request(requestId), resourceKeys.requests(), resourceKeys.quotes());
  if (customerId) {
    invalidateResources(
      resourceKeys.customerWorkspace(customerId),
      resourceKeys.customerDossier(customerId),
    );
    invalidateResourcePrefix(resourceKeys.customerHistoryPrefix(customerId));
  }
}

export function useCommercialClosure(input: {
  requestId: string;
  customerId: string | null;
  commercial: CommercialRequestTransport | null;
  onDetail: (detail: RequestDetailTransport) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const sending = useRef(false);
  const operationId = useRef(newCommercialOperationId());

  function resetOperation(): void {
    operationId.current = newCommercialOperationId();
  }

  async function run(task: () => Promise<unknown>): Promise<boolean> {
    if (sending.current) {
      return false;
    }
    sending.current = true;
    setBusy(true);
    setError(null);
    setConflict(false);
    try {
      const presented = presentCommercialMutation(await task());
      if (presented.detail) {
        writeResource(resourceKeys.request(input.requestId), presented.detail);
        input.onDetail(presented.detail);
      }
      invalidateAfterCommercialMutation(input.requestId, input.customerId);
      resetOperation();
      return true;
    } catch (caught) {
      const failure = presentCommercialMutationFailure(caught);
      setError(failure.reasons[0] ?? "Operația comercială nu a reușit.");
      setConflict(failure.conflict);
      invalidateAfterCommercialMutation(input.requestId, input.customerId);
      if (failure.code === "commercial_operation_conflict") {
        resetOperation();
      }
      return false;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function saveDecisions(draft: CommercialDecisionDraft, close: boolean): Promise<boolean> {
    const commercial = input.commercial;
    if (!commercial) {
      return false;
    }
    const groups = groupsFromDraft(draft);
    if (!close && groups.length === 0) {
      setError("Alege cel puțin o ofertă și un motiv pentru fiecare grup.");
      return false;
    }
    if (groups.some((group) => !group.reason)) {
      setError("Fiecare grup de decizii identice are propriul motiv obligatoriu.");
      return false;
    }
    if (close && !coversUnresolved(draft, commercial.unresolvedQuoteSnapshotIds)) {
      setError("Toate ofertele nerezolvate trebuie să aibă o decizie înainte de încheiere.");
      return false;
    }
    if (close && !draft.closeReason.trim()) {
      setError("Încheierea comercială cere un motiv separat.");
      return false;
    }
    return run(() =>
      saveCommercialDecisions(input.requestId, {
        groups,
        close,
        closeReason: close ? draft.closeReason.trim() : null,
        expectedRevision: commercial.revision,
        operationId: operationId.current,
      }),
    );
  }

  async function closeOfferless(reason: string): Promise<boolean> {
    const commercial = input.commercial;
    if (!commercial) {
      return false;
    }
    return run(() =>
      saveCommercialDecisions(input.requestId, {
        groups: [],
        close: true,
        closeReason: reason.trim(),
        expectedRevision: commercial.revision,
        operationId: operationId.current,
      }),
    );
  }

  async function reopen(reason: string): Promise<boolean> {
    const commercial = input.commercial;
    if (!commercial) {
      return false;
    }
    return run(() =>
      reopenCommercialRequest(input.requestId, {
        reason: reason.trim(),
        expectedRevision: commercial.revision,
        operationId: operationId.current,
      }),
    );
  }

  async function resume(quoteSnapshotId: string, reason: string): Promise<boolean> {
    const commercial = input.commercial;
    if (!commercial) {
      return false;
    }
    return run(() =>
      resumeCommercialOffer(input.requestId, quoteSnapshotId, {
        reason: reason.trim(),
        expectedRevision: commercial.revision,
        operationId: operationId.current,
      }),
    );
  }

  return { busy, error, conflict, setError, saveDecisions, closeOfferless, reopen, resume };
}
