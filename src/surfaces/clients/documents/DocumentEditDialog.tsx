import { useEffect, useId, useRef, useState } from "react";
import { fetchCustomerDossier, updateCustomerDocument } from "../../../api/customerDossier";
import { readTransportErrorCode, TransportError } from "../../../api/http";
import { presentCustomerDossier, type CustomerDossierModel, type DossierDocument } from "../../../adapters/customerDossierAdapter";
import { Button } from "../../../components/Button";
import { InlineAlert } from "../../../components/InlineAlert";
import { dossierErrorText, formatDay, refreshCustomerDossier } from "../dossier/dossierModel";
import { DossierFormDialog } from "../dossier/dossierShared";
import { announceDocumentSaved } from "./documentNotice";
import { conflictRows, FIELD_LABELS, patchOf, resumeOnCurrent, valuesOf, type ConflictRow, type MetadataField, type MetadataValues } from "./metadataConflict";
import "../../../styles/surfaces/client-document-dialogs.css";

type Step =
  | { kind: "edit" }
  | { kind: "error"; message: string }
  | { kind: "conflict"; current: DossierDocument }
  | { kind: "compare"; current: DossierDocument; rows: ConflictRow[] }
  | { kind: "gone" };

/**
 * „Modifică datele” (705:22325 → eroare 705:22691 → conflict 756:460 → compară 756:840 → reluare
 * 773:185 → se salvează 705:23054 → salvat 705:23746). A failed save keeps the values for a retry.
 * A version conflict (409) keeps the draft, reads the current version again and lets the reader
 * compare, resume on it (their changes kept) or take it as is; nothing is saved by itself, and a
 * further conflict repeats the same steps from the newest version. The file never changes here.
 */
