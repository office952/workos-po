type CatalogStatesProps = {
  capabilitiesFailed: boolean;
  definitionsFailed: boolean;
  hasManifest: boolean;
  hasDefinitions: boolean;
  onRetryCapabilities: () => void;
  onRetryDefinitions: () => void;
};

/** Loading and read errors of the catalog. The error takes the place of the content, not a layer over it. */
export function CatalogStates({
  capabilitiesFailed,
  definitionsFailed,
  hasManifest,
  hasDefinitions,
  onRetryCapabilities,
  onRetryDefinitions,
}: CatalogStatesProps) {
  return (
    <>
      {capabilitiesFailed ? (
        <div className="catv2-failure catv2-failure--page" role="alert">
          <p>
            <strong>Biblioteca de produse nu a putut fi citită.</strong>{" "}
            {hasManifest ? "Se afișează ultima versiune citită." : "Verifică legătura și încearcă din nou."}
          </p>
          <button type="button" className="catv2-button catv2-button--secondary" onClick={onRetryCapabilities}>Reîncearcă</button>
        </div>
      ) : null}
      {definitionsFailed ? (
        <div className="catv2-failure catv2-failure--page" role="alert">
          <p>
            <strong>Definițiile produselor nu au putut fi citite.</strong>{" "}
            {hasDefinitions ? "Se afișează ultima versiune citită." : "Descrierile, resursele și operațiile lipsesc până la reîncercare."}
          </p>
          <button type="button" className="catv2-button catv2-button--secondary" onClick={onRetryDefinitions}>Reîncearcă definițiile</button>
        </div>
      ) : null}
      {!hasManifest && !capabilitiesFailed ? (
        <div className="catv2-skeleton" role="status" aria-label="Se citește biblioteca de produse">
          <span className="catv2-skeleton__line catv2-skeleton__line--title" />
          <span className="catv2-skeleton__line catv2-skeleton__line--lead" />
          {[0, 1, 2, 3].map((index) => (
            <span key={index} className="catv2-skeleton__row">
              <span /><span /><span /><span />
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}
