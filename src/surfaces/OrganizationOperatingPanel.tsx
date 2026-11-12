import "../styles/surfaces/organization-operating-picture.css";
import type { OrganizationOperatingPicture } from "../presentation/organizationOperatingPicture";

export function OrganizationOperatingPanel({
  picture,
  pending,
}: {
  picture: OrganizationOperatingPicture;
  pending: boolean;
}) {
  return (
    <section className="org-picture" aria-labelledby="org-picture-heading" aria-busy={pending || undefined}>
      <h2 id="org-picture-heading" className="org-picture__heading">
        Ce poți folosi acum
      </h2>
      <p className="org-picture__lead">{picture.lead}</p>
      <p className="org-picture__note">{picture.roleNote}</p>
      <a className="org-picture__next" href={picture.nextAction.href}>
        <span className="org-picture__next-label">{picture.nextAction.label}</span>
        <span className="org-picture__meta">{picture.nextAction.description}</span>
      </a>
      <ul className="org-picture__list">
        {picture.capabilities.map((item) => (
          <li key={item.id}>
            <a className="org-picture__link" href={item.href}>
              <span className="org-picture__name">{item.name}</span>
              <span className="org-picture__current">{item.current}</span>
              <span className="org-picture__meta">{item.adoptionLabel}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="org-picture__note">{picture.historyNote}</p>
    </section>
  );
}
