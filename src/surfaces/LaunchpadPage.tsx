import { membershipRoleLabel } from "../adapters/cloudSessionAdapter";
import { StatusBadge } from "../components/StatusBadge";
import { SlicePage } from "../layout/SlicePage";
import { GLOBAL_NAV } from "../layout/globalNav";
import { presentRouteChrome } from "../layout/routeChrome";
import { useCloudSession } from "../session/CloudSessionContext";
import { OrganizationOperatingPanel } from "./OrganizationOperatingPanel";
import { useOrganizationOperatingPicture } from "./useOrganizationOperatingPicture";

export function LaunchpadPage() {
  const chrome = presentRouteChrome({ name: "home" });
  const cloud = useCloudSession();
  const organizationName = cloud.organization?.displayName ?? null;
  const roleLabel = membershipRoleLabel(cloud.organization?.membershipRole);
  const owner = cloud.organization?.membershipRole === "owner";
  const role = owner ? "owner" : cloud.organization?.membershipRole === "member" ? "member" : "unknown";
  const { picture, pending } = useOrganizationOperatingPicture({
    role,
    organizationName,
  });
  const identity = [organizationName, roleLabel].filter((part): part is string => Boolean(part)).join(" · ");
  const showStatus = !pending || picture.statusLabel !== "Cont conectat";

  return (
    <SlicePage
      contextLabel={chrome.contextLabel}
      currentHref={chrome.currentHref}
      workspace="launchpad"
      title={chrome.title}
      lead={chrome.lead}
      meta={identity || undefined}
      status={showStatus ? <StatusBadge label={picture.statusLabel} tone={picture.statusTone} /> : undefined}
    >
      <div className="launchpad">
        <OrganizationOperatingPanel picture={picture} pending={pending} />
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
          </ul>
        </section>
        {GLOBAL_NAV.map((group) => (
          <section key={group.id} className="launchpad__section" aria-labelledby={`launch-${group.id}`}>
            <h2 id={`launch-${group.id}`} className="launchpad__heading">
              {group.label}
            </h2>
            <p className="launchpad__summary">{group.summary}</p>
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
