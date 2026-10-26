import { useEffect, useId, useRef, useState } from "react";
import { readTransportErrorCode, TransportError } from "../../../api/http";
import { setWorkRepresentativePhoto } from "../../../api/customerDossier";
import type { CustomerDossierModel, DossierDocument } from "../../../adapters/customerDossierAdapter";
import { Button } from "../../../components/Button";
import { InlineAlert } from "../../../components/InlineAlert";
import { dossierErrorText, formatDay, refreshCustomerDossier } from "../dossier/dossierModel";
import { DossierFormDialog } from "../dossier/dossierShared";
import { PhotoFrame } from "../dossier/historyParts";
import { choiceLine, representativeTargets, type RepresentativeTarget } from "./representativeModel";
import "../../../styles/surfaces/client-representative-photo.css";

type Outcome =
  | { kind: "saved"; text: string }
  | { kind: "conflict" }
  | { kind: "unavailable" }
  | { kind: "error"; text: string; retry: "set" | "clear" };

/**
 * N-021 · „Setează ca reprezentativă” from the „⋯” of a photo. The operator names the exact work
 * (a photo linked to several works never picks one from its place in the gallery). The server checks
 * that the photo is still linked to that work and that the choice is still at the revision read here:
 * a change made meanwhile by someone else comes back as a conflict, the dossier is read again and
 * nothing is overwritten. The photo keeps its real stage: a simulation stays a simulation.
 */
