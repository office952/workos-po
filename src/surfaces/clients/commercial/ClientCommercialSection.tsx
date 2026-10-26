import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { saveCustomerCommercialTerms } from "../../../api/customerDossier";
import type { CustomerTransport } from "../../../api/types";
import { presentCommercialTermsVersion, type CommercialTermsModel, type DossierDocument } from "../../../adapters/customerDossierAdapter";
import { asRecord } from "../../../adapters/record";
import { Button } from "../../../components/Button";
import { CreationDialog } from "../../../components/CreationDialog";
import { ErrorState } from "../../../components/ErrorState";
import { InlineAlert } from "../../../components/InlineAlert";
import { formatTimestamp } from "../../../presentation/format";
import { clientHref } from "../../../routing/appRoute";
import { useUnsavedChangesGuard } from "../../../routing/useUnsavedChangesGuard";
import { DocumentViewer } from "../documents/DocumentViewer";
import { DOCUMENT_PARAM, useDocumentPreview } from "../documents/useDocumentPreview";
import { useBandMode } from "../dossier/bandModel";
import { refreshCustomerDossier, useCommercialTerms, useCustomerDossier } from "../dossier/dossierModel";
import { useEntryAction } from "../dossier/header/entryAction";
import { follow } from "../dossier/history/follow";
import { CommercialCompare } from "./CommercialCompare";
import { CommercialForm, type FieldNote } from "./CommercialForm";
import { CommercialRead } from "./CommercialRead";
import {
  contractDocuments,
  hasAnyValue,
  readLabel,
  readSaveFailure,
  readValue,
  resumeTermsOnCurrent,
  sameDraft,
  savedDetail,
  termsConflictRows,
  termsDraft,
  termsFields,
  termsPayload,
  versionLine,
  type TermsConflictRow,
  type TermsDraft,
  type TermsVersion,
} from "./termsModel";
import "../../../styles/surfaces/client-commercial.css";

type Step =
  | { kind: "edit" }
  | { kind: "invalid"; field: string }
  | { kind: "error" }
  | { kind: "conflict"; current: TermsVersion }
  | { kind: "compare"; current: TermsVersion; rows: TermsConflictRow[] };

// `taken`: each field that comes from a newer version, with the revision it was taken from (kept across a second conflict).
type Resumed = { revision: number; kept: string[]; taken: Record<string, number>; flagged: string[]; others: Record<string, string> };
type Notice = { kind: "saved" | "unchanged" | "discarded"; revision: number; detail: string | null };

function versionOf(model: CommercialTermsModel): TermsVersion {
  return { revision: model.revision, recordedAt: model.recordedAt, fields: model.fields };
}

/**
 * N-020 etapa 8 · Date comerciale (Figma 795:185 § 8). The page opens to read; „Modifică” (by the
 * server's `canEdit`) opens the form from the version read — in the page on a wide screen, over the
 * whole screen on a phone. One save at a time; a refused value is marked on its field; a failure
 * keeps every value; a version conflict (409 with the current version) keeps the draft and lets the
 * reader compare, resume on the current version or take it — nothing is saved by itself. After a
 * save the page shows the values the server confirmed; the header contacts and the billing address
 * in Sedii follow through the common refresh. Leaving with changes asks first and names where to.
 */
