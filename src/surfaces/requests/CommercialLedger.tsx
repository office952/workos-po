import { useEffect, useRef, type KeyboardEvent } from "react";
import type { RequestLinkedOfferTransport } from "../../api/types";
import type { BranchFilter, CommercialBranch } from "../../presentation/requestCommercialBranches";
import { offerDecisionLock } from "../../presentation/commercialClosureUi";

/**
 * W2 · compact commercial register of one request (WorkOS-N 1162:16456 · 1164:1092 · 1165:530):
 * one line per branch, the inscription as its name, the product under it, the offer code apart.
 * The selected line is the anchor of the branch panel; its key lives in the address (?ramura=).
 */
export function CommercialLedger({
  branches,
  visible,
  filter,
  selectedKey,
  focusSelectedOnMount,
  onFilter,
  onSelect,
  onActivate,
  onClear,
  selecting = false,
  selectedQuoteIds,
  offers,
  onToggleQuote,
}: {
  branches: readonly CommercialBranch[];
  visible: readonly CommercialBranch[];
  filter: BranchFilter;
  selectedKey: string | null;
  focusSelectedOnMount: boolean;
  onFilter: (filter: BranchFilter) => void;
  onSelect: (key: string) => void;
  onActivate: (branch: CommercialBranch) => void;
  onClear: () => void;
  selecting?: boolean;
  selectedQuoteIds?: ReadonlySet<string>;
  offers?: readonly RequestLinkedOfferTransport[];
  onToggleQuote?: (quoteSnapshotId: string) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const focusOnMount = useRef(focusSelectedOnMount);
  const action = branches.filter((branch) => branch.needsAction).length;
  const ordered = branches.filter((branch) => branch.state === "ordered").length;
  const hidden = branches.filter((branch) => !visible.some((item) => item.key === branch.key));
  const rovingKey = visible.some((branch) => branch.key === selectedKey) ? selectedKey : (visible[0]?.key ?? null);

  useEffect(() => {
    if (!focusOnMount.current || !selectedKey) return;
    focusOnMount.current = false;
    const node = listRef.current?.querySelector<HTMLButtonElement>(`[data-branch-key="${CSS.escape(selectedKey)}"]`);
    node?.focus({ preventScroll: true });
    node?.scrollIntoView?.({ block: "nearest" });
  }, [selectedKey]);

  function focusAt(index: number): void {
    const target = visible[index];
    if (!target) return;
    onSelect(target.key);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-branch-key="${CSS.escape(target.key)}"]`)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, branch: CommercialBranch): void {
    const index = visible.findIndex((item) => item.key === branch.key);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(visible.length - 1);
        break;
      case "Enter":
        if (branch.key === selectedKey && branch.primaryAction) {
          event.preventDefault();
          onActivate(branch);
        }
        break;
      case "Escape":
        if (selectedKey) {
          event.preventDefault();
          onClear();
        }
        break;
      default:
        break;
    }
  }

  const products = branches.filter((branch) => branch.kind === "product").length;
  const assemblies = branches.filter((branch) => branch.kind !== "product").length;

  const offerById = new Map((offers ?? []).map((offer) => [offer.quoteSnapshotId, offer]));

  return (
    <section className="ledger" aria-labelledby="request-ledger-title" data-selecting={selecting || undefined}>
      <div className="ledger__head">
        <h2 id="request-ledger-title" className="u-visually-hidden">Ramurile comerciale ale cererii</h2>
        <div className="ledger__filters" role="group" aria-label="Filtrează ramurile acestei cereri">
          <button type="button" aria-pressed={filter === "all"} onClick={() => onFilter("all")}>
            Toate · {branches.length}
          </button>
          <button
            type="button"
            aria-pressed={filter === "action"}
            title="Ramuri care cer o acțiune de rezolvat; ofertele nedecise nu intră aici"
            onClick={() => onFilter("action")}
          >
            De rezolvat · {action}
          </button>
          <button type="button" aria-pressed={filter === "ordered"} onClick={() => onFilter("ordered")}>
            Cu comandă · {ordered}
          </button>
        </div>
        <p className="ledger__caption" role="status">
          {filter === "all"
            ? "Ofertele acestei cereri · ordinea înregistrării"
            : `${visible.length} din ${branches.length} · ordinea înregistrării păstrată`}
        </p>
      </div>
      <div className="ledger__columns" aria-hidden="true">
        {selecting ? <span>Decizie</span> : null}
        <span>Înscripție · produs</span>
        <span>Ofertă</span>
        <span>Stare comercială</span>
        <span>Următorul pas</span>
        <span>Valoare cu TVA</span>
      </div>
      {visible.length === 0 ? (
        <p className="ledger__empty">
          {filter === "action" ? "Nimic de rezolvat în ramurile acestei cereri." : "Nicio ofertă a acestei cereri nu are comandă."}
        </p>
      ) : (
        <ul ref={listRef} className="ledger__rows" aria-label="Ramuri comerciale">
          {visible.map((branch) => {
            const selected = branch.key === selectedKey;
            const quote = branch.quotes.find((item) => !item.superseded) ?? branch.quotes[0] ?? null;
            const offer = quote ? offerById.get(quote.quoteSnapshotId) : undefined;
            const lock = offer ? offerDecisionLock(offer) : null;
            const required = lock?.selectable === true && lock.required;
            const checked = Boolean(quote && selectedQuoteIds?.has(quote.quoteSnapshotId));
            return (
              <li
                key={branch.key}
                className="ledger__row"
                data-selected={selected || undefined}
                data-state={branch.state}
                data-attention={branch.needsAttention || undefined}
                data-decision={required ? "required" : lock && !lock.selectable ? "locked" : undefined}
              >
                <button
                  type="button"
                  className="ledger__select"
                  data-branch-key={branch.key}
                  aria-pressed={selected}
                  aria-controls="branch-detail"
                  aria-label={[branch.title, branch.subtitle, branch.offerReference, branch.stateLabel, branch.priceLabel]
                    .filter(Boolean)
                    .join(", ")}
                  tabIndex={branch.key === rovingKey ? 0 : -1}
                  onClick={() => onSelect(branch.key)}
                  onKeyDown={(event) => onKeyDown(event, branch)}
                />
                {selecting ? (
                  <span className="ledger__pick">
                    {quote && lock?.selectable && onToggleQuote ? (
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!lock.selectable}
                        aria-label={
                          required
                            ? `Cere decizie: ${branch.title}`
                            : `Include în decizie: ${branch.title}`
                        }
                        onChange={() => onToggleQuote(quote.quoteSnapshotId)}
                      />
                    ) : (
                      <span className="ledger__locked" title={lock && !lock.selectable ? lock.reason : undefined}>
                        —
                      </span>
                    )}
                  </span>
                ) : null}
                <span className="ledger__identity">
                  <span className="ledger__title" title={branch.title}>{branch.title}</span>
                  {branch.subtitle ? <span className="ledger__subtitle" title={branch.subtitle}>{branch.subtitle}</span> : null}
                  <span className="ledger__ref ledger__ref--inline">{branch.offerReference ?? "—"}</span>
                </span>
                <span className="ledger__ref">{branch.offerReference ?? "—"}</span>
                <span className="ledger__state">
                  <span className="commercial-dot" data-state={branch.state} aria-hidden="true" />
                  <span>{branch.stateLabel}</span>
                </span>
                <span className="ledger__job" data-tone={branch.step?.tone ?? branch.jobCell.tone}>
                  {branch.step ? (
                    <a className="text-link" href={branch.step.href}>
                      {branch.step.label} <span aria-hidden="true">→</span>
                    </a>
                  ) : (
                    branch.jobCell.label
                  )}
                </span>
                <span className="ledger__value">{branch.priceLabel ?? "—"}</span>
                <span className="ledger__chevron" aria-hidden="true">›</span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="ledger__foot">
        <p>
          {hidden.length > 0 && filter !== "all"
            ? `Ascunse de filtru: ${hidden.map((branch) => branch.title).join(", ")}`
            : `${offerCount(products, "de produs")} · ${assemblies === 0 ? "nicio ofertă de ansamblu" : offerCount(assemblies, "de ansamblu")}`}
        </p>
        <p>Valorile nu se însumează: ofertele sunt independente</p>
      </div>
    </section>
  );
}

function offerCount(value: number, kind: string): string {
  if (value === 0) return `nicio ofertă ${kind}`;
  return value === 1 ? `1 ofertă ${kind}` : `${value} oferte ${kind}`;
}
