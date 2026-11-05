import type { QuoteListItemTransport } from "../../../../api/types";
import { presentQuoteRequestBranches } from "../../../../presentation/quoteBranchPositions";
import { presentRequestCommercialProgress } from "../../../../presentation/requestCommercialProgress";
import { requestHref } from "../../../../routing/appRoute";
import { follow } from "./follow";
import "../../../../styles/surfaces/commercial-state.css";

/**
 * W2 · a request on the client page (WorkOS-N 1169:700 · 1169:895): one chip per branch, named by
 * inscription, under the card's offer line. A chip opens the request with that branch selected.
 */
export function ProjectBranches({ requestId, quotes }: { requestId: string; quotes: readonly QuoteListItemTransport[] }) {
  const branches = presentQuoteRequestBranches(quotes, requestId);
  if (branches.length === 0) return null;
  const progress = presentRequestCommercialProgress({ branches, commercialProgress: null, commercialProgressLabel: null });
  const requestLink = requestHref(requestId);
  return (
    <div className="hbranches" data-testid="project-branches">
      <ol className="hbranches__bar" aria-hidden="true" title={progress.headline}>
        {progress.segments.map((segment) => (
          <li key={segment.key} data-state={segment.state} />
        ))}
      </ol>
      <ul className="hbranches__chips" aria-label="Ramurile cererii">
        {branches.map((branch) => {
          const href = `${requestLink}?ramura=${encodeURIComponent(branch.key)}`;
          return (
            <li key={branch.key}>
              <a
                className="hbranches__chip"
                href={href}
                aria-label={`Ramura ${branch.indexLabel} ${branch.title}, ${branch.stateLabel}`}
                onClick={(event) => follow(event, href)}
              >
                <span className="commercial-dot" data-state={branch.state} aria-hidden="true" />
                <span className="hbranches__index">{branch.indexLabel}</span>
                <span className="hbranches__name">{branch.title}</span>
              </a>
            </li>
          );
        })}
      </ul>
      <p className="hbranches__foot">
        <a className="text-link" href={requestLink} onClick={(event) => follow(event, requestLink)}>
          Deschide cererea <span aria-hidden="true">→</span>
        </a>
        <span>O ramură deschide cererea cu acea ramură selectată; „← Fișa clientului” revine aici.</span>
      </p>
    </div>
  );
}
