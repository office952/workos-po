import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createCustomerSite, updateCustomerSite } from "../../../api/customerDossier";
import { readTransportErrorCode, TransportError } from "../../../api/http";
import { presentSite, type DossierSite } from "../../../adapters/customerDossierAdapter";
import { Button } from "../../../components/Button";
import { InlineAlert } from "../../../components/InlineAlert";
import { asRecord } from "../../../adapters/record";
import { dossierErrorText, refreshCustomerDossier } from "../dossier/dossierModel";
import { DossierFormDialog } from "../dossier/dossierShared";
import { resumeSiteOnCurrent, SITE_FIELD_LABELS, siteConflictRows, sitePayload, siteValues, type SiteConflictRow, type SiteField, type SiteValues } from "./sitesModel";
import "../../../styles/surfaces/client-document-dialogs.css";

type Step = { kind: "edit" } | { kind: "error"; message: string } | { kind: "conflict"; current: DossierSite } | { kind: "compare"; current: DossierSite; rows: SiteConflictRow[] };

/**
 * „Sediu nou” / „Modifică <sediu>” (715:432 → 715:696 · 715:925 → se salvează 715:1154 → eroare
 * 715:1383 → conflict 755:374 → compară 755:685 → reluare 773:829 · închidere 715:1841; telefon
 * 726:1330 / 726:1549 / 747:199; Noapte 727:76818). The server's fields and limits; one request
 * at a time; a failed save keeps the values. A version conflict (409 `stale_revision`, with the
 * current site in the answer) keeps the draft: the reader compares and resumes on the current
 * version, or takes it — nothing is merged or saved by itself, and a second conflict repeats the
 * same steps. Changing the site never rewrites the address a request or job kept from its day.
 */
