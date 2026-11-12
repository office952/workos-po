import { membershipRoleLabel } from "../adapters/cloudSessionAdapter";
import { StatusBadge } from "../components/StatusBadge";
import { administrationGroups } from "../layout/administrationNav";
import { SlicePage } from "../layout/SlicePage";
import { presentRouteChrome } from "../layout/routeChrome";
import { useCloudSession } from "../session/CloudSessionContext";
import { OrganizationOperatingPanel } from "./OrganizationOperatingPanel";
import { useOrganizationOperatingPicture } from "./useOrganizationOperatingPicture";

export function AdminHomePage() {
  const chrome = presentRouteChrome({ name: "admin" });
  const cloud = useCloudSession();
  const organizationName = cloud.organization?.displayName ?? null;
  const roleLabel = membershipRoleLabel(cloud.organization?.membershipRole);
  const owner = cloud.organization?.membershipRole === "owner";
  const role = owner ? "owner" : cloud.organization?.membershipRole === "member" ? "member" : "unknown";
  const { picture, pending } = useOrganizationOperatingPicture({
    role,
    organizationName,
  });
  const meta = [organizationName, roleLabel].filter((part): part is string => Boolean(part)).join(" · ");
  const showStatus = !pending || picture.statusLabel !== "Cont conectat";

  return (
    <SlicePage
      contextLabel={chrome.contextLabel}
      currentHref={chrome.currentHref}
      workspace="admin"
      title={chrome.title}
      lead={chrome.lead}
      meta={meta || undefined}
      status={showStatus ? <StatusBadge label={picture.statusLabel} tone={picture.statusTone} /> : undefined}
    >
      <div className="admin-home">
        <OrganizationOperatingPanel picture={picture} pending={pending} />
        {administrationGroups().map((group) => (
          <section key={group.id} className="admin-home__group" aria-labelledby={`admin-${group.id}`}>
            <h2 id={`admin-${group.id}`} className="admin-home__heading">
              {group.label}
            </h2>
            <ul className="admin-home__list">
              {group.items.map((item) => (
                <li key={item.id}>
                  <a className="admin-home__link" href={item.href}>
                    <span className="admin-home__link-label">{item.label}</span>
                    <span className="admin-home__link-purpose">{item.purpose}</span>
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
