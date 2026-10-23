import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import "../styles/layout/pilot-page.css";
import "../styles/surfaces/clients.css";
import "../styles/surfaces/clients-agenda.css";
import "../styles/surfaces/client-hub.css";
import "../styles/surfaces/client-relation.css";
import type { CustomerTransport, CustomerWorkspaceTransport } from "../api/types";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadCustomerWorkspace } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { PageRegion } from "../layout/PageRegion";
import {
  CLIENT_HUB_FUTURE_COPY,
  CLIENT_HUB_PREPARING_SECTIONS,
  CLIENT_HUB_PRIMARY_SECTIONS,
  CLIENT_HUB_SECTION_LABEL,
  isPreparingSection,
} from "../presentation/clientHub";
import { presentResourceAccess } from "../presentation/resourceAccess";
import { statusTone } from "../presentation/statusTone";
import {
  clientHref,
  clientsHref,
  newRequestHref,
  parseClientHubSection,
  type ClientHubSection,
} from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import { hrefPath, originBack } from "../routing/originBack";
import { ClientRelation } from "./clients/ClientRelation";
import { agendaLetter, contactFacts } from "./clients/clientsAgendaModel";
import { Monogram } from "./clients/ClientsRegister";
import { jobRow, quoteRow, requestRow, type HubRow } from "./clients/clientRelationModel";
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
 * Fișa clientului (N-018 · V2.2 183:4345, 183:4546, 244:7033): a compact agenda header with the
 * useful contacts and "Cerere nouă" next to the identity, then three working sections. Sections
 * without a source are grouped under "Mai multe" and marked "În pregătire". Every number, state
 * and action comes from the customer workspace.
 */
export function ClientDetailPage({ customerId, search = window.location.search }: ClientDetailPageProps) {
  const loaded = useResource(resourceKeys.customerWorkspace(customerId), () =>
    loadCustomerWorkspace(customerId),
  );
  const access = presentResourceAccess(loaded.error);
  const workspace = access === "denied" ? { ...loaded, data: undefined } : loaded;
  const customer = workspace.data?.customer;
  const section = parseClientHubSection(search);
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
  useEffect(() => {
    if (!customer || workspace.status !== "success") {
      return;
    }
    writeConfiguratorSession(
      bindConfiguratorSessionToCustomer(readConfiguratorSession(), customerId, customer.displayName),
    );
  }, [customer, customerId, workspace.status]);

  const canCreate = workspace.status === "success" && workspace.data?.canCreateRequest === true;

  return (
    <PageRegion>
      <div className="chub" data-surface="client-hub" data-section={section} data-can-create={canCreate || undefined}>
        <ClientHubHeader customerId={customerId} customer={customer ?? null} workspace={workspace.data ?? null} canCreate={canCreate} />
        <ClientHubTabs customerId={customerId} section={section} workspace={workspace.data ?? null} />
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
          {workspace.data && section === "prezentare" ? (
            <ClientRelation customerId={customerId} workspace={workspace.data} search={search} />
          ) : null}
          {workspace.data && section === "lucrari" ? (
            <HubCollection
              title="Lucrări"
              emptyTitle="Nu există lucrări"
              emptyBody="Lucrările eliberate pentru acest client apar aici."
              columns={["Lucrare", "Stare", "Acțiune"]}
              rows={workspace.data.jobs.map((job) => jobRow(job))}
            />
          ) : null}
          {workspace.data && section === "cereri" ? (
            <div className="client-hub__collections">
              <HubCollection
                title="Cereri"
                emptyTitle="Nu există cereri"
                emptyBody="Creează cererea lucrării pentru acest client."
                columns={["Cerere", "Stare", "Acțiune"]}
                rows={workspace.data.requests.map((item) => requestRow(item))}
              />
              <HubCollection
                title="Oferte"
                emptyTitle="Nu există oferte"
                emptyBody="Ofertele acestui client vor apărea aici."
                columns={["Ofertă", "Stare", "Acțiune"]}
                rows={workspace.data.quotes.map((item) => quoteRow(item))}
              />
            </div>
          ) : null}
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
    </PageRegion>
  );
}

/** A section of this page replaces the history entry: Back leaves the page instead of replaying tabs. */
function replaceSection(event: MouseEvent<HTMLAnchorElement>, href: string): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(href, "replace");
}

