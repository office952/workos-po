import { useRef } from "react";
import type { CommercialBranch, LocalConfigurationNotice } from "../../presentation/requestCommercialBranches";
import { branchCountLabel } from "../../presentation/requestCommercialBranches";
import { CompactBranch } from "./CompactBranch";

export function RequestBranchList({
  branches,
  visible,
  filter,
  onFilter,
  expandedKey,
  expandAll,
  onToggle,
  onExpandAll,
  onPreview,
  local,
}: {
  branches: readonly CommercialBranch[];
  visible: readonly CommercialBranch[];
  filter: "all" | "attention";
  onFilter: (filter: "all" | "attention") => void;
  expandedKey: string | null;
  expandAll: boolean;
  onToggle: (key: string) => void;
  onExpandAll: () => void;
  onPreview: (quoteSnapshotId: string) => void;
  local: readonly LocalConfigurationNotice[];
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const attention = branches.filter((branch) => branch.needsAttention).length;
  function move(current: HTMLButtonElement, delta: number): void {
    const items = buttons.current.filter((node): node is HTMLButtonElement => node !== null);
    const index = items.indexOf(current);
    if (index < 0) return;
    const next = delta === 0 ? items[0] : delta === Infinity ? items[items.length - 1] : items[index + delta];
    next?.focus();
  }
  return (
    <section className="branch-list" aria-labelledby="request-branches-title">
      <div className="branch-list__heading">
        <h2 id="request-branches-title">Ce se realizează</h2>
        <p>{branchCountLabel(branches.length, attention)} · ordinea înregistrării</p>
        <div className="branch-list__filters" role="group" aria-label="Filtrează ramurile">
          <button type="button" className="hit" aria-pressed={filter === "all"} onClick={() => onFilter("all")}>
            Toate · {branches.length}
          </button>
          <button type="button" className="hit" aria-pressed={filter === "attention"} onClick={() => onFilter("attention")}>
            Necesită atenție · {attention}
          </button>
          <button type="button" className="hit" aria-pressed={expandAll} onClick={onExpandAll}>
            {expandAll ? "Pliază la una" : "Extinde toate"}
          </button>
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="branch-list__empty">{filter === "attention" ? "Nicio ramură nu necesită atenție." : "Nu există încă un produs sau un ansamblu în această cerere."}</p>
      ) : (
        <div className="branch-list__table">
          <div className="branch-list__columns" aria-hidden="true">
            <span>Ramură</span>
            <span>Configurație</span>
            <span>Ofertă</span>
            <span>Lucrare</span>
            <span>Producție</span>
          </div>
          <ul
            className="branch-list__rows"
            aria-label="Ramuri comerciale"
            onKeyDown={(event) => {
              const current = event.target instanceof HTMLButtonElement ? event.target : null;
              if (!current?.classList.contains("branch__toggle")) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                move(current, 1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                move(current, -1);
              } else if (event.key === "Home") {
                event.preventDefault();
                move(current, 0);
              } else if (event.key === "End") {
                event.preventDefault();
                move(current, Infinity);
              }
            }}
          >
            {visible.map((branch) => {
              const position = branches.findIndex((item) => item.key === branch.key);
              const expanded = expandAll || branch.key === expandedKey;
              return (
                <CompactBranch
                  key={branch.key}
                  branch={branch}
                  expanded={expanded}
                  onToggle={() => onToggle(branch.key)}
                  onPreview={onPreview}
                  tabIndex={branch.key === (expandedKey ?? visible[0]?.key) ? 0 : -1}
                  buttonRef={(node) => {
                    buttons.current[position] = node;
                  }}
                />
              );
            })}
          </ul>
        </div>
      )}
      {local.length > 0 ? (
        <ul className="branch-local" aria-label="Configurări locale">
          {local.map((item) => (
            <li key={item.sessionKey}>
              <p>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </p>
              <a className="text-link" href={item.href}>Continuă configurarea</a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