export function EditDocumentDialog({ customerId, dossier, document, onClose }: { customerId: string; dossier: CustomerDossierModel; document: DossierDocument; onClose: () => void }) {
  const id = useId();
  const [base, setBase] = useState<{ values: MetadataValues; revision: number }>(() => ({ values: valuesOf(document), revision: document.revision }));
  const [values, setValues] = useState<MetadataValues>(() => valuesOf(document));
  const [flagged, setFlagged] = useState<MetadataField[]>([]);
  const [resumed, setResumed] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "edit" });
  const [busy, setBusy] = useState(false);
  // A conflict, an error or the resumed form: its message takes the focus (the pressed button may be gone).
  const noticeRef = useRef<HTMLDivElement>(null);
  // The pressed button may be gone: the comparison, a message or the resumed form takes the focus.
  const compareRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step.kind === "compare") compareRef.current?.focus();
    else if (step.kind !== "edit" || resumed) noticeRef.current?.focus();
  }, [step, resumed]);
  const dirty = JSON.stringify(values) !== JSON.stringify(base.values) || resumed;
  const set = (field: MetadataField, value: string) => setValues((current) => ({ ...current, [field]: value }));

  async function readCurrent(): Promise<DossierDocument | null> {
    const fresh = presentCustomerDossier(await fetchCustomerDossier(customerId));
    refreshCustomerDossier(customerId);
    return fresh?.documents.find((item) => item.documentId === document.documentId) ?? null;
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await updateCustomerDocument(customerId, document.documentId, patchOf(values, base.revision));
      refreshCustomerDossier(customerId);
      announceDocumentSaved(document.documentId);
      onClose();
    } catch (caught) {
      if (caught instanceof TransportError && caught.status === 409 && readTransportErrorCode(caught.body) === "stale_revision") {
        try {
          const current = await readCurrent();
          setStep(current ? { kind: "conflict", current } : { kind: "gone" });
        } catch {
          setStep({ kind: "error", message: "Datele au fost modificate între timp, iar versiunea actuală nu a putut fi citită. Valorile tale au rămas în formular; încearcă din nou." });
        }
      } else {
        setStep({ kind: "error", message: caught instanceof TransportError && caught.status !== 0 ? dossierErrorText(caught) : "Serverul nu a răspuns. Modificările au rămas în formular; poți încerca din nou." });
      }
    } finally {
      setBusy(false);
    }
  }

  function compare(current: DossierDocument) {
    setStep({ kind: "compare", current, rows: conflictRows(base.values, values, valuesOf(current)) });
  }

  function resume(current: DossierDocument) {
    const next = resumeOnCurrent(base.values, values, valuesOf(current));
    setBase({ values: valuesOf(current), revision: current.revision });
    setValues(next.values);
    setFlagged(next.flagged);
    setResumed(true);
    setStep({ kind: "edit" });
  }

  function takeCurrent(current: DossierDocument) {
    setBase({ values: valuesOf(current), revision: current.revision });
    setValues(valuesOf(current));
    setFlagged([]);
    setResumed(false);
    setStep({ kind: "edit" });
  }

  const flaggedText = flagged.map((field) => FIELD_LABELS[field].toLocaleLowerCase("ro")).join(", ");
  return (
    <DossierFormDialog framed title="Modifică datele documentului" subtitle={document.originalFileName} subject="Modificările datelor documentului" dirty={dirty} busy={busy} onClose={onClose}>
      {step.kind === "compare" ? (
        <div ref={compareRef} tabIndex={-1} className="ddocform ddocform__compare">
          <p className="ddocform__label">Doar câmpurile care diferă</p>
          {step.rows.length ? (
            <ul className="ddocform__diff">
              {step.rows.map((row) => (
                <li key={row.field} data-both={row.both || undefined}>
                  <p className="ddocform__diff-title">{FIELD_LABELS[row.field]}</p>
                  <dl>
                    <div>
                      <dt>Ciorna ta</dt>
                      <dd>{shown(row.field, row.mine)}</dd>
                    </div>
                    <div>
                      <dt>Versiunea actuală</dt>
                      <dd>{shown(row.field, row.current)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ui-note">Versiunea actuală are deja valorile din ciorna ta.</p>
          )}
          <div className="cdos-bar">
            {step.rows.some((row) => row.both) ? (
              <p className="ui-note">{`${step.rows.filter((row) => row.both).map((row) => `„${FIELD_LABELS[row.field]}”`).join(", ")} a fost modificat și de tine, și de altcineva. La reluare păstrăm textul tău; verifică-l înainte de salvare.`}</p>
            ) : null}
            <div className="cdos-actions">
              <Button onClick={() => resume(step.current)}>Reia editarea pe versiunea actuală</Button>
              <Button variant="secondary" onClick={() => takeCurrent(step.current)}>Folosește versiunea actuală</Button>
            </div>
          </div>
        </div>
      ) : (
        <form className="ddocform" onSubmit={(event) => { event.preventDefault(); void save(); }} noValidate>
          <p className="ui-note">Se modifică doar datele descriptive. Fișierul încărcat rămâne neschimbat.</p>
          <label className="cdos-field" htmlFor={`${id}-title`} data-flagged={flagged.includes("title") || undefined}>
            <span>Titlu *</span>
            <input id={`${id}-title`} value={values.title} onChange={(event) => set("title", event.target.value)} maxLength={160} aria-invalid={!values.title.trim() || undefined} />
          </label>
          <div className="cdos-row">
            <label className="cdos-field" htmlFor={`${id}-kind`} data-flagged={flagged.includes("kind") || undefined}>
              <span>Tip</span>
              <select id={`${id}-kind`} value={values.kind} onChange={(event) => set("kind", event.target.value)}>
                {dossier.vocabulary.documentKinds.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {values.kind === "PHOTO" ? (
              <label className="cdos-field" htmlFor={`${id}-stage`} data-flagged={flagged.includes("photoStage") || undefined}>
                <span>Etapă *</span>
                <select id={`${id}-stage`} value={values.photoStage} onChange={(event) => set("photoStage", event.target.value)}>
                  <option value="" disabled>Alege etapa</option>
                  {dossier.vocabulary.photoStages.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="cdos-field" htmlFor={`${id}-number`} data-flagged={flagged.includes("documentNumber") || undefined}>
                <span>Număr</span>
                <input id={`${id}-number`} value={values.documentNumber} onChange={(event) => set("documentNumber", event.target.value)} maxLength={60} />
              </label>
            )}
          </div>
          <label className="cdos-field ddocform__date" htmlFor={`${id}-date`} data-flagged={flagged.includes("documentDate") || undefined}>
            <span>Data documentului</span>
            <input id={`${id}-date`} type="date" value={values.documentDate} onChange={(event) => set("documentDate", event.target.value)} />
          </label>
          <label className="cdos-field" htmlFor={`${id}-desc`} data-flagged={flagged.includes("description") || undefined}>
            <span>Descriere</span>
            <textarea id={`${id}-desc`} rows={3} value={values.description} onChange={(event) => set("description", event.target.value)} maxLength={2000} />
          </label>
          {/* The answer of the server and the actions stay together in the bar at the bottom. */}
          <div className="cdos-bar">
            <div ref={noticeRef} tabIndex={-1} className="ddocform__notice">
              {step.kind === "error" ? (
                <InlineAlert tone="error" title="Nu s-a salvat">{step.message}</InlineAlert>
              ) : step.kind === "conflict" ? (
                <InlineAlert tone="pending" title="Altcineva a modificat datele acestui document între timp.">
                  Valorile tale au rămas în formular și nu s-au salvat. Nimic nu s-a suprascris. Fișierul nu se schimbă.
                </InlineAlert>
              ) : step.kind === "gone" ? (
                <InlineAlert tone="error" title="Documentul nu mai există">Nu mai poate fi modificat; închide formularul.</InlineAlert>
              ) : resumed ? (
                <InlineAlert tone="pending" title="Editezi acum pe versiunea actuală.">
                  {flagged.length ? `Modificările tale au fost păstrate. ${capitalize(flaggedText)} fusese schimbat${flagged.length > 1 ? "e" : ""} și de altcineva — verifică înainte de salvare.` : "Modificările tale au fost păstrate; celelalte câmpuri sunt cele din versiunea actuală. Nimic nu e salvat încă."}
                </InlineAlert>
              ) : null}
            </div>
            <div className="cdos-actions">
              {step.kind === "conflict" ? (
                <>
                  <Button type="button" onClick={() => compare(step.current)}>Compară cu versiunea actuală</Button>
                  <Button type="button" variant="secondary" onClick={onClose}>Renunță</Button>
                </>
              ) : step.kind === "gone" ? (
                <Button type="button" variant="secondary" onClick={onClose}>Închide</Button>
              ) : (
                <>
                  <Button type="submit" disabled={busy || !dirty || !values.title.trim() || (values.kind === "PHOTO" && !values.photoStage)}>
                    {busy ? "Se salvează…" : step.kind === "error" ? "Încearcă din nou" : "Salvează"}
                  </Button>
                  <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Renunță</Button>
                </>
              )}
            </div>
          </div>
        </form>
      )}
    </DossierFormDialog>
  );
}

function shown(field: MetadataField, value: string): string {
  if (!value) return "(gol)";
  return field === "documentDate" ? formatDay(value) ?? value : value;
}

function capitalize(text: string): string {
  return text ? `${text.charAt(0).toLocaleUpperCase("ro")}${text.slice(1)}` : text;
}