function openRequestsLabel(count: number): string {
  if (count === 0) return "Nicio cerere deschisă";
  return count === 1 ? "1 cerere deschisă" : `${count} cereri deschise`;
}

/**
 * The agenda header: way back to the same row of the registry, the monogram and the name, the
 * contacts that exist (missing ones in one quiet line), the open requests and "Cerere nouă".
 */
function ClientHubHeader({
  customerId,
  customer,
  workspace,
  canCreate,
}: {
  customerId: string;
  customer: CustomerTransport | null;
  workspace: CustomerWorkspaceTransport | null;
  canCreate: boolean;
}) {
  // Opened from the registry, the way back is that history entry (selection, search, filters,
  // scroll and focus as they were); from anywhere else it opens the registry on this client's row.
  const back = originBack({ href: clientsHref(customerId), label: "Clienți" }, (href) => hrefPath(href) === "/clienti");
  const name = customer?.displayName ?? "Client";
  const facts = customer ? contactFacts(customer) : [];
  const present = facts.filter((fact) => fact.value && fact.label !== "CUI");
  const missing = facts.filter((fact) => !fact.value).map((fact) => fact.missingLabel);
  const open = workspace?.summary.openRequestCount ?? null;

  return (
    <header className="chub-head">
      <a className="chub-back" href={back.href} onClick={back.onClick}>
        <span>← Clienți</span>
        {customer ? <>{" "}<span className="chub-back__where">{`· litera ${agendaLetter(customer.displayName)} · rândul ${customer.displayName}`}</span></> : null}
      </a>
      <div className="chub-head__row">
        <div className="chub-id">
          {customer ? <Monogram name={customer.displayName} size="large" /> : null}
          <div className="chub-id__text">
            <p className="chub-id__eyebrow">{customer ? `Client · ${customer.statusLabel}` : "Client"}</p>
            <h1 className="chub-id__name">{name}</h1>
            {customer?.cui ? <p className="chub-id__cui">{`CUI ${customer.cui}`}</p> : null}
            {present.length ? (
              <dl className="chub-contacts">
                {present.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.href ? <a href={fact.href}>{fact.value}</a> : fact.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {customer && missing.length ? (
              <p className="chub-id__missing">
                {present.length ? "Necompletat: " : "Date de contact necompletate: "}
                {missing.join(", ")}.
              </p>
            ) : null}
          </div>
        </div>
        <div className="chub-head__aside">
          {open !== null ? (
            <a className="chub-open" href={clientHref(customerId, "cereri")} data-zero={open === 0 || undefined} onClick={(event) => replaceSection(event, clientHref(customerId, "cereri"))}>
              {openRequestsLabel(open)}
            </a>
          ) : null}
          {canCreate ? (
            <button type="button" className="pilot-create chub-create" onClick={() => navigate(newRequestHref(customerId))}>
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
              Cerere nouă
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/**
 * The tab text. Requests and offers are counted apart ("Cereri 3 · Oferte 3"), each number next to
 * its own noun; the accessible name reads "Cereri 3, Oferte 3". Without data the tab shows no number.
 */
function TabLabel({ section, workspace }: { section: ClientHubSection; workspace: CustomerWorkspaceTransport | null }) {
  const count = (value: number, pause = false) => (
    <span className="chub-tabs__count">{value}{pause ? <span className="u-visually-hidden">,</span> : null}</span>
  );
  if (section === "cereri") {
    if (!workspace) return <>{CLIENT_HUB_SECTION_LABEL.cereri}</>;
    return (
      <>
        <span>Cereri</span>{" "}
        {count(workspace.summary.requestCount, true)}{" "}
        <span className="chub-tabs__sep" aria-hidden="true">·</span>{" "}
        <span>Oferte</span>{" "}
        {count(workspace.summary.quoteCount)}
      </>
    );
  }
  if (section === "lucrari" && workspace) {
    return (
      <>
        <span>{CLIENT_HUB_SECTION_LABEL.lucrari}</span>{" "}
        {count(workspace.summary.jobCount)}
      </>
    );
  }
  return <>{CLIENT_HUB_SECTION_LABEL[section]}</>;
}

/**
 * Relație · Cereri n · Oferte n · Lucrări n · Mai multe. A tab replaces the history entry (the
 * URL keeps the section for links and refresh, Back leaves the page). "Mai multe" only lists what
 * is in preparation; its entries are not links.
 */
function ClientHubTabs({
  customerId,
  section,
  workspace,
}: {
  customerId: string;
  section: ClientHubSection;
  workspace: CustomerWorkspaceTransport | null;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreLeft, setMoreLeft] = useState<number | null>(null);
  const moreId = useId();
  const moreRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const preparing = isPreparingSection(section);

  useEffect(() => {
    if (!moreOpen) return;
    function onPointer(event: PointerEvent) {
      if (event.target instanceof Node && navRef.current?.contains(event.target)) return;
      setMoreOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [moreOpen]);

  function onMoreKey(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || !moreOpen) return;
    event.preventDefault();
    setMoreOpen(false);
    moreRef.current?.focus();
  }

  return (
    <nav className="chub-tabs" aria-label="Secțiuni client" ref={navRef} onKeyDown={onMoreKey} data-section-top>
      <ul className="chub-tabs__list">
        {CLIENT_HUB_PRIMARY_SECTIONS.map((item) => {
          const href = clientHref(customerId, item);
          return (
            <li key={item}>
              <a href={href} aria-current={item === section ? "page" : undefined} onClick={(event) => replaceSection(event, href)}>
                <TabLabel section={item} workspace={workspace} />
              </a>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            ref={moreRef}
            className="chub-tabs__more"
            aria-expanded={moreOpen}
            aria-controls={moreId}
            data-current={preparing || undefined}
            onClick={() => {
              const button = moreRef.current?.getBoundingClientRect();
              const nav = navRef.current?.getBoundingClientRect();
              if (button && nav) setMoreLeft(Math.max(0, button.left - nav.left));
              setMoreOpen((value) => !value);
            }}
          >
            <span>Mai multe</span>
            {" "}<span className="chub-tabs__more-note">{preparing ? `· ${CLIENT_HUB_SECTION_LABEL[section]}` : "· în pregătire"}</span>
            <svg aria-hidden="true" viewBox="0 0 20 20" data-open={moreOpen || undefined}><path d="M5.5 8 10 12.5 14.5 8" /></svg>
          </button>
        </li>
      </ul>
      <div id={moreId} className="chub-more" hidden={!moreOpen} style={moreLeft === null ? undefined : ({ "--chub-more-left": `${moreLeft}px` } as CSSProperties)}>
        <p className="chub-more__head">În pregătire</p>
        <ul>
          {CLIENT_HUB_PREPARING_SECTIONS.map((item) => (
            <li key={item}>
              <span className="chub-more__name">{CLIENT_HUB_SECTION_LABEL[item]}</span>
              <span className="chub-more__state">în pregătire</span>
              <span className="chub-more__body">{CLIENT_HUB_FUTURE_COPY[item].body}</span>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function HubCollection({
  title,
  emptyTitle,
  emptyBody,
  columns,
  rows,
}: {
  title: string;
  emptyTitle: string;
  emptyBody: string;
  columns: readonly string[];
  rows: readonly HubRow[];
}) {
  return (
    <SurfacePanel variant="flush" title={title} label={title} meta={`${rows.length}`}>
      {rows.length === 0 ? (
        <div className="clients-feedback">
          <EmptyState title={emptyTitle} description={emptyBody} />
        </div>
      ) : (
        <table className="clients-table">
          <caption className="u-visually-hidden">{title}</caption>
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={column} scope="col" className={index === 0 ? "clients-table__identity" : index === 1 ? "clients-table__state" : "clients-table__action"}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="clients-table__identity">
                  <a className="clients-object" href={row.href}>
                    <span className="clients-object__title">{row.title}</span>
                    {row.detail ? <span className="clients-object__detail">{row.detail}</span> : null}
                  </a>
                </td>
                <td className="clients-table__state">
                  <StatusBadge label={row.state} tone={statusTone("workflow")} />
                </td>
                <td className="clients-table__action">
                  <a className="clients-next" href={row.actionHref}>
                    <span>{row.actionLabel}</span>
                    <span aria-hidden="true">→</span>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SurfacePanel>
  );
}
