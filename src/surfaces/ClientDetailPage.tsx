import { useEffect, useState } from "react";
import "../styles/layout/pilot-page.css";
import "../styles/surfaces/clients.css";
import "../styles/surfaces/clients-agenda.css";
import "../styles/surfaces/client-hub.css";
import "../styles/surfaces/client-relation.css";
import "../styles/surfaces/client-dossier.css";
import "../styles/surfaces/client-history.css";
import "../styles/surfaces/client-band.css";
import "../styles/surfaces/client-hub-views.css";
import "../styles/surfaces/client-dossier-header.css";
import "../styles/surfaces/client-history-timeline.css";
import "../styles/surfaces/client-history-project.css";
import "../styles/surfaces/client-offer-row.css";
import "../styles/surfaces/client-result-bar.css";
import "../styles/surfaces/client-r1-shape.css";
import { Button } from "../components/Button";
import { ErrorState } from "../components/ErrorState";
import { SurfacePanel } from "../components/SurfacePanel";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadCustomerWorkspace } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { PageRegion } from "../layout/PageRegion";
import { CLIENT_HUB_FUTURE_COPY, CLIENT_HUB_SECTION_LABEL, isPreparingSection } from "../presentation/clientHub";
import { presentResourceAccess } from "../presentation/resourceAccess";
import { parseClientHubSection } from "../routing/appRoute";
import { ClientRequestsSection } from "./clients/requests/ClientRequestsSection";
import { ClientCommercialSection } from "./clients/commercial/ClientCommercialSection";
import { ClientDocumentsSection } from "./clients/documents/ClientDocumentsSection";
import { ClientHistorySection } from "./clients/dossier/ClientHistorySection";
import { ClientPhotosSection } from "./clients/photos/ClientPhotosSection";
import { ClientBand } from "./clients/dossier/ClientBand";
import { useCommercialTerms, useCustomerDossier } from "./clients/dossier/dossierModel";
import type { ClientAction } from "./clients/dossier/header/ClientActions";
import type { SectionAttention, SectionCounts } from "./clients/dossier/header/ClientSectionNav";
import { clientActionHref } from "./clients/dossier/header/entryAction";
import { CustomerLogoDialog } from "./clients/dossier/CustomerLogoDialog";
import { HistoricalWorkDialog } from "./clients/dossier/HistoricalWorkDialog";
import { ClientSitesSection } from "./clients/sites/ClientSitesSection";
import { ClientWorksSection } from "./clients/works/ClientWorksSection";
import {
  bindConfiguratorSessionToCustomer,
  readConfiguratorSession,
  writeConfiguratorSession,
} from "../session/configuratorSession";

type ClientDetailPageProps = {
  customerId: string;
  /** The current query; defaults to the window location for standalone renders. */
  search?: string;
};

/**
 * Dosarul clientului (N-020 design final · Figma 574:2203): one header for every section — the
 * identity, the principal contact and all contacts, "+ Cerere nouă" and "Alte acțiuni" by server
 * permission, and the section navigation; while scrolling it folds and stays at the top (579:6351,
 * phone 580:4114). Istoric is the default view. Every number, state and action comes from the
 * customer workspace, the commercial terms and the dossier projections.
 */
