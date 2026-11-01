import type { KeyboardEvent } from "react";
import { MEMORY_TABS, type MemoryTab } from "../workMemoryModel";

/**
 * R-005 · Comutator dosar (1041:39343), on phone and tablet: Operații, Fișiere, Evenimente. Each
 * tab is reachable with Tab and opens with Enter or Space; the arrows move between them too.
 */
export function MemoryTabs({ idBase, active, counts, onSelect }: { idBase: string; active: MemoryTab; counts: Record<MemoryTab, string>; onSelect: (tab: MemoryTab) => void }) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = MEMORY_TABS[(index + step + MEMORY_TABS.length) % MEMORY_TABS.length]!;
    onSelect(next.value);
    document.getElementById(`${idBase}-tab-${next.value}`)?.focus();
  };
  return (
    <div className="wmem-tabs" role="tablist" aria-label="Dosarul lucrării">
      {MEMORY_TABS.map((tab, index) => (
        <button
          key={tab.value}
          id={`${idBase}-tab-${tab.value}`}
          type="button"
          role="tab"
          aria-selected={active === tab.value}
          aria-controls={`${idBase}-panel-${tab.value}`}
          onClick={() => onSelect(tab.value)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {tab.label}{" "}
          <span className="wmem-tabs__count">{counts[tab.value]}</span>
        </button>
      ))}
    </div>
  );
}
