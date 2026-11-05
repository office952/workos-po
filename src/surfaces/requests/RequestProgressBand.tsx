import type { CommercialBranch } from "../../presentation/requestCommercialBranches";
import type { RequestCommercialProgressView } from "../../presentation/requestCommercialProgress";
import type { RequestNextStep } from "../../presentation/worklistAction";

/**
 * W2 · progress band (WorkOS-N 1162:16456 · 1164:185 · 1166:185): the whole request's commercial
 * state, the most advanced step the server reports, and the one request-level next step, the same
 * text and target as in the Cereri register. The selected branch never changes this band.
 */
export function RequestProgressBand({
  progress,
  nextStep,
  target,
}: {
  progress: RequestCommercialProgressView;
  nextStep: RequestNextStep;
  /** The branch holding the server's target, when the target is a quote of this request. */
  target: CommercialBranch | null;
}) {
  return (
    <section className="request-band" aria-label="Progresul cererii" data-testid="request-progress-band">
      <div className="request-band__progress" data-testid="request-commercial-progress">
        <p className="request-band__kicker">Progres comercial</p>
        <p className="request-band__headline">{progress.headline}</p>
        {progress.segments.length > 0 ? (
          <ol className="request-band__bar" aria-label="Starea fiecărei ramuri, în ordinea înregistrării">
            {progress.segments.map((segment) => (
              <li key={segment.key} data-state={segment.state}>
                <span className="u-visually-hidden">{segment.label}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      {progress.furthest ? (
        <div className="request-band__furthest" data-testid="request-furthest-step">
          <p className="request-band__kicker">Cel mai avansat pas</p>
          <p>{[progress.furthest.label, progress.furthest.detail].filter(Boolean).join(" · ")}</p>
        </div>
      ) : null}
      <div className="request-band__next" data-testid="request-next-step">
        <p className="request-band__kicker">
          Pasul următor al cererii<span className="request-band__same"> · la fel în registrul Cereri</span>
        </p>
        <NextStep nextStep={nextStep} target={target} />
      </div>
    </section>
  );
}

function NextStep({ nextStep, target }: { nextStep: RequestNextStep; target: CommercialBranch | null }) {
  switch (nextStep.status) {
    case "none":
      return <p className="request-band__none">Nicio acțiune disponibilă</p>;
    case "target-missing":
      return (
        <p className="request-band__none">
          {nextStep.label} · ținta indicată de server nu este în această cerere
        </p>
      );
    case "ready": {
      const identity = target
        ? [`${target.indexLabel} ${target.title}`, target.kind === "assembly" ? null : target.offerReference].filter(Boolean).join(" · ")
        : null;
      return (
        <a className="request-band__action" href={nextStep.href}>
          <strong>{nextStep.label}</strong>
          {identity ? ` · ${identity}` : null}
          <span aria-hidden="true"> →</span>
        </a>
      );
    }
    default: {
      const exhaustive: never = nextStep;
      return exhaustive;
    }
  }
}
