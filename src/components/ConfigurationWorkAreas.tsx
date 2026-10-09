import { useRef } from "react";

export type ConfigurationWorkArea = "configuration" | "review" | "commercial";
const areas: readonly { id: ConfigurationWorkArea; label: string }[] = [
  { id: "configuration", label: "Configurație" },
  { id: "review", label: "Verificare" },
  { id: "commercial", label: "Pregătire ofertă" },
];

/** These are work areas, not product lifecycle states. Switching never confirms. */
export function ConfigurationWorkAreas({ selected, onSelect, disabled = false }: {
  selected: ConfigurationWorkArea;
  disabled?: boolean;
  onSelect: (area: ConfigurationWorkArea) => void;
}) {
  const controls = useRef<(HTMLButtonElement | null)[]>([]);
  return <div className="configuration-areas" role="tablist" aria-label="Etapele configurării">
    {areas.map((area, index) => <button key={area.id} type="button" role="tab"
      disabled={disabled} id={`configuration-tab-${area.id}`} aria-controls={`configuration-area-${area.id}`}
      aria-selected={selected === area.id} tabIndex={selected === area.id ? 0 : -1}
      ref={(node) => { controls.current[index] = node; }}
      onClick={() => onSelect(area.id)} onKeyDown={(event) => {
        let next: number;
        switch (event.key) {
          case "ArrowRight": next = (index + 1) % areas.length; break;
          case "ArrowLeft": next = (index + areas.length - 1) % areas.length; break;
          case "Home": next = 0; break;
          case "End": next = areas.length - 1; break;
          default: return;
        }
        event.preventDefault();
        onSelect(areas[next].id);
        controls.current[next]?.focus();
      }}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{area.label}</button>)}
  </div>;
}