export function ClientCommercialSection({ customerId, search = "", customer = null }: { customerId: string; search?: string; customer?: CustomerTransport | null }) {
  const terms = useCommercialTerms(customerId);
  const dossier = useCustomerDossier(customerId);
  const mode = useBandMode();
  const phone = mode === "phone";
  const id = useId();
  const model = terms.data;

  const [editing, setEditing] = useState(false);
  const [base, setBase] = useState<TermsVersion | null>(null);
  const [draft, setDraft] = useState<TermsDraft>({});
  const [step, setStep] = useState<Step>({ kind: "edit" });
  const [resumed, setResumed] = useState<Resumed | null>(null);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // The version the server confirmed, shown until the re-read terms catch up with it.
  const [confirmed, setConfirmed] = useState<TermsVersion | null>(null);
  const sending = useRef(false);
  const editRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const compareRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<HTMLDivElement>(null);

  const previewHref = useCallback(
    (documentId: string | null) => (documentId ? `${clientHref(customerId, "comercial")}&${DOCUMENT_PARAM}=${encodeURIComponent(documentId)}` : clientHref(customerId, "comercial")),
    [customerId],
  );
  const preview = useDocumentPreview(search, previewHref);

  const fields = model ? termsFields(model) : [];
  const baseDraft = base ? termsDraft(base.fields) : {};
  const dirty = editing && (resumed !== null || !sameDraft(draft, baseDraft));

  function startEditing() {
    if (!model) return;
    const from = confirmed && confirmed.revision > model.revision ? confirmed : versionOf(model);
    setBase(from);
    setDraft(termsDraft(from.fields));
    setStep({ kind: "edit" });
    setResumed(null);
    setNotice(null);
    setClosing(false);
    setEditing(true);
  }

  function stopEditing(next: Notice | null = null) {
    setEditing(false);
    setStep({ kind: "edit" });
    setResumed(null);
    setClosing(false);
    setNotice(next);
  }

  // "Alte acțiuni · Modifică datele comerciale" from the header opens the form, as "Modifică" does.
  useEntryAction(search, "modifica", model?.canEdit === true && !editing, startEditing);

  // The form takes the focus on a wide screen (the phone dialog focuses its first field itself);
  // the comparison, a message or the result take it when the button pressed is gone.
  useEffect(() => {
    if (editing && !phone && step.kind === "edit" && !resumed) firstFieldRef.current?.focus();
    // Only when the form opens.
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (step.kind === "compare") compareRef.current?.focus();
    else if (step.kind === "invalid") document.getElementById(`${id}-${step.field}`)?.focus();
    else if (step.kind !== "edit") barRef.current?.focus();
    else if (resumed) {
      // The first field to check comes into view (754:27045 / 783:31053); the message keeps the focus.
      const first = resumed.flagged[0] ?? Object.keys(resumed.taken)[0];
      if (first) document.getElementById(`${id}-${first}`)?.scrollIntoView?.({ block: "center" });
      barRef.current?.focus({ preventScroll: true });
    }
  }, [step, resumed, id]);
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);
  // The question on closing with changes (phone) takes the focus; answering "Rămân" gives it back to the form.
  useEffect(() => {
    if (closing) closingRef.current?.focus();
  }, [closing]);

  async function save(): Promise<boolean> {
    if (!model || !base || sending.current) return false;
    sending.current = true;
    setBusy(true);
    try {
      const response = asRecord(await saveCustomerCommercialTerms(customerId, termsPayload(draft, base.revision)));
      const saved = presentCommercialTermsVersion(response?.terms, fields);
      refreshCustomerDossier(customerId);
      if (saved) setConfirmed(saved);
      const detail = resumed && saved ? savedDetail(model, saved, resumed.kept, resumed.taken) : null;
      stopEditing({ kind: response?.alreadyApplied === true ? "unchanged" : "saved", revision: saved?.revision ?? base.revision + 1, detail: detail || null });
      return true;
    } catch (caught) {
      const failure = readSaveFailure(caught);
      if (failure.kind === "conflict") {
        const current = presentCommercialTermsVersion(failure.current, fields) ?? { revision: base.revision + 1, recordedAt: null, fields: base.fields };
        refreshCustomerDossier(customerId);
        setStep({ kind: "conflict", current });
      } else if (failure.kind === "invalid") {
        setStep({ kind: "invalid", field: failure.field });
      } else {
        setStep({ kind: "error" });
      }
      return false;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  function resume(current: TermsVersion) {
    const currentDraft = termsDraft(current.fields);
    const next = resumeTermsOnCurrent(fields, baseDraft, draft, currentDraft);
    const flagged = next.kept.filter((key) => currentDraft[key] !== baseDraft[key] && currentDraft[key] !== draft[key]);
    setBase(current);
    setDraft(next.values);
    const taken = Object.fromEntries([...Object.entries(resumed?.taken ?? {}).filter(([key]) => !next.kept.includes(key)), ...next.taken.map((key) => [key, current.revision] as const)]);
    setResumed({ revision: current.revision, kept: next.kept, taken, flagged, others: Object.fromEntries(flagged.map((key) => [key, currentDraft[key] ?? ""])) });
    setStep({ kind: "edit" });
  }

  function takeCurrent(current: TermsVersion, rows: TermsConflictRow[]) {
    setConfirmed(current);
    const changed = rows.filter((row) => row.currentChanged).map((row) => `${readLabel(model ?? { labels: {} }, row.field)} ${readValue(row.field, current.fields[row.field]) ?? "necompletat"}`);
    stopEditing({ kind: "discarded", revision: current.revision, detail: changed.join(" · ") || null });
  }

  const guard = useUnsavedChangesGuard({ dirty, subject: "Datele comerciale", save, onDiscard: () => stopEditing() });

  if (terms.status === "error" && !model) return <ErrorState title="Datele comerciale nu au putut fi citite">Reîncearcă peste câteva momente.</ErrorState>;
  if (!model) return <p role="status">Se citesc datele comerciale…</p>;

  const shown: TermsVersion = confirmed && confirmed.revision > model.revision ? confirmed : versionOf(model);
  const contracts = contractDocuments(customerId, dossier.data ?? null);
  const referenceId = typeof shown.fields.referenceDocumentId === "string" ? shown.fields.referenceDocumentId : null;
  const reference = referenceId ? (dossier.data?.documents.find((document) => document.documentId === referenceId) ?? null) : null;
  const empty = shown.revision === 0 && !hasAnyValue(shown.fields);
  const older = Math.max(0, model.revisions.length - 1);
  const header = versionLine(editing && base ? base : shown, formatTimestamp, older, editing && !phone);
  const label = (key: string) => model.labels[key] ?? key;
  const show = (key: string, value: string) => {
    if (!value) return "necompletat";
    if (key === "referenceDocumentId") {
      const document = dossier.data?.documents.find((item) => item.documentId === value);
      return document ? [document.title, document.documentNumber].filter(Boolean).join(" · ") : "documentul ales";
    }
    return value;
  };

  const notes: Record<string, FieldNote> = {};
  if (resumed) {
    for (const key of resumed.flagged) notes[key] = { tone: "check", text: `Valoarea ta (${show(key, draft[key] ?? "")}). Revizia ${resumed.revision} avea ${show(key, resumed.others[key] ?? "")} — verifică-o înainte de salvare.` };
    for (const [key, revision] of Object.entries(resumed.taken)) notes[key] = { tone: "taken", text: `Din revizia ${revision} (nemodificat de tine).` };
  }

  const words = (keys: string[]) => keys.map((key) => `${readLabel(model, key)}: ${show(key, draft[key] ?? "")}`).join(", ");
  const barAlert =
    step.kind === "error" ? (
      <InlineAlert tone="error" title="Nu s-a salvat. Modificările tale au rămas în formular.">
        {`Operația nu a reușit. ${base && base.revision > 0 ? `Datele comerciale salvate au rămas cele din revizia ${base.revision}` : "Nu s-a salvat nicio versiune"}; poți reîncerca acum.`}
      </InlineAlert>
    ) : step.kind === "invalid" ? (
      <InlineAlert tone="error" title="Nu s-a salvat">{`Verifică valorile completate: ${label(step.field)}.`}</InlineAlert>
    ) : step.kind === "conflict" ? (
      <InlineAlert tone="pending" title={`Altcineva a salvat între timp revizia ${step.current.revision}${step.current.recordedAt ? ` (${formatTimestamp(step.current.recordedAt)})` : ""}.`}>
        <span className="dcom-alert__lines">
          <span>Modificările tale nu s-au salvat și nu s-au pierdut: au rămas în formular. Nimic nu s-a suprascris.</span>
          <span>{`Compară cele două versiuni, apoi reia editarea pe revizia ${step.current.revision}.`}</span>
        </span>
      </InlineAlert>
    ) : resumed ? (
      <div className="dcom-resumed">
      <InlineAlert tone="pending" title={`Editezi acum pe revizia ${resumed.revision}. Nimic nu e salvat încă.`}>
        {`${resumed.kept.length ? `${resumed.kept.length === 1 ? "Modificarea ta" : "Modificările tale"} (${words(resumed.kept)}) ${resumed.kept.length === 1 ? "a fost păstrată" : "au fost păstrate"}; restul valorilor sunt cele din revizia ${resumed.revision}` : `Valorile sunt cele din revizia ${resumed.revision}`}. Salvarea va crea revizia ${resumed.revision + 1}.`}
      </InlineAlert>
      </div>
    ) : null;

  const actions =
    step.kind === "conflict" ? (
      <>
        <Button onClick={() => setStep({ kind: "compare", current: step.current, rows: termsConflictRows(fields, baseDraft, draft, termsDraft(step.current.fields)) })}>{`Compară cu revizia ${step.current.revision}`}</Button>
        <Button variant="secondary" onClick={() => takeCurrent(step.current, termsConflictRows(fields, baseDraft, draft, termsDraft(step.current.fields)))}>Renunță la modificările mele</Button>
      </>
    ) : (
      <>
        {/* While the request runs the button keeps the focus (aria-disabled); a second press sends nothing. */}
        <Button type="submit" disabled={!busy && !dirty} aria-disabled={busy || undefined}>{busy ? "Se salvează…" : step.kind === "error" ? "Reîncearcă salvarea" : "Salvează datele comerciale"}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => stopEditing()}>{dirty ? "Renunță la modificări" : "Închide"}</Button>
      </>
    );

  const closeConfirm = closing ? (
    <div ref={closingRef} tabIndex={-1} className="dcom-closing" role="group" aria-labelledby={`${id}-closing`}>
      <p id={`${id}-closing`} className="dcom-closing__title">Ai modificări nesalvate</p>
      <p>Datele comerciale nu sunt salvate. Dacă închizi formularul: poți salva și continua, rămâne aici sau închide fără salvare.</p>
      <div className="cdos-actions">
        <Button disabled={busy} onClick={() => void save().then((ok) => (ok ? undefined : setClosing(false)))}>{busy ? "Se salvează…" : "Salvează și continuă"}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => setClosing(false)}>Rămân pe pagină</Button>
        <Button variant="secondary" disabled={busy} onClick={() => stopEditing()}>Închide fără salvare</Button>
      </div>
    </div>
  ) : null;

  const form =
    editing && base ? (
      step.kind === "compare" ? (
        <CommercialCompare
          phone={phone}
          baseRevision={base.revision}
          current={{ revision: step.current.revision, when: step.current.recordedAt ? formatTimestamp(step.current.recordedAt) : null }}
          rows={step.rows}
          label={label}
          shortLabel={(key) => readLabel(model, key)}
          show={show}
          headingRef={compareRef}
          onResume={() => resume(step.current)}
          onTakeCurrent={() => takeCurrent(step.current, step.rows)}
          onBack={phone ? undefined : () => setStep({ kind: "conflict", current: step.current })}
        />
      ) : (
        <form
          className="dcom-edit"
          aria-label="Modifică datele comerciale"
          aria-busy={busy || undefined}
          noValidate
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (step.kind !== "conflict") void save();
          }}
        >
          <CommercialForm
            idPrefix={id}
            model={model}
            draft={draft}
            contracts={contracts.choices}
            busy={busy}
            invalidField={step.kind === "invalid" ? step.field : null}
            notes={notes}
            firstFieldRef={firstFieldRef}
            onChange={(key, value) => {
              setDraft((current) => ({ ...current, [key]: value }));
              if (step.kind === "invalid" && step.field === key) setStep({ kind: "edit" });
            }}
          />
          <p className="dcom-edit__note">Salvarea înregistrează o versiune nouă. Ofertele, comenzile și documentele deja acceptate își păstrează condițiile proprii.</p>
          <div className={phone ? "cdos-bar" : "dcom-bar"} data-fixed={(!phone && barAlert !== null && step.kind !== "invalid") || undefined}>
            <div ref={barRef} tabIndex={-1} className="dcom-bar__notice">{closing ? null : barAlert}</div>
            {closeConfirm ?? <div className="cdos-actions">{actions}</div>}
          </div>
        </form>
      )
    ) : null;

  const openDocuments = (event: MouseEvent<HTMLAnchorElement>) => follow(event, contracts.href);

  return (
    <section className="cdos dcom" data-dossier-section="comercial" data-editing={(editing && !phone) || undefined} aria-labelledby={`${id}-title`}>
      {editing && !phone && step.kind === "compare" ? null : (
        <header className="dcom-head">
          <div className="dcom-head__text">
            <div className="dcom-head__line">
              <h2 id={`${id}-title`} className="dcom-title">Date comerciale</h2>
              <p className="dcom-head__meta">{header}</p>
            </div>
            <p className="dcom-head__notice">{model.notice}</p>
          </div>
          {model.canEdit && !(editing && !phone) ? (
            <Button ref={editRef} variant="primary" onClick={startEditing}>{empty ? "Completează" : "Modifică datele"}</Button>
          ) : null}
        </header>
      )}

      {!model.canEdit ? <InlineAlert tone="pending" title="Doar citire">Condițiile comerciale le modifică proprietarul organizației.</InlineAlert> : null}

      {notice && !(editing && !phone) ? (
        <div ref={noticeRef} tabIndex={-1} className="dcom-notice">
          {notice.kind === "discarded" ? (
            <InlineAlert tone="success" title="Ai renunțat la modificările tale.">
              {`Afișăm revizia ${notice.revision}, salvată de altcineva${notice.detail ? `: ${notice.detail}` : ""}.`}
            </InlineAlert>
          ) : notice.kind === "unchanged" ? (
            <InlineAlert tone="success" title="Nimic de salvat">{`Valorile sunt aceleași; revizia ${notice.revision} rămâne cea curentă.`}</InlineAlert>
          ) : (
            <InlineAlert tone="success" title={`Salvat ca revizia ${notice.revision}.`}>
              {notice.detail ? `${notice.detail}.` : "Versiunea nouă a fost înregistrată; versiunile anterioare rămân păstrate."}
            </InlineAlert>
          )}
        </div>
      ) : null}

      {editing && !phone ? (
        form
      ) : (
        <>
          {empty ? (
            <div className="dcom-empty">
              <p className="dcom-empty__title">Nicio dată comercială înregistrată</p>
              <p>CUI-ul și contactul principal rămân în fișa clientului. Denumirea legală, adresa de facturare, contactele și condițiile se completează aici, când sunt cunoscute.</p>
            </div>
          ) : (
            <CommercialRead model={model} version={shown} customer={customer} reference={reference} onPreview={(document: DossierDocument) => preview.open(document.documentId)} />
          )}
          <div className="dcom-contracts">
            <p>{contracts.summary}</p>
            {/* Its own row id: the Documente tab may lead to the same address, and Back returns the focus here. */}
            <a className="dcom-contracts__link" href={contracts.href} data-row-id="comercial:documente-contractuale" onClick={openDocuments}>Deschide în Documente →</a>
          </div>
        </>
      )}

      {editing && phone && base ? (
        <CreationDialog
          framed
          title={step.kind === "compare" ? `Compară cu revizia ${step.current.revision}` : "Modifică datele comerciale"}
          subtitle={
            step.kind === "compare"
              ? `Ai pornit de la revizia ${base.revision}`
              : resumed
                ? `revizia ${resumed.revision}${resumed.flagged.length ? ` · ${resumed.flagged.length} ${resumed.flagged.length === 1 ? "câmp de verificat" : "câmpuri de verificat"}` : ""}`
                : [customer?.displayName, base.revision > 0 ? `revizia ${base.revision}` : "nicio versiune salvată"].filter(Boolean).join(" · ")
          }
          busy={busy}
          onDismiss={() => {
            if (step.kind === "compare") setStep({ kind: "conflict", current: step.current });
            else if (dirty) setClosing(true);
            else stopEditing();
          }}
        >
          {form}
        </CreationDialog>
      ) : null}

      {preview.openId ? <DocumentViewer customerId={customerId} dossier={dossier.data ?? null} documentId={preview.openId} onClose={preview.close} /> : null}
      {guard}
    </section>
  );
}
