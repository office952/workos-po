import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { uploadCustomerDocument } from "../../../api/customerDossier";
import type { CustomerDossierModel } from "../../../adapters/customerDossierAdapter";
import { Button } from "../../../components/Button";
import { InlineAlert } from "../../../components/InlineAlert";
import { dossierErrorText, formatBytes, refreshCustomerDossier } from "./dossierModel";
import "../../../styles/surfaces/client-document-dialogs.css";

export type LinkChoice = { kind: "SITE" | "REQUEST" | "JOB" | "HISTORICAL_WORK"; subjectId: string };

/** The three columns of the association choice (672:16509): sites, requests, works and records. */
const LINK_COLUMNS: Array<{ label: string; groups: Array<{ kind: LinkChoice["kind"]; key: keyof CustomerDossierModel["linkTargets"] }> }> = [
  { label: "Sedii", groups: [{ kind: "SITE", key: "sites" }] },
  { label: "Cereri", groups: [{ kind: "REQUEST", key: "requests" }] },
  { label: "Lucrări și înregistrări", groups: [{ kind: "JOB", key: "jobs" }, { kind: "HISTORICAL_WORK", key: "historicalWorks" }] },
];

/** The association picker of an upload (and of Fotografii): the client's sites, requests and works. */
export function LinkPicker({
  dossier,
  value,
  onChange,
  exclude = [],
  disabled = false,
}: {
  dossier: CustomerDossierModel;
  value: LinkChoice[];
  onChange: (next: LinkChoice[]) => void;
  exclude?: LinkChoice[];
  disabled?: boolean;
}) {
  const has = (choice: LinkChoice, list: LinkChoice[]) => list.some((item) => item.kind === choice.kind && item.subjectId === choice.subjectId);
  const columns = LINK_COLUMNS.map((column) => ({
    ...column,
    targets: column.groups.flatMap((group) => dossier.linkTargets[group.key].filter((target) => !has({ kind: group.kind, subjectId: target.subjectId }, exclude)).map((target) => ({ ...target, kind: group.kind }))),
  })).filter((column) => column.targets.length > 0);
  if (columns.length === 0) return <p className="ui-note">Clientul nu are încă sedii, cereri sau lucrări de asociat. Documentul rămâne în dosarul clientului.</p>;
  return (
    <div className="cdos-links" data-columns={columns.length}>
      {columns.map((column) => (
        <fieldset key={column.label} className="cdos-links__group" disabled={disabled}>
          <legend>{column.label}</legend>
          {column.targets.map((target) => {
            const choice = { kind: target.kind, subjectId: target.subjectId };
            const checked = has(choice, value);
            return (
              <label key={`${target.kind}:${target.subjectId}`} className="cdos-check">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange(checked ? value.filter((item) => !(item.kind === choice.kind && item.subjectId === choice.subjectId)) : [...value, choice])}
                />
                <span>{target.label}</span>
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

/**
 * „Încarcă document” (672:16509 → se încarcă 672:16794 → eroare 672:17082 → reușit 672:17372 ·
 * închidere 672:17657; telefon 673:17851): one file per upload, within the server's limit, with
 * its type, the date and number written on it when known, and optional associations. While the
 * upload is on its way the form is locked and nothing is sent twice; a failure keeps every value
 * for a retry; a success says so, clears the file and keeps the type and associations for the
 * next one. Uploading records a file — it does not mean signed, approved or paid.
 */
export function DocumentUploadForm({
  customerId,
  dossier,
  presetLinks = [],
  defaultKind = "",
  submitLabel = "Încarcă",
  cancelLabel = "Renunță",
  onDone,
  onCancel,
  onDirtyChange,
  onBusyChange,
}: {
  customerId: string;
  dossier: CustomerDossierModel;
  presetLinks?: LinkChoice[];
  defaultKind?: string;
  submitLabel?: string;
  cancelLabel?: string;
  onDone: () => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** True while the upload is on its way: the dialog then cannot be closed or left. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const sending = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState(defaultKind);
  const [photoStage, setPhotoStage] = useState("");
  const [title, setTitle] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [description, setDescription] = useState("");
  const [links, setLinks] = useState<LinkChoice[]>(presetLinks);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{ title: string; where: string | null } | null>(null);
  const photo = kind === "PHOTO";
  // A chosen image is shown before it is sent (707:23176); the object URL lives as long as the choice.
  const preview = useMemo(() => (file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  // The pressed button is disabled while the upload is on its way (and after a success, with no
  // file chosen): the wait message, then the answer, take the focus instead of the page.
  const doneRef = useRef<HTMLDivElement>(null);
  const waitRef = useRef<HTMLSpanElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (busy) waitRef.current?.focus();
  }, [busy]);
  useEffect(() => {
    if (uploaded) doneRef.current?.focus();
  }, [uploaded]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const dirty = Boolean(file || title || documentNumber || documentDate || description);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);

  const limit = dossier.vocabulary.maxFileBytes;
  const tooLarge = file !== null && limit > 0 && file.size > limit;
  const ready = file !== null && kind !== "" && (kind !== "PHOTO" || photoStage !== "") && !tooLarge;

  async function submit(event: FormEvent) {
    event.preventDefault();
    // One request at a time: a second click, Enter or a double submit is ignored until the answer.
    if (!ready || sending.current || !file) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    setUploaded(null);
    try {
      await uploadCustomerDocument(customerId, file, {
        kind,
        photoStage: kind === "PHOTO" ? photoStage : "",
        title,
        // A photo has no number field: nothing typed before switching to "Fotografie" is sent.
        documentNumber: photo ? "" : documentNumber,
        documentDate,
        description,
        links: JSON.stringify(links),
      });
      refreshCustomerDossier(customerId);
      setUploaded({ title: title.trim() || file.name, where: photo ? photoPlace(dossier, links, photoStage) : null });
      setFile(null);
      setTitle("");
      setDocumentNumber("");
      setDocumentDate("");
      setDescription("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (caught) {
      setError(dossierErrorText(caught));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <form className="cdos-form ddocupload" onSubmit={submit} noValidate aria-busy={busy || undefined}>
      <div ref={doneRef} tabIndex={-1} className="ddocupload__done">
        {uploaded ? (
          <InlineAlert tone="success" title={photo ? "Fotografia a fost încărcată" : "Documentul a fost încărcat"}>
            {photo
              ? `„${uploaded.title}” ${uploaded.where ?? "apare acum în galerie"}. Poți încărca încă una cu aceleași asocieri sau poți închide.`
              : `„${uploaded.title}” apare acum în dosar. Poți încărca încă un fișier cu aceleași asocieri sau poți închide.`}
          </InlineAlert>
        ) : null}
      </div>
      <div className="cdos-field">
        <span id={`${id}-file-label`}>Fișier *</span>
        <div className="ddocupload__file" data-empty={!file || undefined}>
          {preview ? <img className="ddocupload__thumb" src={preview} alt="" /> : null}
          <label className="ddocupload__pick" htmlFor={`${id}-file`} aria-disabled={busy || undefined}>
            {file ? "Schimbă fișierul" : "Alege fișierul"}
            <input ref={fileRef} id={`${id}-file`} className="u-visually-hidden" type="file" disabled={busy} aria-labelledby={`${id}-file-label`} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <span className="ddocupload__name">{file ? `${file.name} · ${formatBytes(file.size)}` : "Niciun fișier ales"}</span>
        </div>
        <small>{`Un singur fișier pe încărcare${limit > 0 ? ` · maximum ${limit % (1024 * 1024) === 0 ? `${limit / (1024 * 1024)} MB` : formatBytes(limit)}` : ""} · PDF și imaginile se previzualizează; celelalte tipuri se descarcă.`}</small>
        {tooLarge ? <small className="cdos-field__error">{`Fișierul depășește limita de ${formatBytes(limit)}.`}</small> : null}
      </div>
      <fieldset className="ddocupload__fields" disabled={busy}>
        <div className="cdos-row" data-photo={photo || undefined}>
          <label className="cdos-field" htmlFor={`${id}-kind`}>
            <span>Tip *</span>
            <select id={`${id}-kind`} value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="" disabled>Alege tipul</option>
              {dossier.vocabulary.documentKinds.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {kind === "PHOTO" ? (
            <label className="cdos-field" htmlFor={`${id}-stage`}>
              <span>Etapă *</span>
              <select id={`${id}-stage`} value={photoStage} onChange={(event) => setPhotoStage(event.target.value)}>
                <option value="" disabled>Alege etapa</option>
                {dossier.vocabulary.photoStages.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="cdos-field" htmlFor={`${id}-date`}>
            <span>{photo ? "Data fotografiei" : "Data documentului"}</span>
            <input id={`${id}-date`} type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} />
          </label>
        </div>
        <label className="cdos-field" htmlFor={`${id}-title`}>
          <span>Titlu</span>
          <input id={`${id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Implicit: numele fișierului" maxLength={160} />
        </label>
        {/* A photo has no number (707:23176); the field stays for every other file. */}
        {photo ? null : (
          <label className="cdos-field" htmlFor={`${id}-number`}>
            <span>Număr (dacă se știe)</span>
            <input id={`${id}-number`} value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} maxLength={60} />
          </label>
        )}
        <label className="cdos-field" htmlFor={`${id}-desc`}>
          <span>Descriere (opțional)</span>
          <textarea id={`${id}-desc`} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} />
        </label>
        <div className="cdos-field">
          <span>Asociază cu (opțional)</span>
          <LinkPicker dossier={dossier} value={links} onChange={setLinks} disabled={busy} />
        </div>
      </fieldset>
      <p className="ui-note">
        {photo
          ? "Fotografia apare o singură dată în total, chiar dacă e asociată mai multor obiecte. Etapa „Simulare” nu dovedește montajul."
          : "Încărcarea nu marchează documentul ca semnat, aprobat sau plătit."}
      </p>
      <div className="cdos-bar">
        <div ref={errorRef} tabIndex={-1} className="ddocupload__done">
          {error ? (
            <InlineAlert tone="error" title="Nu s-a încărcat">
              {error.includes("formular") ? error : `${error} Datele completate au rămas în formular; încearcă din nou.`}
            </InlineAlert>
          ) : null}
        </div>
        <div className="cdos-actions">
          <Button type="submit" disabled={!ready || busy}>{busy ? "Se încarcă…" : error ? "Încearcă din nou" : submitLabel}</Button>
          {busy ? (
            <span ref={waitRef} tabIndex={-1} className="ddocupload__wait" role="status">Trimiterea e blocată până la răspuns.</span>
          ) : (
            <Button variant="secondary" onClick={uploaded && !dirty ? onDone : onCancel}>{uploaded && !dirty ? "Închide" : cancelLabel}</Button>
          )}
        </div>
      </div>
    </form>
  );
}

/** Where a new photo shows in Fotografii (677:19575): the groups of what it is attached to, else its own. */
function photoPlace(dossier: CustomerDossierModel, links: LinkChoice[], stage: string): string {
  const stageLabel = dossier.vocabulary.photoStages.find((option) => option.value === stage)?.label ?? null;
  const label = (choice: LinkChoice) => {
    const key = choice.kind === "REQUEST" ? "requests" : choice.kind === "JOB" ? "jobs" : choice.kind === "HISTORICAL_WORK" ? "historicalWorks" : null;
    return key ? (dossier.linkTargets[key].find((target) => target.subjectId === choice.subjectId)?.label ?? null) : null;
  };
  const groups = links.map(label).filter((value): value is string => Boolean(value));
  const where = groups.length ? `apare în ${groups.length === 1 ? "grupul" : "grupurile"} ${groups.map((name) => `„${name}”`).join(", ")}` : "apare ca grup propriu, după data ei";
  return stageLabel ? `${where}, etapa ${stageLabel}` : where;
}