export function SiteDialog({ customerId, site, onClose, onSaved }: { customerId: string; site: DossierSite | null; onClose: () => void; onSaved: (name: string, created: boolean) => void }) {
  const id = useId();
  const [base, setBase] = useState<{ values: SiteValues; revision: number }>(() => ({ values: siteValues(site), revision: site?.revision ?? 0 }));
  const [values, setValues] = useState<SiteValues>(() => siteValues(site));
  const [resumed, setResumed] = useState<{ revision: number; kept: SiteField[]; taken: SiteField[] } | null>(null);
  const [step, setStep] = useState<Step>({ kind: "edit" });
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  // The pressed button may be gone: the comparison, a message or the resumed form takes the focus.
  const compareRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step.kind === "compare") compareRef.current?.focus();
    else if (step.kind !== "edit" || resumed) noticeRef.current?.focus();
  }, [step, resumed]);
  const dirty = JSON.stringify(values) !== JSON.stringify(base.values) || resumed !== null;
  const set = (field: SiteField, value: string) => setValues((current) => ({ ...current, [field]: value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (sending.current || !values.name.trim()) return;
    sending.current = true;
    setBusy(true);
    try {
      if (site) await updateCustomerSite(customerId, site.siteId, { ...sitePayload(values), expectedRevision: base.revision });
      else await createCustomerSite(customerId, sitePayload(values));
      refreshCustomerDossier(customerId);
      onSaved(values.name.trim(), site === null);
    } catch (caught) {
      const current = caught instanceof TransportError && caught.status === 409 && readTransportErrorCode(caught.body) === "stale_revision" ? presentSite(asRecord(caught.body)?.site) : null;
      if (current) {
        refreshCustomerDossier(customerId);
        setStep({ kind: "conflict", current });
      } else {
        setStep({ kind: "error", message: caught instanceof TransportError && caught.status !== 0 ? dossierErrorText(caught) : "Operația nu a reușit." });
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  function resume(current: DossierSite) {
    const next = resumeSiteOnCurrent(base.values, values, siteValues(current));
    setBase({ values: siteValues(current), revision: current.revision });
    setValues(next.values);
    setResumed({ revision: current.revision, kept: next.kept, taken: next.taken });
    setStep({ kind: "edit" });
  }

  function takeCurrent(current: DossierSite) {
    setBase({ values: siteValues(current), revision: current.revision });
    setValues(siteValues(current));
    setResumed(null);
    setStep({ kind: "edit" });
  }

  const title = site ? `Modifică ${site.name}` : "Sediu nou";
  const words = (fields: SiteField[]) => fields.map((field) => SITE_FIELD_LABELS[field].toLocaleLowerCase("ro")).join(", ");

  return (
    <DossierFormDialog framed title={title} subtitle="Datele sediului" subject="Datele sediului" dirty={dirty} busy={busy} onClose={onClose}>
      {step.kind === "compare" ? (
        <div ref={compareRef} tabIndex={-1} className="ddocform dsiteform ddocform__compare">
          <p className="ddocform__label">Doar câmpurile care diferă</p>
          <ul className="ddocform__diff">
            {step.rows.map((row) => (
              <li key={row.field} data-both={(row.mineChanged && row.currentChanged) || undefined}>
                <p className="ddocform__diff-title">{SITE_FIELD_LABELS[row.field]}</p>
                <dl>
                  <div>
                    <dt>Înainte</dt>
                    <dd>{row.before || "(gol)"}</dd>
                  </div>
                  <div>
                    <dt>Ciorna ta</dt>
                    <dd>{row.mineChanged ? row.mine || "(gol)" : "neschimbat de tine"}</dd>
                  </div>
                  <div>
                    <dt>Versiunea actuală</dt>
                    <dd>{`${row.current || "(gol)"}${row.currentChanged ? "" : " (neschimbat)"}`}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <div className="cdos-bar">
            <p className="ui-note">
              {step.rows.some((row) => row.mineChanged && row.currentChanged)
                ? `${step.rows.filter((row) => row.mineChanged && row.currentChanged).map((row) => `„${SITE_FIELD_LABELS[row.field]}”`).join(", ")} a fost modificat și de tine, și de altcineva. La reluare rămâne textul tău; verifică-l înainte de salvare.`
                : "Nu s-au modificat aceleași câmpuri: la reluare, formularul are modificările tale și restul din versiunea actuală."}
            </p>
            <div className="cdos-actions">
              <Button onClick={() => resume(step.current)}>Reia editarea pe versiunea actuală</Button>
              <Button variant="secondary" onClick={() => takeCurrent(step.current)}>Folosește versiunea actuală</Button>
            </div>
          </div>
        </div>
      ) : (
        <form className="cdos-form dsiteform" onSubmit={save} noValidate aria-busy={busy || undefined}>
          <fieldset className="ddocupload__fields" disabled={busy}>
            <label className="cdos-field" htmlFor={`${id}-name`}>
              <span>Denumire *</span>
              <input id={`${id}-name`} maxLength={80} value={values.name} onChange={(event) => set("name", event.target.value)} aria-invalid={!values.name.trim() || undefined} />
            </label>
            <div className="dsiteform__row">
              <label className="cdos-field" htmlFor={`${id}-address`}>
                <span>Adresă</span>
                <input id={`${id}-address`} maxLength={200} value={values.address} onChange={(event) => set("address", event.target.value)} />
              </label>
              <label className="cdos-field" htmlFor={`${id}-city`}>
                <span>Localitate</span>
                <input id={`${id}-city`} maxLength={80} value={values.city} onChange={(event) => set("city", event.target.value)} />
              </label>
            </div>
            <div className="dsiteform__row">
              <label className="cdos-field" htmlFor={`${id}-contact`}>
                <span>Persoană de contact</span>
                <input id={`${id}-contact`} maxLength={80} value={values.contactName} onChange={(event) => set("contactName", event.target.value)} />
              </label>
              <label className="cdos-field" htmlFor={`${id}-phone`}>
                <span>Telefon</span>
                <input id={`${id}-phone`} type="tel" maxLength={40} value={values.phone} onChange={(event) => set("phone", event.target.value)} />
              </label>
            </div>
            <label className="cdos-field" htmlFor={`${id}-access`}>
              <span>Observații acces / montaj</span>
              <textarea id={`${id}-access`} rows={3} maxLength={2000} value={values.accessNotes} onChange={(event) => set("accessNotes", event.target.value)} />
            </label>
          </fieldset>
          <p className="ui-note">
            {site
              ? "Lucrările deja asociate păstrează și sediul așa cum era la data asocierii."
              : "Sediul este un loc de montaj; adresa de facturare rămâne în Date comerciale și nu se copiază aici."}
          </p>
          <div className="cdos-bar">
            <div ref={noticeRef} tabIndex={-1} className="ddocform__notice">
              {step.kind === "error" ? (
                <InlineAlert tone="error" title="Nu s-a salvat">{`${step.message} Valorile au rămas în formular; poți reîncerca.`}</InlineAlert>
              ) : step.kind === "conflict" ? (
                <InlineAlert tone="pending" title={`Altcineva a modificat sediul între timp (revizia ${step.current.revision}).`}>
                  Datele tale nu s-au salvat și nu s-au pierdut: au rămas în formular. Nimic nu s-a suprascris.
                </InlineAlert>
              ) : resumed ? (
                <InlineAlert tone="pending" title={`Editezi acum pe versiunea actuală (revizia ${resumed.revision}).`}>
                  {`${resumed.kept.length ? `Modificările tale (${words(resumed.kept)}) au fost păstrate` : "Nu ai modificări proprii"}${resumed.taken.length ? `; ${words(resumed.taken)} sunt cele din versiunea actuală` : ""}. Salvarea creează revizia ${resumed.revision + 1}.`}
                </InlineAlert>
              ) : null}
            </div>
            <div className="cdos-actions">
              {step.kind === "conflict" ? (
                <>
                  <Button type="button" onClick={() => setStep({ kind: "compare", current: step.current, rows: siteConflictRows(base.values, values, siteValues(step.current)) })}>Compară cu versiunea actuală</Button>
                  <Button type="button" variant="secondary" onClick={onClose}>Renunță la modificările mele</Button>
                </>
              ) : (
                <>
                  <Button type="submit" disabled={busy || !values.name.trim() || (site !== null && !dirty)}>{busy ? "Se salvează…" : "Salvează sediul"}</Button>
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