export function RepresentativePhotoDialog({
  customerId,
  dossier,
  photo,
  onClose,
  onLink,
}: {
  customerId: string;
  dossier: CustomerDossierModel;
  photo: DossierDocument;
  onClose: () => void;
  onLink: (photo: DossierDocument) => void;
}) {
  const groupId = useId();
  const targets = representativeTargets(photo, dossier);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => targets.find((target) => target.isThisPhoto)?.key ?? (targets.length === 1 ? (targets[0]?.key ?? null) : null));
  const [busy, setBusy] = useState<"set" | "clear" | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (outcome) resultRef.current?.focus({ preventScroll: false });
  }, [outcome]);
  const selected = targets.find((target) => target.key === selectedKey) ?? null;
  const stage = photo.photoStageLabel ?? "Fără etapă";

  async function send(action: "set" | "clear", target: RepresentativeTarget) {
    if (busy) return;
    setBusy(action);
    setOutcome(null);
    try {
      await setWorkRepresentativePhoto(customerId, {
        workKind: target.workKind,
        workId: target.workId,
        documentId: action === "set" ? photo.documentId : null,
        expectedRevision: target.choice.revision,
      });
      setOutcome({
        kind: "saved",
        text: action === "set" ? `Fotografia este acum reprezentativă pentru ${target.label}.` : `${target.label} folosește din nou alegerea automată.`,
      });
      refreshCustomerDossier(customerId);
    } catch (caught) {
      const code = caught instanceof TransportError ? readTransportErrorCode(caught.body) : null;
      if (code === "stale_revision") {
        setOutcome({ kind: "conflict" });
        refreshCustomerDossier(customerId);
      } else if (code === "photo_not_eligible") {
        setOutcome({ kind: "unavailable" });
        refreshCustomerDossier(customerId);
      } else {
        setOutcome({ kind: "error", text: dossierErrorText(caught), retry: action });
      }
    } finally {
      setBusy(null);
    }
  }

  const subtitle = [stage, formatDay(photo.documentDate), photo.title].filter(Boolean).join(" · ");
  return (
    <DossierFormDialog framed title="Fotografia reprezentativă a lucrării" subtitle={subtitle} subject="Alegerea fotografiei" dirty={false} busy={busy !== null} onClose={onClose}>
      <div className="drep">
        <div className="drep__photo">
          <PhotoFrame document={photo} size="thumb" />
          <p className="ui-note">
            {photo.photoStage === "SIMULATION"
              ? "Este o simulare și rămâne marcată „Simulare” oriunde apare; nu devine fotografie după montaj."
              : `Rămâne marcată „${stage}” oriunde apare. Fotografia, fișierul și asocierile ei nu se schimbă.`}
          </p>
        </div>

        {/* The answer of the server takes the focus: the button that was pressed may be gone. */}
        <div ref={resultRef} tabIndex={-1} className="drep__result">
          {outcome?.kind === "saved" ? (
            <InlineAlert tone="success" title="Alegerea a fost salvată.">
              {`${outcome.text} O văd toți utilizatorii organizației.`}
            </InlineAlert>
          ) : outcome?.kind === "conflict" ? (
            <InlineAlert tone="error" title="Alegerea a fost schimbată între timp de altcineva.">
              Nu s-a salvat nimic. Am citit alegerea actuală, afișată mai jos; verifică lucrarea și reia acțiunea dacă mai este nevoie.
            </InlineAlert>
          ) : outcome?.kind === "unavailable" ? (
            <InlineAlert tone="error" title="Fotografia nu mai poate fi aleasă pentru această lucrare.">
              Nu mai este asociată lucrării sau nu mai este o fotografie. Nu s-a salvat nimic; lista de mai jos arată situația actuală.
            </InlineAlert>
          ) : outcome?.kind === "error" ? (
            <InlineAlert tone="error" title="Alegerea nu s-a salvat.">
              {`${outcome.text} Lucrarea aleasă rămâne selectată.`}
            </InlineAlert>
          ) : null}
        </div>

        {targets.length === 0 ? (
          <div className="drep__empty">
            <p className="drep__empty-title">Fotografia nu este asociată niciunei lucrări</p>
            <p className="ui-note">
              O fotografie a cererii sau a sediului devine reprezentativă numai după ce o asociezi explicit unei lucrări. Cererile cu mai multe lucrări nu își împart singure fotografiile.
            </p>
            <Button variant="secondary" onClick={() => onLink(photo)}>Asociază unei lucrări…</Button>
          </div>
        ) : (
          <fieldset className="drep__works" aria-describedby={`${groupId}-hint`}>
            <legend className="drep__legend">{targets.length === 1 ? "Lucrarea" : `Alege lucrarea · ${targets.length} lucrări au această fotografie`}</legend>
            <p id={`${groupId}-hint`} className="ui-note">Alegerea se face separat pentru fiecare lucrare.</p>
            <ul className="drep__list">
              {targets.map((target) => (
                <li key={target.key} className="drep__work" data-selected={target.key === selectedKey || undefined} data-current={target.isThisPhoto || undefined}>
                  <label className="drep__option">
                    <input type="radio" name={groupId} value={target.key} checked={target.key === selectedKey} disabled={busy !== null} onChange={() => { setSelectedKey(target.key); setOutcome(null); }} />
                    <span className="drep__text">
                      <span className="drep__kind">{target.kindWord.toLocaleUpperCase("ro")}</span>
                      <span className="drep__label">{target.label}</span>
                      {target.detail ? <span className="drep__detail">{target.detail}</span> : null}
                      <span className="drep__state" data-status={target.isThisPhoto ? "THIS" : target.choice.status}>{choiceLine(target)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        <div className="cdos-bar">
          <p className="ui-note">„Închide” nu anulează o alegere deja salvată. Fără alegere, lucrarea arată automat fotografia după montaj, altfel simularea, altfel fotografia dinainte.</p>
          <div className="cdos-actions">
            {selected && !selected.isThisPhoto ? (
              <Button disabled={busy !== null} onClick={() => void send("set", selected)}>
                {busy === "set" ? "Se salvează…" : outcome?.kind === "error" && outcome.retry === "set" ? "Reîncearcă" : "Setează ca reprezentativă"}
              </Button>
            ) : null}
            {selected?.isThisPhoto ? (
              <Button variant="secondary" disabled={busy !== null} onClick={() => void send("clear", selected)}>
                {busy === "clear" ? "Se salvează…" : "Revino la alegerea automată"}
              </Button>
            ) : null}
            <Button variant="secondary" disabled={busy !== null} onClick={onClose}>Închide</Button>
          </div>
        </div>
      </div>
    </DossierFormDialog>
  );
}
