import { useId } from "react";
import type { CommercialRequestTransport, RequestLinkedOfferTransport } from "../../../api/types";
import { Button } from "../../../components/Button";
import { InlineAlert } from "../../../components/InlineAlert";
import {
  COMMERCIAL_DISPOSITION_OPTIONS,
  coversUnresolved,
  groupsFromDraft,
  type CommercialDecisionDraft,
} from "../../../presentation/commercialClosureUi";
import { CommercialReasonField } from "./CommercialReasonField";

export function CommercialDecisionPanel({
  commercial,
  offers,
  draft,
  busy,
  error,
  conflict,
  onDraft,
  onSave,
  onSaveAndClose,
  onCancel,
}: {
  commercial: CommercialRequestTransport;
  offers: readonly RequestLinkedOfferTransport[];
  draft: CommercialDecisionDraft;
  busy: boolean;
  error: string | null;
  conflict: boolean;
  onDraft: (draft: CommercialDecisionDraft) => void;
  onSave: () => void;
  onSaveAndClose: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const groups = groupsFromDraft(draft);
  const required = commercial.unresolvedQuoteSnapshotIds;
  const selectedCount = Object.keys(draft.selected).length;
  const canSave = groups.length > 0 && groups.every((group) => group.reason.length > 0);
  const canClose = coversUnresolved(draft, required) && canSave;
  const byId = new Map(offers.map((offer) => [offer.quoteSnapshotId, offer]));

  return (
    <div className="cdecide" data-testid="commercial-decision-panel">
      <p className="branch-detail__kicker">Decizii comerciale</p>
      <h2 className="branch-detail__title">Marchează ofertele nerezolvate</h2>
      <p>
        {required.length === 0
          ? "Nu mai sunt oferte nerezolvate. Poți salva o schimbare sau încheia urmărirea."
          : `${required.length === 1 ? "1 ofertă cere" : `${required.length} oferte cer`} o decizie. Ofertele acceptate sau cu comandă nu se marchează ca refuzate.`}
      </p>
      {conflict ? (
        <InlineAlert tone="pending" title="Cererea s-a schimbat între timp">
          Textul tău rămâne. Datele actuale s-au reîncărcat; verifică selecția, apoi trimite din nou.
        </InlineAlert>
      ) : null}
      {error ? (
        <InlineAlert tone="error" title="Deciziile nu s-au salvat">
          {error}
        </InlineAlert>
      ) : null}
      {selectedCount === 0 ? (
        <p className="cdecide__empty">Selectează ofertele din registru. Câmpul de motiv apare pentru fiecare grup omogen.</p>
      ) : (
        COMMERCIAL_DISPOSITION_OPTIONS.map((option) => {
          const group = groups.find((item) => item.disposition === option.value);
          if (!group) {
            return null;
          }
          return (
            <fieldset key={option.value} className="cdecide__group" disabled={busy}>
              <legend>{option.label}</legend>
              <ul>
                {group.quoteSnapshotIds.map((quoteSnapshotId) => {
                  const offer = byId.get(quoteSnapshotId);
                  return (
                    <li key={quoteSnapshotId}>
                      <label className="cdecide__offer">
                        <span>{offer?.reference ?? offer?.inscription ?? "Ofertă"}</span>
                        <select
                          aria-label={`Decizia pentru ${offer?.reference ?? "ofertă"}`}
                          value={draft.selected[quoteSnapshotId]}
                          onChange={(event) =>
                            onDraft({
                              ...draft,
                              selected: {
                                ...draft.selected,
                                [quoteSnapshotId]: event.target.value as typeof option.value,
                              },
                            })
                          }
                        >
                          {COMMERCIAL_DISPOSITION_OPTIONS.map((choice) => (
                            <option key={choice.value} value={choice.value}>
                              {choice.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <CommercialReasonField
                id={`${id}-${option.value}`}
                label={`Motiv · ${option.label}`}
                value={draft.reasons[option.value]}
                onChange={(reason) =>
                  onDraft({
                    ...draft,
                    reasons: { ...draft.reasons, [option.value]: reason },
                  })
                }
                disabled={busy}
                required
                hint="Obligatoriu pentru acest grup, separat de motivul încheierii."
              />
            </fieldset>
          );
        })
      )}
      <div className="cdos-bar cdecide__bar">
        <div className="cdos-actions">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            Anulează
          </Button>
          <Button variant="secondary" disabled={busy || !canSave} onClick={onSave}>
            Salvează deciziile
          </Button>
          <Button disabled={busy || !canClose} onClick={onSaveAndClose}>
            Salvează și încheie comercial
          </Button>
        </div>
        {!canClose && required.length > 0 ? (
          <p className="cdecide__hint">
            „Salvează și încheie comercial” este disponibil după ce toate ofertele nerezolvate au o decizie.
          </p>
        ) : null}
      </div>
    </div>
  );
}
