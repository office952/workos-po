import { membershipRoleLabel } from "../adapters/cloudSessionAdapter";
import { StatusBadge } from "../components/StatusBadge";
import { SlicePage } from "../layout/SlicePage";
import { visibleNavGroups } from "../layout/globalNav";
import { presentRouteChrome } from "../layout/routeChrome";
import { capabilityAllows, sessionCapabilities } from "../presentation/capabilityAccess";
import { useCloudSession } from "../session/CloudSessionContext";
import { OrganizationOperatingPanel } from "./OrganizationOperatingPanel";
import { useOrganizationOperatingPicture } from "./useOrganizationOperatingPicture";

export function LaunchpadPage() {
  const chrome = presentRouteChrome({ name: "home" });
  const cloud = useCloudSession();
  const organizationName = cloud.organization?.displayName ?? null;
  const roleLabel = membershipRoleLabel(cloud.organization?.membershipRole);
  const membershipRole = cloud.organization?.membershipRole;
  const role = membershipRole === "owner" ? "owner" : membershipRole === "member" ? "member" : membershipRole === "production" ? "production" : "unknown";
  const { picture, retry } = useOrganizationOperatingPicture({ role });
  const identity = [organizationName, roleLabel].filter((part): part is string => Boolean(part)).join(" · ");
  // V1: the start page lists only what the signed-in role can open (same capabilities as the navigation).
  const capabilities = sessionCapabilities(cloud);
  const groups = visibleNavGroups(capabilities);
  const continueLinks = [
    { href: "/cereri", label: "Cereri", purpose: "Deschide o cerere de ofertă în curs.", capability: "requests.read" },
    { href: "/lucrari", label: "Lucrări", purpose: "Continuă lucrările eliberate.", capability: "jobs.read" },
  ].filter((link) => capabilityAllows(capabilities, link.capability));

  return (
    <SlicePage
      contextLabel={chrome.contextLabel}
      currentHref={chrome.currentHref}
      workspace="launchpad"
      title={chrome.title}
      lead={chrome.lead}
      meta={identity || undefined}
      status={
        picture.statusLabel ? <StatusBadge label={picture.statusLabel} tone={picture.statusTone} /> : undefined
      }
    >
      <div className="launchpad">
        <OrganizationOperatingPanel picture={picture} variant="home" onRetry={retry} />
        {continueLinks.length > 0 ? (
          <section className="launchpad__attention" aria-label="Continuă munca">
            <h2 className="launchpad__heading">Continuă</h2>
            <ul className="launchpad__list launchpad__list--attention">
              {continueLinks.map((link) => (
                <li key={link.href}>
                  <a className="launchpad__link" href={link.href}>
                    <span className="launchpad__link-label">{link.label}</span>
                    <span className="launchpad__link-purpose">{link.purpose}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {groups.map((group) => (
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
