import type { CustomerRegistryItemTransport, CustomerTransport } from "../../api/types";
import { invalidateResources } from "../../data/resourceCache";
import { resourceKeys } from "../../data/resourceKeys";
import { loadCustomerWorkspace } from "../../data/routeLoaders";
import { useResource } from "../../data/useResource";
import { clientHref, newRequestHref } from "../../routing/appRoute";
import { DeskActions, DeskLoading, DeskReadError, DeskSheet, DeskStale } from "../desk/DeskDossier";
import { cardSections, clientDocuments, type ClientDocument } from "./clientsAgendaModel";
import { ClientState, Monogram } from "./ClientsRegister";

function Fact({ label, value, href }: { label: string; value: string | null; href?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-missing={!value || undefined}>{value ? href ? <a href={href}>{value}</a> : value : "necompletat"}</dd>
    </div>
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
          <p className="rdesk-sheet__lead">{person.cui ? `CUI ${person.cui}` : "CUI necompletat"}</p>
        </div>
        <Monogram name={person.displayName} size="large" />
      </div>
      <dl className="rdesk-sheet__facts cagenda-card__facts">
        <Fact label="Persoană de contact" value={person.contactName} />
        <Fact label="Telefon" value={person.phone} href={person.phone ? `tel:${person.phone.replace(/\s+/g, "")}` : undefined} />
        <Fact label="E-mail" value={person.email} href={person.email ? `mailto:${person.email}` : undefined} />
        <Fact label="Localitate" value={person.city} />
        <Fact label="Adresă" value={person.address} />
      </dl>
      <hr className="rdesk-sheet__perforation" />
      <div className="cagenda-card__relation">
        <p className="rdesk-sheet__label">Relație</p>
        <div className="cagenda-card__counts">
          <span data-tone="open"><strong>{customer.openRequestCount}</strong><small>Cereri deschise</small></span>
          <span><strong>{customer.quoteCount}</strong><small>Oferte · total</small></span>
          <span><strong>{customer.jobCount}</strong><small>Lucrări · total</small></span>
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
            <p className="rdesk-sheet__text cagenda-card__none">Clientul nu are încă cereri, oferte sau lucrări.</p>
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
