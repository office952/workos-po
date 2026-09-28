import { FilterChip } from "./FilterChip";
import { TextField } from "./TextField";

type FilterOption = {
  id: string;
  label: string;
};

type FilterBarProps = {
  searchId: string;
  searchLabel: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  chips?: readonly FilterOption[];
  selectedChip?: string;
  onChipChange?: (id: string) => void;
  meta?: string;
  /** Search-first toolbar rhythm for dense registries. */
  variant?: "default" | "toolbar";
  searchPlaceholder?: string;
};

export function FilterBar({
  searchId,
  searchLabel,
  searchValue,
  onSearchChange,
  chips = [],
  selectedChip,
  onChipChange,
  meta,
  variant = "default",
  searchPlaceholder,
}: FilterBarProps) {
  const toolbar = variant === "toolbar";
  const chipGroup =
    chips.length > 0 && onChipChange ? (
      <div className="filter-bar__chips" role="group" aria-label="Filtre">
        {chips.map((chip) => (
          <FilterChip
            key={chip.id}
            label={chip.label}
            pressed={chip.id === selectedChip}
            onClick={() => onChipChange(chip.id)}
          />
        ))}
      </div>
    ) : null;

  const search = (
    <div className="filter-bar__search">
      <TextField
        id={searchId}
        label={searchLabel}
        value={searchValue}
        placeholder={searchPlaceholder}
        labelVisuallyHidden={toolbar}
        onChange={onSearchChange}
      />
    </div>
  );

  const count = meta ? <p className="filter-bar__meta">{meta}</p> : null;

  return (
    <div
      className={
        toolbar ? "filter-bar filter-bar--registry filter-bar--toolbar" : "filter-bar filter-bar--registry"
      }
    >
      {toolbar ? (
        <>
          {search}
          {chipGroup}
          {count}
        </>
      ) : (
        <>
          {chipGroup}
          {search}
          {count}
        </>
      )}
    </div>
  );
}
