import type { CommercialBranch } from "../../presentation/requestCommercialBranches";
import type { RequestCommercialProgressView } from "../../presentation/requestCommercialProgress";

/**
 * W2 · panel of the selected branch (WorkOS-N 1162:16456 · 1164:648 · 1166:506 · 1165:720):
 * offer → order → job sheet, the branch's own action and a plain reminder that the other
 * offers keep their state. The branch action is not the request's next step.
 */
export function BranchDetail({
  branch,
  total,
  previous,
  next,
  onSelect,
  onClose,
  onPreview,
  onRetryJobs,
  onResume,
}: {
  branch: CommercialBranch;
  total: number;
  previous: CommercialBranch | null;
  next: CommercialBranch | null;
  onSelect: (key: string) => void;
  onClose: () => void;
  onPreview: (quoteSnapshotId: string) => void;
  onRetryJobs: (() => void) | null;
  onResume?: (quoteSnapshotId: string, label: string) => void;
}) {
  const others = total - 1;
  const current = branch.quotes.find((quote) => !quote.superseded) ?? branch.quotes[0] ?? null;
  const primaryHref = branch.primaryAction?.href ?? null;
  const offerLink = current && current.href !== primaryHref ? current : null;
  return (
    <div className="branch-detail" data-testid="branch-detail" data-state={branch.state}>
      <div className="branch-detail__top">
        <button type="button" className="text-link branch-detail__back" onClick={onClose}>
          <span aria-hidden="true">← </span>Ramurile cererii
        </button>
        <button type="button" className="text-link branch-detail__close" onClick={onClose}>
          Închide<span aria-hidden="true"> ×</span>
        </button>
      </div>
      <p className="branch-detail__kicker">
        Ramura {branch.indexLabel} · din {total}
      </p>
      <h2 className="branch-detail__title" id="branch-detail-title">{branch.title}</h2>
      {branch.subtitle ? <p className="branch-detail__subtitle">{branch.subtitle}</p> : null}
      <ol className="branch-chain" aria-label="Oferta, comanda și fișa lucrării acestei ramuri">
        {branch.chain.map((step) => (
          <li key={step.key} data-tone={step.tone}>
            <span className="branch-chain__name">{step.name}</span>
            <span className="branch-chain__value">{step.value}</span>
            {step.detail ? <span className="branch-chain__detail">{step.detail}</span> : null}
          </li>
        ))}
      </ol>
      {branch.note ? <p className="branch-detail__note">{branch.note}</p> : null}
      {branch.revisionPending ? <p className="branch-detail__note">Revizie: ansamblul a fost modificat după ofertă</p> : null}
      {branch.consultOnly ? <p className="branch-detail__note">Configurații: doar consultare (comandă acceptată)</p> : null}
      <div className="branch-detail__actions">
        {branch.primaryAction ? (
          <a className="hit branch-detail__primary" href={branch.primaryAction.href}>
            <span className="button button--primary">
              {branch.primaryAction.label} <span aria-hidden="true">→</span>
            </span>
          </a>
        ) : null}
        {onRetryJobs && branch.jobCell.tone === "attention" && branch.jobCell.label === "Necitită" ? (
          <button type="button" className="button button--secondary" onClick={onRetryJobs}>
            Reîncearcă citirea
          </button>
        ) : null}
        {onResume && current?.resumable ? (
          <button
            type="button"
            className="button button--secondary"
            onClick={() => onResume(current.quoteSnapshotId, current.reference ?? branch.title)}
          >
            Reia oferta
          </button>
        ) : null}
        <p className="branch-detail__links">
          {offerLink ? (
            <a className="text-link" href={offerLink.href}>
              {offerLink.reference ? `Deschide oferta ${offerLink.reference}` : "Deschide oferta"}
            </a>
          ) : null}
          {current ? (
            <button
              type="button"
              className="text-link"
              data-preview-opener={current.quoteSnapshotId}
              aria-haspopup="dialog"
              onClick={() => onPreview(current.quoteSnapshotId)}
            >
              {current.reference ? `Previzualizează oferta ${current.reference}` : "Previzualizează oferta"}
            </button>
          ) : null}
          {branch.assemblyHref && primaryHref !== branch.assemblyHref ? (
            <a className="text-link" href={branch.assemblyHref}>
              {branch.consultOnly || branch.quotes.length > 0 ? "Deschide ansamblul" : "Continuă ansamblul"}
            </a>
          ) : null}
          {branch.orderHref && primaryHref !== branch.orderHref ? (
            <a className="text-link" href={branch.orderHref}>Fișa lucrării</a>
          ) : null}
          {branch.executionHref ? <a className="text-link" href={branch.executionHref}>Deschide în Atelier</a> : null}
        </p>
      </div>
      {branch.primaryAction?.label.startsWith("Deschide oferta") ? (
        <p className="branch-detail__permission">Acceptarea se face în ofertă, de proprietar.</p>
      ) : null}
      {branch.quotes.length > 1 ? (
        <ul className="branch-detail__versions" aria-label="Versiunile ofertei acestei ramuri">
          {branch.quotes.map((quote) => (
            <li key={quote.quoteSnapshotId}>
              {[quote.superseded ? "Ofertă anterioară" : "Ofertă curentă", quote.reference, quote.stageLabel, quote.holdsJob ? "lucrarea rămâne pe această ofertă" : null]
                .filter(Boolean)
                .join(" · ")}
            </li>
          ))}
        </ul>
      ) : null}
      {others > 0 ? (
        <p className="branch-detail__others">
          {branch.state === "ordered"
            ? `Comanda acestei ramuri nu schimbă celelalte ${others === 1 ? "oferte" : `${others} oferte`}: fiecare rămâne în starea ei.`
            : `Celelalte ${others === 1 ? "1 ofertă rămâne" : `${others} oferte rămân`} în starea lor. Acceptarea uneia nu le acceptă și nu le închide pe celelalte.`}
        </p>
      ) : null}
      <nav className="branch-detail__pager" aria-label="Ramura anterioară sau următoare">
        {previous ? (
          <button type="button" className="text-link" onClick={() => onSelect(previous.key)}>
            ‹ {previous.indexLabel} {previous.title}
          </button>
        ) : <span />}
        {next ? (
          <button type="button" className="text-link" onClick={() => onSelect(next.key)}>
            {next.indexLabel} {next.title} ›
          </button>
        ) : null}
      </nav>
      <p className="branch-detail__keys" aria-hidden="true">↑ ↓ schimbă ramura · Enter deschide acțiunea ramurii · Esc revine la registru</p>
    </div>
  );
}

