import { useEffect, useRef, useState } from "react";
import { assignCustomerSite } from "../../../api/customerDossier";
import type { CustomerDossierModel, DossierSite } from "../../../adapters/customerDossierAdapter";
import { InlineAlert } from "../../../components/InlineAlert";
import { useResource } from "../../../data/useResource";
import { clientHref } from "../../../routing/appRoute";
import { useBandMode } from "../dossier/bandModel";
import { dossierErrorText, formatDay, refreshCustomerDossier, useCommercialTerms, useCustomerDossier } from "../dossier/dossierModel";
import { DossierIcon, type DossierIconName } from "../dossier/dossierIcons";
import { useEntryAction } from "../dossier/header/entryAction";
import { allEntriesKey, loadAllEntries } from "../dossier/historyEntries";
import { countLabel } from "../dossier/historyModel";
import { NoPhoto, PhotoFrame } from "../dossier/historyParts";
import { PhotoViewer } from "../dossier/PhotoViewer";
import { useWorks } from "../works/useWorks";
import { SiteDialog } from "./SiteDialog";
import { SiteStatusDialog } from "./SiteStatusDialog";
import { summarizeSites, type SiteSummary } from "./sitesModel";
import "../../../styles/surfaces/client-sites.css";

const WORKS_PAGE_SIZE = 20;

/**
 * Sedii (N-020 etapa 7 · Figma 759:451 / 759:185, dezactivat 759:1284, 1280 778:730, 768 778:537,
 * telefon 778:185 / 778:361, Noapte 778:996, stări 716:185 / 716:451 / 716:682): the places where
 * the client receives work, apart from the billing address (kept in Date comerciale, never copied
 * here). Each card: name and state, address, contact, access notes, the latest documented photo
 * (before or after mounting, with its stage and date — never a simulation, never "today"), what
 * was done there and the way to the views filtered on it, each with the number that view shows.
 * Inactive sites stay, at the end (the server's order). A site is deactivated, never deleted.
 */
