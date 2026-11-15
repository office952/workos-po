import { membershipRoleLabel } from "../adapters/cloudSessionAdapter";
import { AdminLayout, ExternalMark } from "../admin/AdminLayout";
import { Button } from "../components/Button";
import { administrationDomains, type AdministrationRailId } from "../layout/administrationNav";
import type { OrganizationCapabilityKind } from "../presentation/organizationOperatingPicture";
import { useCloudSession } from "../session/CloudSessionContext";
import { useOrganizationOperatingPicture } from "./useOrganizationOperatingPicture";

/** Which operating-picture fact describes which destination (presentation of existing reads only). */
const CAPABILITY_FOR: Partial<Record<AdministrationRailId, OrganizationCapabilityKind>> = {
  products: "products",
  services: "installation",
  people: "people",
  workcenters: "workcenters",
  materials: "materials",
  "external-production": "external",
};

/**
 * R3 · the hub is the map: five domains on rows. „Necesită atenție” appears only for a fact the
 * server reported (a read that failed, no product offered for new work); nothing is inferred here.
 */
export function AdminHomePage() {
  const cloud = useCloudSession();
  const organizationName = cloud.organization?.displayName ?? null;
  const roleLabel = membershipRoleLabel(cloud.organization?.membershipRole);
  const owner = cloud.organization?.membershipRole === "owner";
  const role = owner ? "owner" : cloud.organization?.membershipRole === "member" ? "member" : "unknown";
  const { picture, retry } = useOrganizationOperatingPicture({ role });
  const cards = new Map(picture.capabilities.map((card) => [card.id, card]));
  const noProducts = picture.statusTone === "blocked";
  const meta = [organizationName, roleLabel].filter((part): part is string => Boolean(part)).join(" · ");

  return (
    <AdminLayout
      current={null}
      title="Administrare"
      lead="Configurația organizației pentru lucrările noi. Ofertele și lucrările deja confirmate nu se schimbă."
      meta={
        <>
          {meta ? <span>{meta}</span> : null}
          <span>{picture.roleNote}</span>
        </>
      }
    >
      {picture.loadFailed ? (
        <div className="adm-attention" role="status">
          <AttentionIcon />
          <p className="adm-attention__text">
            <strong>Unele setări nu s-au putut citi.</strong> Ce nu s-a citit nu este afișat ca lipsă.
          </p>
          <Button variant="secondary" onClick={retry}>
            {picture.retryLabel}
          </Button>
        </div>
      ) : noProducts ? (
        <div className="adm-attention" role="status">
          <AttentionIcon />
          <p className="adm-attention__text">
            <strong>Niciun produs nu este oferit pentru lucrări noi.</strong> {picture.lead}
          </p>
          <a className="adm-link-strong" href={picture.nextAction.href}>
            {picture.nextAction.label}
            <ArrowIcon />
          </a>
        </div>
      ) : null}

      <nav className="adm-map" aria-label="Domeniile administrării">
        {administrationDomains().map((domain) => (
          <section key={domain.id} className="adm-domain" data-domain={domain.id} aria-labelledby={`adm-domain-${domain.id}`}>
            <span className="adm-domain__index" aria-hidden="true">
              {domain.index}
            </span>
            <div>
              <h2 id={`adm-domain-${domain.id}`} className="adm-domain__title">
                {domain.label}
              </h2>
              <p className="adm-domain__description">{domain.description}</p>
            </div>
            <ul className="adm-domain__pages">
              {domain.items.map((item) => {
                const capability = CAPABILITY_FOR[item.id];
                const card = capability && !picture.loading ? cards.get(capability) : undefined;
                // The adoption label is the short state; the read fact follows when it adds something.
                const detail =
                  card && card.current !== card.name && !/^Oprit explicit/.test(card.current) ? card.current : null;
                return (
                  <li key={item.id}>
                    <a className="adm-domain__page" href={item.href}>
                      <span className="adm-domain__page-label">
                        {item.label}
                        {item.external ? <ExternalMark /> : null}
                      </span>
                      {card ? (
                        <span className="adm-domain__page-state">
                          {card.adoptionLabel}
                          {detail ? <span className="adm-domain__page-detail"> · {detail}</span> : null}
                        </span>
                      ) : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>
      <p className="adm-note">{picture.historyNote}</p>
    </AdminLayout>
  );
}

function AttentionIcon() {
  return (
    <svg className="adm-icon" width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.5l6 10.5H2z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7v3M8 11.6v.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="adm-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
