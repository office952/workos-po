import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import type { OrganizationOperatingPicture } from "../presentation/organizationOperatingPicture";
import "../styles/surfaces/organization-operating-picture.css";

export function OrganizationOperatingPanel({
  picture,
  variant,
  onRetry,
}: {
  picture: OrganizationOperatingPicture;
  variant: "home" | "admin";
  onRetry: () => void;
}) {
  const compact = variant === "home";
  return (
    <section
      className={compact ? "org-picture org-picture--home" : "org-picture org-picture--admin"}
      aria-labelledby="org-picture-heading"
      aria-busy={picture.loading || undefined}
    >
      <h2 id="org-picture-heading" className="org-picture__heading">
        {picture.heading}
      </h2>
      <p className="org-picture__lead">{picture.lead}</p>
      <p className="org-picture__note">{picture.roleNote}</p>
      {picture.loading ? (
        <p className="org-picture__note" role="status">
          Se citesc setările organizației.
        </p>
      ) : null}
      {picture.loadFailed ? (
        <InlineAlert tone="error" title="Unele setări nu s-au putut citi">
          <p>Nu trata lipsa datelor ca dezactivare sau ca organizație nepregătită.</p>
          <Button variant="secondary" onClick={onRetry}>
            {picture.retryLabel}
          </Button>
        </InlineAlert>
      ) : null}
      <a className="org-picture__next" href={picture.nextAction.href}>
        <span className="org-picture__next-label">{picture.nextAction.label}</span>
        <span className="org-picture__meta">{picture.nextAction.description}</span>
      </a>
      {compact ? (
        <a className="org-picture__settings" href="/admin">
          Setările organizației
        </a>
      ) : (
        <ul className="org-picture__list">
          {picture.capabilities.map((item) => (
            <li key={item.id}>
              <a className="org-picture__link" href={item.href}>
                <span className="org-picture__name">{item.name}</span>
                <span className="org-picture__current">{item.current}</span>
                <span className="org-picture__meta">{item.adoptionLabel}</span>
                {picture.whoCanConfigure && item.next ? (
                  <span className="org-picture__meta">{item.next}</span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="org-picture__note">{picture.historyNote}</p>
    </section>
  );
}
