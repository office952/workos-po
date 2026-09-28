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
  const userLabel = cloud.user?.email ?? null;
  const meta = [organizationName, roleLabel, userLabel ? `Cont ${userLabel}` : null]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  const owner = cloud.organization?.membershipRole === "owner";

  return (
    <SlicePage
      contextLabel={chrome.contextLabel}
      currentHref={chrome.currentHref}
      workspace="launchpad"
      title={chrome.title}
      lead={chrome.lead}
      meta={meta || undefined}
      status={<StatusBadge label="Pregătit pentru lucru" tone="ready" />}
    >
      <div className="launchpad">
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
