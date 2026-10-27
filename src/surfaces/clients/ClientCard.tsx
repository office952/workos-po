import type { CustomerRegistryItemTransport, CustomerTransport } from "../../api/types";
import { invalidateResources } from "../../data/resourceCache";
import { resourceKeys } from "../../data/resourceKeys";
import { loadCustomerWorkspace } from "../../data/routeLoaders";
import { useResource } from "../../data/useResource";
import { clientHref, newRequestHref } from "../../routing/appRoute";
import { DeskActions, DeskLoading, DeskReadError, DeskSheet, DeskStale } from "../desk/DeskDossier";
import { cardSections, clientDocuments, contactFacts, type ClientDocument } from "./clientsAgendaModel";
import { ClientMark } from "./ClientMark";
import { ClientState } from "./ClientsRegister";

/**
 * N-018 · the contacts that exist stay in front; the empty fields are grouped in one quiet
 * line. The line only reports: editing does not exist on the card.
 */
function ContactBlock({ person }: { person: CustomerTransport }) {
  const facts = contactFacts(person);
  // The CUI, when present, is shown under the name as identity; it is only listed here when missing.
  const present = facts.filter((fact) => fact.value && fact.label !== "CUI");
  const missing = facts.filter((fact) => !fact.value).map((fact) => fact.missingLabel);
  return (
    <>
      {present.length ? (
        <dl className="rdesk-sheet__facts cagenda-card__facts">
          {present.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.href ? <a href={fact.href}>{fact.value}</a> : fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {missing.length ? (
        <p className="cagenda-card__missing">
          {present.length ? "Necompletat: " : "Date de contact necompletate: "}
          {missing.join(", ")}.
        </p>
      ) : null}
    </>
  );
}

function Documents({ title, state, items, empty }: { title: string; state: string; items: readonly ClientDocument[]; empty?: string }) {
  if (items.length === 0 && !empty) return null;
  return (
    <div>
      <p className="rdesk-sheet__list-head">
        <span className="rdesk-sheet__label">{`${title} · ${items.length}`}</span>
        <span className="rdesk-sheet__label">{state}</span>
      </p>
      {items.length === 0 ? (
        <p className="rdesk-sheet__text cagenda-card__none">{empty}</p>
      ) : (
        <ul className="rdesk-sheet__list">
          {items.map((item) => (
            <li key={item.id}>
              <a className="rdesk-sheet__item-title" href={item.href}>{item.title}</a>
              <span className="rdesk-sheet__item-value" data-tone={item.needsAttention ? "attention" : undefined}>
                {item.needsAttention ? item.attentionLabel ?? "Necesită acțiune" : item.state}
              </span>
              <span className="rdesk-sheet__item-detail">{`${item.kind}  ·  ${item.detail}`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The client card: identity and contact, relation counts, then the client's documents. */
export function ClientCard({ customer }: { customer: CustomerRegistryItemTransport }) {
  const key = resourceKeys.customerWorkspace(customer.customerId);
  const workspace = useResource(key, () => loadCustomerWorkspace(customer.customerId));
  const retry = () => invalidateResources(key);
  const data = workspace.data ?? null;
  const person: CustomerTransport = data?.customer ?? customer;
  const sections = data ? cardSections(clientDocuments(data)) : null;
  const canCreateRequest = data?.canCreateRequest ?? false;
  const destinations = [
    ...(canCreateRequest ? [{ action: "Cerere nouă", target: "cerere pentru acest client, în Cereri" }] : []),
    { action: "Fișa clientului", target: "pagina clientului, cu toate documentele" },
  ];

  return (
    <DeskSheet
      label={`Cartela clientului ${person.displayName}`}
      actions={
        <DeskActions destinations={data ? [...destinations, { action: "Rândurile cartelei", target: "cererea, oferta sau lucrarea" }] : destinations}>
          {canCreateRequest ? (
            <a className="rdesk-dossier__primary" href={newRequestHref(customer.customerId)}>
              <span>Cerere nouă</span>
              <span aria-hidden="true">→</span>
            </a>
          ) : null}
          <a className={canCreateRequest ? "rdesk-dossier__secondary" : "rdesk-dossier__primary"} href={clientHref(customer.customerId)}>
            Fișa clientului
          </a>
        </DeskActions>
      }
    >
      <p className="rdesk-sheet__head">
        <span>Client</span>
        <ClientState customer={person} />
      </p>
      <div className="rdesk-sheet__identity">
        <div>
          <p className="rdesk-sheet__name">{person.displayName}</p>
          {person.cui ? <p className="rdesk-sheet__lead">{`CUI ${person.cui}`}</p> : null}
        </div>
        <ClientMark name={person.displayName} logo={data ? data.logo : customer.logo} size="large" />
      </div>
      <ContactBlock person={person} />
      <hr className="rdesk-sheet__perforation" />
      <div className="cagenda-card__relation">
        <p className="rdesk-sheet__label">Relație</p>
        <div className="cagenda-card__counts">
          <span data-tone="open"><strong>{customer.openRequestCount}</strong><small>Cereri deschise</small></span>
          <span><strong>{customer.quoteCount}</strong><small>Oferte · total</small></span>
          <span title={`În WorkOS: ${customer.jobCount} · istorice: ${customer.historicalWorkCount}`}><strong>{customer.workCount}</strong><small>Lucrări · total</small></span>
        </div>
      </div>
      {customer.attentionLabel ? <p className="rdesk-sheet__note" data-tone="attention">{customer.attentionLabel}</p> : null}
      {!data ? (
        workspace.status === "error" ? (
          <DeskReadError title="Documentele clientului nu au putut fi citite" onRetry={retry}>
            Cartela păstrează datele din registru. Reîncearcă citirea clientului.
          </DeskReadError>
        ) : (
          <DeskLoading>Se citesc documentele clientului…</DeskLoading>
        )
      ) : (
        <>
          {workspace.status === "error" ? (
            <DeskStale onRetry={retry}>Actualizarea clientului a eșuat. Se afișează ultima citire reușită.</DeskStale>
          ) : null}
          {sections && sections.attention.length + sections.recent.length === 0 ? (
            <p className="rdesk-sheet__text cagenda-card__none">Clientul nu are încă cereri, oferte sau lucrări în WorkOS.</p>
          ) : sections ? (
            <>
              <Documents title="Necesită acțiune" state="Semnal" items={sections.attention} />
              <Documents title="Ultimele documente" state="Stare" items={sections.recent} />
            </>
          ) : null}
        </>
      )}
    </DeskSheet>
  );
}
