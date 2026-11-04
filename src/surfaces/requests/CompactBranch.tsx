import type { ReactNode } from "react";
import type { CommercialBranch } from "../../presentation/requestCommercialBranches";
import { InfoRow } from "../../components/InfoRow";
import { BranchStage } from "./BranchStage";

export function CompactBranch({
  branch,
  expanded,
  onToggle,
  onPreview,
  tabIndex,
  buttonRef,
}: {
  branch: CommercialBranch;
  expanded: boolean;
  onToggle: () => void;
  onPreview: (quoteSnapshotId: string) => void;
  tabIndex: number;
  buttonRef?: (node: HTMLButtonElement | null) => void;
}) {
  const panelId = `branch-panel-${branch.key}`;
  return (
    <li className="branch" data-expanded={expanded || undefined} data-attention={branch.needsAttention || undefined} data-kind={branch.kind}>
      <button
        ref={buttonRef}
        type="button"
        className="branch__toggle hit"
        aria-expanded={expanded}
        aria-controls={panelId}
        tabIndex={tabIndex}
        onClick={onToggle}
      >
        <span className="branch__index">{branch.indexLabel}</span>
        <span className="branch__identity">
          <span className="branch__title">{branch.title}</span>
          <span className="branch__kind">{branch.kindLabel}</span>
        </span>
        <BranchStage name="Configurație" cell={branch.stages.configuration} plain />
        <BranchStage name="Ofertă" cell={branch.stages.offer} plain />
        <BranchStage name="Lucrare" cell={branch.stages.work} plain />
        <BranchStage name="Producție" cell={branch.stages.production} plain />
        <span className="branch__chevron" aria-hidden="true">{expanded ? "Pliază" : "Extinde"}</span>
      </button>
      {expanded ? (
        <div className="branch__panel" id={panelId}>
          {branch.note ? <p className="branch__note">{branch.note}</p> : null}
          {branch.quotes.length > 0 ? (
            <ul className="branch__quotes">
              {branch.quotes.map((quote) => (
                <li key={quote.quoteSnapshotId}>
                  <span>
                    {quote.superseded ? "Ofertă anterioară" : "Ofertă curentă"}
                    {quote.reference ? ` · ${quote.reference}` : ""}
                    {quote.stageLabel ? ` · ${quote.stageLabel}` : ""}
                    {quote.attentionLabel ? ` · ${quote.attentionLabel}` : ""}
                    {quote.holdsJob ? " · lucrarea rămâne pe această ofertă" : ""}
                  </span>
                  {branch.primaryAction?.href === quote.href ? null : (
                    <a className="text-link" href={quote.href}>
                      {quote.reference ? `Deschide oferta ${quote.reference}` : "Deschide oferta"}
                    </a>
                  )}
                  <button
                    type="button"
                    className="text-link"
                    data-preview-opener={quote.quoteSnapshotId}
                    aria-haspopup="dialog"
                    onClick={() => onPreview(quote.quoteSnapshotId)}
                  >
                    {quote.reference ? `Previzualizează oferta ${quote.reference}` : "Previzualizează oferta"}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {branch.priceLabel || branch.consultOnly || branch.revisionPending ? (
            <dl className="fact-grid fact-grid--rail">
              {branch.priceLabel ? <InfoRow label="Ofertă comună" value={branch.priceLabel} /> : null}
              {branch.revisionPending ? <InfoRow label="Revizie" value="Ansamblul a fost modificat după ofertă" /> : null}
              {branch.consultOnly ? <InfoRow label="Configurații" value="Doar consultare (comandă acceptată)" /> : null}
            </dl>
          ) : null}
          <div className="branch__actions">
            {branch.primaryAction ? (
              <a className="hit" href={branch.primaryAction.href}>
                <span className="button button--primary">{branch.primaryAction.label}</span>
              </a>
            ) : null}
            <p className="branch__links">
              {branch.assemblyHref && branch.primaryAction?.href !== branch.assemblyHref ? (
                <a className="text-link" href={branch.assemblyHref}>
                  {branch.consultOnly || branch.quotes.length > 0 ? "Deschide ansamblul" : "Continuă ansamblul"}
                </a>
              ) : null}
              {secondaryQuoteLink(branch)}
              {branch.orderHref && branch.primaryAction?.href !== branch.orderHref ? (
                <a className="text-link" href={branch.orderHref}>Deschide comanda</a>
              ) : null}
              {branch.executionHref ? <a className="text-link" href={branch.executionHref}>Deschide în Atelier</a> : null}
            </p>
          </div>
          {branch.primaryAction?.label.startsWith("Deschide oferta") ? (
            <p className="branch__permission">Acceptarea se face în ofertă și o poate face numai proprietarul.</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function secondaryQuoteLink(branch: CommercialBranch): ReactNode {
  if (branch.kind !== "assembly" || branch.primaryAction?.label === "Deschide oferta comună") return null;
  const current = branch.quotes.find((quote) => !quote.superseded) ?? branch.quotes[0] ?? null;
  if (!current) return null;
  return <a className="text-link" href={current.href}>Deschide oferta comună</a>;
}

