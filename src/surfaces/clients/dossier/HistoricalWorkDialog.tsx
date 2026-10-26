import { useId, useState, type FormEvent } from "react";
import { createHistoricalWork, updateHistoricalWork } from "../../../api/customerDossier";
import { asRecord } from "../../../adapters/record";
import type { CustomerDossierModel } from "../../../adapters/customerDossierAdapter";
import { Button } from "../../../components/Button";
import { InlineAlert } from "../../../components/InlineAlert";
import { DocumentUploadForm } from "./DocumentUploadForm";
import { dossierErrorText, refreshCustomerDossier } from "./dossierModel";
import { DossierFormDialog } from "./dossierShared";

type Work = CustomerDossierModel["historicalWorks"][number];

/**
 * Records a work done before WorkOS, from what is known: title, when (year, month or day),
 * where, and a description. No operations, timesheets or acceptances are created for it.
 * After saving, its invoice or photos can be attached right away.
 */
export function HistoricalWorkDialog({
  customerId,
  dossier,
  work,
  onClose,
}: {
  customerId: string;
  dossier: CustomerDossierModel;
  work?: Work;
  onClose: () => void;
}) {
  const initial = {
    title: work?.title ?? "",
    eventDate: work?.eventDate ?? "",
    eventDateEnd: work?.eventDateEnd ?? "",
    reference: work?.reference ?? "",
    siteId: work?.siteId ?? "",
    description: work?.description ?? "",
  };
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ workId: string; title: string } | null>(null);
  const id = useId();
  const dirty = !saved && JSON.stringify(values) !== JSON.stringify(initial);
  const set = (key: keyof typeof values) => (event: { target: { value: string } }) => setValues({ ...values, [key]: event.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const payload = {
      title: values.title,
      eventDate: values.eventDate.trim(),
      eventDateEnd: values.eventDateEnd.trim() || null,
      reference: values.reference || null,
      siteId: values.siteId || null,
      description: values.description || null,
    };
    try {
      const response = work
        ? await updateHistoricalWork(customerId, work.workId, { ...payload, expectedRevision: work.revision })
        : await createHistoricalWork(customerId, payload);
      const created = asRecord(asRecord(response)?.work);
      refreshCustomerDossier(customerId);
      if (work) onClose();
      else setSaved({ workId: String(created?.workId ?? ""), title: values.title });
    } catch (caught) {
      setError(dossierErrorText(caught));
    } finally {
      setBusy(false);
    }
  }

  const sites = dossier.sites.filter((site) => site.status === "ACTIVE" || site.siteId === work?.siteId);
  return (
    <DossierFormDialog title={work ? "Modifică lucrarea istorică" : "Lucrare istorică"} subject="Datele lucrării istorice" dirty={dirty} busy={busy} onClose={onClose}>
      {saved ? (
        <div className="cdos-form">
          <InlineAlert tone="success" title="Lucrarea a fost înregistrată">
            {`„${saved.title}” apare în istoric, marcată ca înregistrare istorică.`} Poți atașa acum factura, recepția sau fotografiile.
          </InlineAlert>
          <DocumentUploadForm
            customerId={customerId}
            dossier={{ ...dossier, linkTargets: { ...dossier.linkTargets, historicalWorks: [...dossier.linkTargets.historicalWorks, { subjectId: saved.workId, label: saved.title }] } }}
            presetLinks={[{ kind: "HISTORICAL_WORK", subjectId: saved.workId }]}
            submitLabel="Încarcă pentru această lucrare"
            onDone={onClose}
            onCancel={onClose}
            cancelLabel="Închide"
          />
        </div>
      ) : (
        <form className="cdos-form" onSubmit={submit} noValidate>
          <p className="ui-note">Pentru lucrări anterioare sistemului. Se înregistrează doar ce se știe; nu se creează operații, pontaje sau acceptări.</p>
          <label className="cdos-field" htmlFor={`${id}-title`}>
            <span>Titlu *</span>
            <input id={`${id}-title`} required value={values.title} onChange={set("title")} maxLength={160} />
          </label>
          <div className="cdos-row">
            <label className="cdos-field" htmlFor={`${id}-date`}>
              <span>Data lucrării *</span>
              <input id={`${id}-date`} required value={values.eventDate} onChange={set("eventDate")} placeholder="2021 · 2021-06 · 2021-06-14" aria-describedby={`${id}-date-hint`} />
              <small id={`${id}-date-hint`}>An, lună sau zi — cât de precis se știe.</small>
            </label>
            <label className="cdos-field" htmlFor={`${id}-end`}>
              <span>Până la (opțional)</span>
              <input id={`${id}-end`} value={values.eventDateEnd} onChange={set("eventDateEnd")} placeholder="2021-07" />
            </label>
          </div>
          <div className="cdos-row">
            <label className="cdos-field" htmlFor={`${id}-ref`}>
              <span>Referință</span>
              <input id={`${id}-ref`} value={values.reference} onChange={set("reference")} maxLength={60} />
            </label>
            <label className="cdos-field" htmlFor={`${id}-site`}>
              <span>Sediu</span>
              <select id={`${id}-site`} value={values.siteId} onChange={set("siteId")}>
                <option value="">Fără sediu</option>
                {sites.map((site) => (
                  <option key={site.siteId} value={site.siteId}>{site.name}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="cdos-field" htmlFor={`${id}-desc`}>
            <span>Descriere</span>
            <textarea id={`${id}-desc`} rows={4} value={values.description} onChange={set("description")} maxLength={4000} />
          </label>
          {error ? <InlineAlert tone="error" title="Nu s-a salvat">{error}</InlineAlert> : null}
          <div className="cdos-actions">
            <Button type="submit" disabled={busy || !values.title.trim() || !values.eventDate.trim()}>{busy ? "Se salvează…" : "Salvează lucrarea"}</Button>
            <Button variant="secondary" disabled={busy} onClick={onClose}>Renunță</Button>
          </div>
        </form>
      )}
    </DossierFormDialog>
  );
}