/** Without an explicit selection the panel summarizes the request; no branch is chosen for the reader. */
export function RequestSummary({ progress }: { progress: RequestCommercialProgressView }) {
  return (
    <div className="request-summary" data-testid="request-summary">
      <p className="branch-detail__kicker">Rezumatul cererii</p>
      <h2 className="branch-detail__title">{summaryTitle(progress)}</h2>
      <ul className="request-summary__groups">
        {progress.groups.map((group) => (
          <li key={group.state} data-state={group.state}>
            <span className="commercial-dot" data-state={group.state} aria-hidden="true" />
            <span className="request-summary__label">{group.label}</span>
            <span className="request-summary__count">{group.branches.length}</span>
            <span className="request-summary__members">
              {group.branches.length ? group.branches.map((branch) => `${branch.indexLabel} ${branch.title}`).join(" · ") : "—"}
            </span>
          </li>
        ))}
      </ul>
      <p className="request-summary__hint">
        <strong>Nicio ramură selectată</strong>
        <span>Alege un rând pentru lanțul ofertă → comandă → fișa lucrării. Selecția rămâne în adresă și la revenire.</span>
      </p>
    </div>
  );
}

function summaryTitle(progress: RequestCommercialProgressView): string {
  if (progress.offered === 0) return "Nicio ofertă încă";
  if (progress.offered === 1) return "1 ofertă";
  return `${progress.offered} oferte, fiecare cu starea ei`;
}
