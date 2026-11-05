import type { ConfiguratorReadiness } from "../configuration/configuratorWorkState";

export function ConfiguratorReadinessIndicator({ readiness, onGoToFirst }: {
  readiness: ConfiguratorReadiness;
  onGoToFirst?: () => void;
}) {
  return (
    <div className="configuration-readiness" data-tone={readiness.tone} data-testid="configuration-readiness">
      <div className="configuration-readiness__copy">
        <strong>{readiness.title}</strong>
        <span>{readiness.detail}</span>
      </div>
      {onGoToFirst ? (
        <button type="button" className="configuration-readiness__action" onClick={onGoToFirst}>
          Mergi la prima →
        </button>
      ) : null}
    </div>
  );
}