export function ClientSitesSection({ customerId, search = "" }: { customerId: string; search?: string }) {
  const dossier = useCustomerDossier(customerId);
  const history = useResource(allEntriesKey(customerId, {}), () => loadAllEntries(customerId, {}));
  // The same request as the unfiltered Lucrări list: its site facet is what Lucrări shows per site.
  const works = useWorks(customerId, { page: 1, pageSize: WORKS_PAGE_SIZE });
  const terms = useCommercialTerms(customerId);
  const mode = useBandMode();
  const [editing, setEditing] = useState<DossierSite | "new" | null>(null);
  const [status, setStatus] = useState<SiteSummary | null>(null);
  const [viewing, setViewing] = useState<SiteSummary | null>(null);
  const [notice, setNotice] = useState<{ title: string; text: string } | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);
  const data = dossier.data;
  // "Alte acțiuni · Adaugă sediu" from the header opens the same form as the button here.
  useEntryAction(search, "adauga", data?.permissions.editSites === true, () => setEditing("new"));

  if (dossier.status === "error" && !data) {
    return (
      <section className="dsites2" data-mode={mode} data-dossier-section="sedii" aria-labelledby="dsites-title">
        <h2 id="dsites-title" className="dsites2__title">Sedii</h2>
        <div className="dsites2__state" role="alert">
          <p className="dsites2__state-title">Sediile nu au putut fi citite</p>
          <p>Verifică legătura și încearcă din nou.</p>
          <button type="button" className="dsites2__button" onClick={() => refreshCustomerDossier(customerId)}>Încearcă din nou</button>
        </div>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="dsites2" data-mode={mode} data-dossier-section="sedii" aria-labelledby="dsites-title" aria-busy="true">
        <h2 id="dsites-title" className="dsites2__title">Sedii</h2>
        <p className="dsites2__state" role="status">Se citesc sediile clientului…</p>
      </section>
    );
  }
  const canEdit = data.permissions.editSites;
  const summaries = summarizeSites(customerId, data, history.data ?? null, works.data ?? null);
  const active = data.sites.filter((site) => site.status === "ACTIVE").length;
  const inactive = data.sites.length - active;
  const billing = terms.data ? (typeof terms.data.fields.billingAddress === "string" && terms.data.fields.billingAddress.trim() ? terms.data.fields.billingAddress : null) : undefined;
  const scope = data.sites.length
    ? `${countLabel(active, "sediu activ", "sedii active")}${inactive ? ` · ${inactive} inactiv${inactive === 1 ? "" : "e"}` : ""}${mode === "phone" ? "" : " · locurile unde se execută lucrările"}`
    : "Locurile de montaj ale clientului";

  return (
    <section className="dsites2" data-mode={mode} data-dossier-section="sedii" aria-labelledby="dsites-title">
      <header className="dsites2__head">
        <div className="dsites2__heading">
          <h2 id="dsites-title" className="dsites2__title">Sedii</h2>
          <p className="dsites2__scope">{scope}</p>
        </div>
        {canEdit ? (
          <button type="button" className="dsites2__add" onClick={() => setEditing("new")}>
            <DossierIcon name="plus" size={15} />
            Adaugă sediu
          </button>
        ) : null}
      </header>

      {data.sites.length && billing !== undefined ? (
        <div className="dsites2__billing">
          <p>{billing ? `Adresa de facturare${mode === "phone" ? "" : " a clientului"}: ${billing} · se modifică în Date comerciale` : "Adresa de facturare nu este completată · se completează în Date comerciale"}</p>
          <a className="dsites2__link" href={clientHref(customerId, "comercial")}>Date comerciale →</a>
        </div>
      ) : null}

      <div ref={noticeRef} tabIndex={-1} className="dsites2__notice-slot">
        {notice ? (
          <div className="dsites2__notice" role="status">
            <p className="dsites2__notice-title">{notice.title}</p>
            <p>{notice.text}</p>
          </div>
        ) : null}
      </div>

      {data.sites.length === 0 ? (
        <div className="dsites2__state dsites2__state--empty">
          <p className="dsites2__state-title">Niciun sediu</p>
          <p>Un client simplu poate rămâne fără sedii. Adaugă unul când lucrările se fac în locuri diferite.</p>
        </div>
      ) : (
        <ul className="dsites2__list">
          {summaries.map((summary) => (
            <SiteCard key={summary.site.siteId} summary={summary} canEdit={canEdit} onEdit={() => setEditing(summary.site)} onStatus={() => setStatus(summary)} onPhoto={() => setViewing(summary)} />
          ))}
        </ul>
      )}

      {data.sites.length > 0 && (data.linkTargets.requests.length > 0 || data.linkTargets.jobs.length > 0) ? <SiteAssignments customerId={customerId} data={data} canEdit={canEdit} /> : null}

      {viewing?.photo ? (
        <PhotoViewer
          photos={viewing.photo.group.shown.map((tile) => tile.photo)}
          startId={viewing.photo.document.documentId}
          context={viewing.photo.group.entry.title}
          origin={viewing.photo.group.open}
          note={`Colecția: fotografiile acestei lucrări de la ${viewing.site.name} · închiderea revine la Sedii`}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {editing ? (
        <SiteDialog
          customerId={customerId}
          site={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(name, created) => {
            setEditing(null);
            setNotice({ title: created ? `„${name}” a fost adăugat.` : `„${name}” a fost salvat.`, text: created ? "Poate fi ales acum pentru cereri și lucrări." : "Cererile și lucrările deja asociate păstrează adresa de la data asocierii." });
          }}
        />
      ) : null}
      {status ? (
        <SiteStatusDialog
          customerId={customerId}
          dossier={data}
          site={status.site}
          files={{ documents: status.destinations[2]?.count ?? 0, photos: status.destinations[3]?.count ?? null }}
          onClose={() => setStatus(null)}
          onDone={(site, next) => {
            setStatus(null);
            setNotice(
              next === "INACTIVE"
                ? { title: `„${site.name}” a fost dezactivat.`, text: "Rămâne în dosar și în Istoric; nu mai poate fi ales pentru cereri sau lucrări. Îl poți reactiva." }
                : { title: `„${site.name}” a fost reactivat.`, text: "Poate fi ales din nou pentru cereri și lucrări." },
            );
          }}
        />
      ) : null}
    </section>
  );
}

const SITE_DESTINATION_ICON: Record<string, DossierIconName | undefined> = { Istoric: "history", Lucrări: "wrench", Documente: "file", Fotografii: "photo" };

function SiteCard({ summary, canEdit, onEdit, onStatus, onPhoto }: { summary: SiteSummary; canEdit: boolean; onEdit: () => void; onStatus: () => void; onPhoto: () => void }) {
  const { site, photo, destinations, direct, last } = summary;
  const address = [site.address, site.city].filter(Boolean).join(", ");
  const contact = site.contactName || site.phone ? (
    <>
      {`Contact la sediu: ${site.contactName ?? "nume necompletat"}`}
      {site.phone ? (
        <>
          {" · "}
          <a href={`tel:${site.phone.replace(/\s+/g, "")}`}>{site.phone}</a>
        </>
      ) : (
        " · telefon necompletat"
      )}
    </>
  ) : (
    "Contact necompletat"
  );
  const caption = photo ? `Ultima fotografie documentată · ${photo.document.photoStageLabel ?? "fără etapă"} · ${formatDay(photo.document.documentDate) ?? `încărcată ${formatDay(photo.document.uploadedAt) ?? ""}`} · nu arată neapărat starea de azi` : "Nicio fotografie Înainte sau După montaj la acest sediu";
  return (
    <li className="dsite2" data-status={site.status} data-photo={photo ? true : undefined}>
      <div className="dsite2__media">
        {photo ? (
          <PhotoFrame document={photo.document} size="card" onOpen={onPhoto} label={`Deschide ultima fotografie documentată de la ${site.name}`} />
        ) : (
          <NoPhoto size="card" text="Nicio fotografie documentată" />
        )}
        <p className="dsite2__caption">{caption}</p>
      </div>
      <div className="dsite2__body">
        <div className="dsite2__title-row">
          <h3 className="dsite2__name">{site.name}</h3>
          {site.status !== "ACTIVE" ? <span className="dsite2__badge">{site.statusLabel.toLocaleUpperCase("ro")}</span> : null}
        </div>
        <p className="dsite2__address">
          <DossierIcon name="site" size={13} />
          <span>{address || "Adresă necompletată"}</span>
        </p>
        <p className="dsite2__contact">{contact}</p>
        {site.accessNotes ? (
          <p className="dsite2__access">
            <DossierIcon name="warning" size={14} />
            <span>{site.accessNotes}</span>
          </p>
        ) : null}
        <p className="dsite2__usage">
          {[countLabel(site.usage.requests, "cerere", "cereri"), countLabel(site.usage.jobs, "lucrare WorkOS", "lucrări WorkOS"), countLabel(site.usage.historicalWorks, "lucrare istorică", "lucrări istorice")].join(" · ")}
        </p>
        <p className="dsite2__last">{last ? `Ultima intrare: ${last.title} · ${last.eventDateLabel}` : destinations[0]?.count === 0 ? "Nicio intrare în istoric la acest sediu." : ""}</p>
        {/* data-row-id: Back returns the focus to this exact link (the tabs may carry the same href). */}
        <div className="dsite2__foot">
          <p className="dsite2__go">
            {destinations.map((destination) => (
              <a key={destination.label} className="dsite2__dest" data-row-id={`site:${site.siteId}:${destination.label}`} data-zero={destination.count === 0 || undefined} href={destination.href} aria-label={destination.count === null ? `${destination.label} la ${site.name}` : `${destination.label} · ${destination.count} la ${site.name}`}>
                {SITE_DESTINATION_ICON[destination.label] ? <DossierIcon name={SITE_DESTINATION_ICON[destination.label]!} size={14} /> : null}
                <span className="dsite2__dest-label">{destination.label}</span>
                {destination.count === null ? null : <span className="dsite2__dest-count">{destination.count}</span>}
                {destination.count === 0 ? null : <span className="dsite2__dest-arrow" aria-hidden="true">›</span>}
              </a>
            ))}
          </p>
          {/* R1 (854:32977): what is attached to the site itself, right under the destinations that include it. */}
          <p className="dsite2__direct">
            {`Atașate direct sediului: ${countLabel(direct.documents, "document", "documente")} · ${countLabel(direct.photos, "fotografie", "fotografii")}${direct.documents + direct.photos ? ` (${direct.documents + direct.photos === 1 ? "inclus" : "incluse"} în totalurile de mai sus)` : ""}`}
          </p>
          {canEdit ? (
            <p className="dsite2__actions">
              <button type="button" onClick={onEdit} aria-label={`Modifică ${site.name}`}>Modifică</button>
              <button type="button" onClick={onStatus} aria-label={`${site.status === "ACTIVE" ? "Dezactivează" : "Reactivează"} ${site.name}`}>
                {site.status === "ACTIVE" ? "Dezactivează" : "Reactivează"}
              </button>
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** "Sediul fiecărei cereri și lucrări" (759:185 / 759:1284): one choice per request or job. */
function SiteAssignments({ customerId, data, canEdit }: { customerId: string; data: CustomerDossierModel; canEdit: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = [
    ...data.linkTargets.requests.map((target) => ({ ...target, kind: "REQUEST" as const, kindLabel: "Cerere" })),
    ...data.linkTargets.jobs.map((target) => ({ ...target, kind: "JOB" as const, kindLabel: "Lucrare" })),
  ];
  const siteOf = (kind: string, subjectId: string) => data.siteAssignments.find((item) => item.subjectKind === kind && item.subjectId === subjectId)?.siteId ?? "";
  async function assign(key: string, kind: "REQUEST" | "JOB", subjectId: string, siteId: string | null) {
    setBusy(key);
    setError(null);
    try {
      await assignCustomerSite(customerId, kind, subjectId, siteId);
      refreshCustomerDossier(customerId);
    } catch (caught) {
      setError(dossierErrorText(caught));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="dsites2__assign" aria-labelledby="dsites-assign">
      <h3 id="dsites-assign" className="dsites2__assign-title">Sediul fiecărei cereri și lucrări</h3>
      <p className="dsites2__assign-note">La alegerea sediului, cererea sau lucrarea păstrează adresa de atunci; modificarea ulterioară a sediului nu o rescrie.</p>
      {data.sites.some((site) => site.status !== "ACTIVE") ? <p className="dsites2__assign-note">Sediul inactiv apare în selector doar acolo unde era deja ales; nu poate fi ales pentru alte cereri sau lucrări.</p> : null}
      {error ? <InlineAlert tone="error" title="Sediul nu s-a schimbat">{error}</InlineAlert> : null}
      <ul className="dsites2__assign-list">
        {rows.map((row) => {
          const current = siteOf(row.kind, row.subjectId);
          const key = `${row.kind}:${row.subjectId}`;
          return (
            <li key={key} className="dsites2__assign-row">
              <p>
                <span className="dsites2__assign-kind">{row.kindLabel.toLocaleUpperCase("ro")}</span>
                <span>{row.label}</span>
              </p>
              <select aria-label={`Sediul pentru ${row.label}`} value={current} disabled={!canEdit || busy === key} onChange={(event) => void assign(key, row.kind, row.subjectId, event.target.value || null)}>
                <option value="">Fără sediu</option>
                {data.sites
                  .filter((site) => site.status === "ACTIVE" || site.siteId === current)
                  .map((site) => (
                    <option key={site.siteId} value={site.siteId}>{site.status === "ACTIVE" ? site.name : `${site.name} (inactiv)`}</option>
                  ))}
              </select>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
