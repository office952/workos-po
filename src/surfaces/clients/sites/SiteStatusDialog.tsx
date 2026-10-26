import { useEffect, useRef, useState } from "react";
import { updateCustomerSite } from "../../../api/customerDossier";
import { readTransportErrorCode, TransportError } from "../../../api/http";
import { presentSite, type CustomerDossierModel, type DossierSite } from "../../../adapters/customerDossierAdapter";
import { asRecord } from "../../../adapters/record";
import { Button } from "../../../components/Button";
import { InlineAlert } from "../../../components/InlineAlert";
import { dossierErrorText, refreshCustomerDossier } from "../dossier/dossierModel";
import { DossierFormDialog } from "../dossier/dossierShared";
import { assignedHere } from "./sitesModel";

type Step = { kind: "confirm" } | { kind: "error"; message: string } | { kind: "conflict"; current: DossierSite } | { kind: "already"; current: DossierSite };

/**
 * Dezactivare (759:682 → în curs 759:831 → eroare 759:980 → succes 759:1284 · conflict 759:1132 ·
 * telefon 760:271) and reactivation, by the server's own rule (`PATCH …/sites/:id` with `status`
 * and the revision): an inactive site cannot be chosen for a request or a job; nothing is deleted
 * and no frozen address changes. The dialog says exactly that, with the real requests, jobs and
 * historical works of this site. A failure keeps the site as it was (retry); a version conflict
 * shows the current version and asks again; a site already in the asked state is said to be so.
 */