export function ClientDetailPage({ customerId, search = window.location.search }: ClientDetailPageProps) {
  const loaded = useResource(resourceKeys.customerWorkspace(customerId), () =>
    loadCustomerWorkspace(customerId),
  );
  const access = presentResourceAccess(loaded.error);
  const workspace = access === "denied" ? { ...loaded, data: undefined } : loaded;
  const customer = workspace.data?.customer;
  const section = parseClientHubSection(search);
  const dossier = useCustomerDossier(customerId);
  const terms = useCommercialTerms(customerId);
  // N-018 · right after "Client nou", the page says once that the client was registered.
  const [registered] = useState(() => {
    try {
      if (sessionStorage.getItem("workos.client.registered") !== customerId) return false;
      sessionStorage.removeItem("workos.client.registered");
      return true;
    } catch {
      return false;
    }
  });
  const [recording, setRecording] = useState(false);
  // N-023 · „Sigla clientului”, from „Alte acțiuni”.
  const [editingLogo, setEditingLogo] = useState(false);
  // The menu item that opened the dialog is gone: the focus goes back to „Alte acțiuni”.
  const closeLogoDialog = () => {
    setEditingLogo(false);
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".cdh-more__button")?.focus());
  };
  useEffect(() => {
    if (!customer || workspace.status !== "success") {
      return;
    }
    writeConfiguratorSession(
      bindConfiguratorSessionToCustomer(readConfiguratorSession(), customerId, customer.displayName),
    );
  }, [customer, customerId, workspace.status]);

  const canCreate = workspace.status === "success" && workspace.data?.canCreateRequest === true;
  const permissions = dossier.data?.permissions;
  // R1 (846:32109): the navigation has short labels; the counts are in each view. A dot marks a
  // section only where the server flags an offer, a request or a work as needing attention.
  const ws = workspace.data;
  const attention: SectionAttention = {
    cereri: ws && (ws.quotes.some((quote) => quote.needsAttention && !quote.superseded) || ws.requests.some((request) => request.needsAttention)) ? "necesită atenție" : null,
    lucrari: ws && ws.jobs.some((job) => job.needsAttention) ? "necesită atenție" : null,
  };
  const hints: SectionCounts = { lucrari: "În WorkOS și înregistrări istorice" };
  // One dominant action per screen: where the section shows its own primary action (by permission),
  // "Cerere nouă" takes the teal outline.
  const sectionPrimary =
    ((section === "documente" || section === "fotografii") && permissions?.uploadDocuments) ||
    (section === "sedii" && permissions?.editSites) ||
    (section === "comercial" && permissions?.editCommercialTerms);
  const createTone = sectionPrimary ? "accent" : "primary";
  // "Alte acțiuni" (Figma 579:5140): each item only with its server permission.
  const actions: ClientAction[] = [
    permissions?.recordHistoricalWork ? { key: "record", label: "Adaugă lucrare istorică", onSelect: () => setRecording(true) } : null,
    permissions?.uploadDocuments ? { key: "upload", label: "Încarcă document", href: clientActionHref(customerId, "documente", "incarca") } : null,
    permissions?.editSites ? { key: "site", label: "Adaugă sediu", href: clientActionHref(customerId, "sedii", "adauga") } : null,
    permissions?.editCommercialTerms ? { key: "terms", label: "Modifică datele comerciale", href: clientActionHref(customerId, "comercial", "modifica") } : null,
    permissions?.editLogo && ws ? { key: "logo", label: "Sigla clientului", onSelect: () => setEditingLogo(true) } : null,
  ].filter((action): action is ClientAction => action !== null);
  const contactsEditHref = permissions?.editCommercialTerms ? clientActionHref(customerId, "comercial", "modifica") : null;

  return (
    <PageRegion>
      <div className="chub" data-surface="client-hub" data-section={section}>
        <ClientBand
          customerId={customerId}
          customer={customer ?? null}
          logo={ws?.logo ?? null}
          terms={terms.data ?? null}
          canCreate={canCreate}
          actions={actions}
          section={section}
          attention={attention}
          hints={hints}
          contactsEditHref={contactsEditHref}
          createTone={createTone}
        />
        <div className="chub__body client-hub">
          {registered ? <p className="client-hub__registered" role="status">Clientul a fost înregistrat.</p> : null}
          {(workspace.status === "idle" || workspace.status === "loading") && !workspace.data ? (
            <p role="status">Se citește fișa clientului</p>
          ) : null}
          {workspace.status === "error" ? (
            <ErrorState title={access === "denied" ? "Acces refuzat" : "Clientul nu a putut fi citit"}>
              {access === "denied"
                ? "Nu ai acces la acest client în organizația curentă."
                : workspace.data
                  ? "Actualizarea a eșuat. Datele afișate sunt de la ultima citire reușită."
                  : "Datele clientului nu sunt disponibile."}
              <Button
                variant="secondary"
                onClick={() => invalidateResources(resourceKeys.customerWorkspace(customerId))}
              >
                Reîncearcă
              </Button>
            </ErrorState>
          ) : null}
          {/* N-020 · Istoric: the default view, with the former Relație summary on top. */}
          {workspace.data && section === "istoric" ? <ClientHistorySection key={customerId} customerId={customerId} search={search} workspace={workspace.data} canCreate={canCreate} onRecord={permissions?.recordHistoricalWork ? () => setRecording(true) : null} uploadHref={permissions?.uploadDocuments ? clientActionHref(customerId, "documente", "incarca") : null} /> : null}
          {/* Cereri și oferte (Corecții GO 17): Pe cereri / Toate ofertele, În așteptare, the offer preview. */}
          {workspace.data && section === "cereri" ? <ClientRequestsSection key={customerId} customerId={customerId} workspace={workspace.data} search={search} /> : null}
          {workspace.data && section === "lucrari" ? <ClientWorksSection customerId={customerId} search={search} /> : null}
          {workspace.data && section === "documente" ? <ClientDocumentsSection customerId={customerId} search={search} /> : null}
          {workspace.data && section === "fotografii" ? <ClientPhotosSection customerId={customerId} search={search} /> : null}
          {workspace.data && section === "sedii" ? <ClientSitesSection customerId={customerId} search={search} /> : null}
          {workspace.data && section === "comercial" ? <ClientCommercialSection customerId={customerId} search={search} customer={customer ?? null} /> : null}
          {workspace.data && isPreparingSection(section) ? (
            <SurfacePanel title={CLIENT_HUB_SECTION_LABEL[section]} label={CLIENT_HUB_SECTION_LABEL[section]} meta="În pregătire">
              <>
                <p className="client-hub__future client-hub__future-title">{CLIENT_HUB_FUTURE_COPY[section].title}</p>
                <p className="client-hub__future">{CLIENT_HUB_FUTURE_COPY[section].body}</p>
              </>
            </SurfacePanel>
          ) : null}
        </div>
      </div>
      {recording && dossier.data ? <HistoricalWorkDialog customerId={customerId} dossier={dossier.data} onClose={() => setRecording(false)} /> : null}
      {editingLogo && ws ? <CustomerLogoDialog customerId={customerId} name={ws.customer.displayName} logo={ws.logo} logoRevision={ws.logoRevision} onClose={closeLogoDialog} /> : null}
    </PageRegion>
  );
}
