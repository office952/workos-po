import { useId, useState, type MouseEvent } from "react";
import { navigate } from "../../../../routing/navigate";
import { DossierIcon } from "../dossierIcons";
import type { WatchModel, WatchSituation } from "./watchModel";

function follow(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(href);
}

function Situations({ items, compactLabels }: { items: WatchSituation[]; compactLabels: boolean }) {
  return (
    <ul className="hwatch__list">
      {items.map((situation) => (
        <li key={situation.key} className="hwatch__item" data-tone={situation.tone}>
          <div className="hwatch__text">
            <p className="hwatch__item-title">{situation.title}</p>
            {situation.details.length ? <p className="hwatch__details">{situation.details.join(" · ")}</p> : null}
          </div>
          <a className="hwatch__action" href={situation.action.href} onClick={(event) => follow(event, situation.action.href)}>
            {compactLabels ? situation.action.label.replace(/ în Cereri și oferte$/, "") : situation.action.label}
            <DossierIcon name="right" size={13} />
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * „De urmărit” (R1 · Figma 904:37515; 604:8132 restrâns · 649:14128 deschis): one compact line,
 * closed by default and opened only by the operator. What the server flags (needsAttention, with
 * its own label) is said concretely and warm; works in execution are normal activity, said apart
 * and quiet. Opened, the two are two columns, each situation once with where it leads. Nothing
 * open → the control is not shown. A search never hides it.
 */
export function HistoryWatch({ model, compactLabels = false }: { model: WatchModel; compactLabels?: boolean }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const attention = model.situations.filter((item) => item.tone === "attention");
  const ongoing = model.situations.filter((item) => item.tone !== "attention");
  return (
    <section className="hwatch" data-tone={model.tone} data-open={open || undefined} aria-label="De urmărit">
      <button type="button" className="hwatch__control" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((value) => !value)}>
        <span className="hwatch__title">De urmărit</span>
        {model.attentionSummary ? (
          <span className="hwatch__part" data-tone="attention">
            <span className="hwatch__dot" aria-hidden="true" data-tone="attention" />
            <span className="hwatch__summary">{model.attentionSummary}</span>
          </span>
        ) : null}
        {model.attentionSummary && model.ongoingSummary ? <span className="hwatch__sep" aria-hidden="true">·</span> : null}
        {model.ongoingSummary ? (
          <span className="hwatch__part" data-tone="neutral">
            <span className="hwatch__dot" aria-hidden="true" data-tone="neutral" />
            <span className="hwatch__summary">{model.ongoingSummary}</span>
          </span>
        ) : null}
        <span className="hwatch__toggle">
          {open ? (compactLabels ? "Ascunde" : "Ascunde situațiile") : compactLabels ? "Arată" : "Arată situațiile"}
          <DossierIcon name={open ? "chevronUp" : "chevronDown"} size={12} />
        </span>
      </button>
      {open ? (
        <div id={listId} className="hwatch__columns">
          {attention.length ? (
            <div className="hwatch__column" data-tone="attention">
              <p className="hwatch__head">
                <span className="hwatch__count" aria-hidden="true">{attention.length}</span>
                <span className="hwatch__head-title">Necesită atenție</span>
                <span className="hwatch__head-note">semnalate de server</span>
              </p>
              <Situations items={attention} compactLabels={compactLabels} />
            </div>
          ) : null}
          {ongoing.length ? (
            <div className="hwatch__column" data-tone="neutral">
              <p className="hwatch__head">
                <span className="hwatch__count" aria-hidden="true">{ongoing.length}</span>
                <span className="hwatch__head-title">În desfășurare</span>
                <span className="hwatch__head-note">activitate obișnuită, fără problemă semnalată</span>
              </p>
              <Situations items={ongoing} compactLabels={compactLabels} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