export function SiteStatusDialog({
  customerId,
  dossier,
  site,
  files,
  onClose,
  onDone,
}: {
  customerId: string;
  dossier: CustomerDossierModel;
  site: DossierSite;
  /** The documents and photos the Documente / Fotografii views show for this site. */
  files: { documents: number; photos: number | null };
  onClose: () => void;
  onDone: (site: DossierSite, status: "ACTIVE" | "INACTIVE") => void;
}) {
  const [current, setCurrent] = useState(site);
  const [step, setStep] = useState<Step>({ kind: "confirm" });
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step.kind !== "confirm") noticeRef.current?.focus();
  }, [step]);
  const target: "ACTIVE" | "INACTIVE" = site.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  const deactivate = target === "INACTIVE";
  const assigned = assignedHere(dossier, site.siteId);
  const historical = current.usage.historicalWorks;

  async function apply() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      await updateCustomerSite(customerId, current.siteId, { status: target, expectedRevision: current.revision });
      refreshCustomerDossier(customerId);
      onDone(current, target);
    } catch (caught) {
      const fresh = caught instanceof TransportError && caught.status === 409 && readTransportErrorCode(caught.body) === "stale_revision" ? presentSite(asRecord(caught.body)?.site) : null;
      if (fresh) {
        setCurrent(fresh);
        refreshCustomerDossier(customerId);
        setStep(fresh.status === target ? { kind: "already", current: fresh } : { kind: "conflict", current: fresh });
      } else {
        setStep({ kind: "error", message: caught instanceof TransportError && caught.status !== 0 ? dossierErrorText(caught) : "Operația nu a reușit." });
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const where = [current.address, current.city].filter(Boolean).join(", ");
  // What stays, with the numbers the views show for this site (Istoric, Documente, Fotografii).
  const kept = [
    historical ? (historical === 1 ? "lucrarea istorică" : `cele ${historical} lucrări istorice`) : null,
    files.documents ? (files.documents === 1 ? "documentul" : `cele ${files.documents} documente`) : null,
    files.photos === null ? "fotografiile" : files.photos ? (files.photos === 1 ? "fotografia" : `cele ${files.photos} fotografii`) : null,
  ].filter((part): part is string => Boolean(part));
  const keptText = kept.length ? `${kept.slice(0, -1).join(", ")}${kept.length > 1 ? " și " : ""}${kept.at(-1)}` : null;

  return (
    <DossierFormDialog framed title={deactivate ? `Dezactivezi „${current.name}”?` : `Reactivezi „${current.name}”?`} subtitle={`Sediu${where ? ` · ${where}` : ""}`} subject="Schimbarea stării sediului" dirty={false} busy={busy} onClose={onClose}>
      <div className="dsitestatus">
        {deactivate ? (
          <>
            <h3>Ce se schimbă</h3>
            <ul>
              <li>Sediul nu mai poate fi ales pentru o cerere sau o lucrare, nici la schimbarea sediului uneia existente.</li>
            </ul>
            <h3>Ce se păstrează</h3>
            <ul>
              {assigned.map((item) => (
                <li key={`${item.kind}:${item.label}`}>{`${item.kind === "REQUEST" ? "Cererea" : "Lucrarea"} ${item.label} rămâne la acest sediu, cu adresa de atunci.`}</li>
              ))}
              <li>{keptText ? `${capitalize(keptText)} ${kept.length === 1 && !keptText.startsWith("cele") ? "rămâne" : "rămân"} în dosar și în Istoric, filtrabile după sediu.` : "Activitatea sediului rămâne în dosar și în Istoric, filtrabilă după sediu."}</li>
              <li>Nimic nu se șterge și nicio adresă înghețată nu se schimbă.</li>
            </ul>
            <h3>Unde îl găsești</h3>
            <ul>
              <li>La sfârșitul listei Sedii, marcat INACTIV. Îl poți reactiva oricând.</li>
            </ul>
          </>
        ) : (
          <>
            <h3>Ce se schimbă</h3>
            <ul>
              <li>Sediul poate fi ales din nou pentru cereri și lucrări.</li>
            </ul>
            <h3>Ce se păstrează</h3>
            <ul>
              <li>Activitatea, documentele și fotografiile sediului rămân cum sunt; nicio adresă înghețată nu se schimbă.</li>
            </ul>
          </>
        )}
      </div>
      <div className="cdos-bar">
        <div ref={noticeRef} tabIndex={-1} className="ddocform__notice">
          {step.kind === "error" ? (
            <InlineAlert tone="error" title={deactivate ? "Dezactivarea nu s-a aplicat. Sediul a rămas activ." : "Reactivarea nu s-a aplicat. Sediul a rămas inactiv."}>{`${step.message} Nimic nu s-a schimbat. Poți reîncerca.`}</InlineAlert>
          ) : step.kind === "conflict" ? (
            <InlineAlert tone="pending" title={`Sediul a fost modificat între timp de altcineva (revizia ${step.current.revision}).`}>
              {`Nu s-a ${deactivate ? "dezactivat" : "reactivat"}. Datele de mai sus sunt cele actuale; verifică-le și confirmă din nou.`}
            </InlineAlert>
          ) : step.kind === "already" ? (
            <InlineAlert tone="pending" title={deactivate ? "Sediul este deja inactiv." : "Sediul este deja activ."}>Altcineva a schimbat starea între timp; nu mai e nimic de făcut.</InlineAlert>
          ) : null}
        </div>
        <div className="cdos-actions">
          {step.kind === "already" ? (
            <Button variant="secondary" onClick={onClose}>Închide</Button>
          ) : (
            <>
              <Button disabled={busy} onClick={() => void apply()}>
                {busy
                  ? deactivate ? "Se dezactivează…" : "Se reactivează…"
                  : step.kind === "error"
                    ? deactivate ? "Reîncearcă dezactivarea" : "Reîncearcă reactivarea"
                    : step.kind === "conflict"
                      ? deactivate ? "Dezactivează versiunea actuală" : "Reactivează versiunea actuală"
                      : deactivate ? "Dezactivează sediul" : "Reactivează sediul"}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={onClose}>Renunță</Button>
            </>
          )}
        </div>
      </div>
    </DossierFormDialog>
  );
}

function capitalize(text: string): string {
  return `${text.charAt(0).toLocaleUpperCase("ro")}${text.slice(1)}`;
}
