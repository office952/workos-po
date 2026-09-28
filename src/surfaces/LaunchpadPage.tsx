import { membershipRoleLabel } from "../adapters/cloudSessionAdapter";
import { StatusBadge } from "../components/StatusBadge";
import { SlicePage } from "../layout/SlicePage";
import { GLOBAL_NAV } from "../layout/globalNav";
import { presentRouteChrome } from "../layout/routeChrome";
import { useCloudSession } from "../session/CloudSessionContext";

export function LaunchpadPage() {
  const chrome = presentRouteChrome({ name: "home" });
  const cloud = useCloudSession();
  const organizationName = cloud.organization?.displayName ?? null;
  const roleLabel = membershipRoleLabel(cloud.organization?.membershipRole);
  const owner = cloud.organization?.membershipRole === "owner";
  const identity = [organizationName, roleLabel].filter((part): part is string => Boolean(part)).join(" · ");

  return (
    <SlicePage
      contextLabel={chrome.contextLabel}
      currentHref={chrome.currentHref}
      workspace="launchpad"
      title={chrome.title}
      lead={chrome.lead}
      meta={identity || undefined}
      status={<StatusBadge label="Pregătit" tone="ready" />}
    >
      <div className="launchpad">
        <section className="launchpad__attention" aria-label="Continuă munca">
          <h2 className="launchpad__heading">Continuă</h2>
          <ul className="launchpad__list launchpad__list--attention">
            <li>
              <a className="launchpad__link" href="/cereri">
                <span className="launchpad__link-label">Cereri</span>
                <span className="launchpad__link-purpose">Deschide o cerere de ofertă în curs.</span>
              </a>
            </li>
            <li>
              <a className="launchpad__link" href="/lucrari">
                <span className="launchpad__link-label">Lucrări</span>
                <span className="launchpad__link-purpose">Continuă lucrările eliberate.</span>
              </a>
            </li>
            <li>
              <a className="launchpad__link" href="/planificare">
                <span className="launchpad__link-label">Planificare</span>
                <span className="launchpad__link-purpose">Vezi efortul pe zone și utilaje.</span>
              </a>
            </li>
          </ul>
        </section>
        {GLOBAL_NAV.map((group) => (
          <section key={group.id} className="launchpad__section" aria-labelledby={`launch-${group.id}`}>
            <h2 id={`launch-${group.id}`} className="launchpad__heading">
              {group.label}
            </h2>
            <p className="launchpad__summary">{group.summary}</p>
            {group.id === "administration" ? (
              <p className="launchpad__summary">
                {owner
                  ? "Poți modifica setările pentru lucrările noi."
                  : "Modificările sunt rezervate proprietarului organizației."}
              </p>
            ) : null}
            <ul className="launchpad__list">
              {group.items.map((item) => (
                <li key={item.id}>
                  <a className="launchpad__link" href={item.href}>
                    <span className="launchpad__link-label">{item.label}</span>
                    <span className="launchpad__link-purpose">{item.purpose}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </SlicePage>
  );
}
