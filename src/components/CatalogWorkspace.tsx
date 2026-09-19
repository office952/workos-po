import { useEffect, useState, type ReactNode } from "react";
import { ContextRail } from "./ContextRail";
import { SelectField } from "./SelectField";
import { SurfacePanel } from "./SurfacePanel";

type CatalogWorkspaceProps = {
  families: readonly string[];
  selectedFamily: string;
  allLabel: string;
  onSelectFamily: (family: string) => void;
  children: ReactNode;
};

function useCompactCatalog(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    function sync(): void {
      setCompact(media.matches);
    }
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return compact;
}

export function CatalogWorkspace({
  families,
  selectedFamily,
  allLabel,
  onSelectFamily,
  children,
}: CatalogWorkspaceProps) {
  const compact = useCompactCatalog();
  const options = [allLabel, ...families];

  return (
    <>
      <SurfacePanel variant="quiet" title="Familii" label="Familii">
        <div className="category-control">
          <SelectField
            id="catalog-family"
            label="Familie"
            className="category-control__compact-field"
            value={selectedFamily}
            options={options.map((option) => ({
              value: option === allLabel ? "all" : option,
              label: option,
            }))}
            onChange={onSelectFamily}
          />
          <ContextRail
            label="Familii"
            inert={compact}
            items={[
              {
                id: "all",
                label: allLabel,
                selected: selectedFamily === "all",
                onSelect: () => onSelectFamily("all"),
              },
              ...families.map((family) => ({
                id: family,
                label: family,
                selected: selectedFamily === family,
                onSelect: () => onSelectFamily(family),
              })),
            ]}
          />
        </div>
        <p className="ui-note">
          Familiile vin din arborele citit. Nu există o navigare comercială separată.
        </p>
      </SurfacePanel>
      {children}
    </>
  );
}
