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
}: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="filter-bar__search">
        <TextField
          id={searchId}
          label={searchLabel}
          value={searchValue}
          onChange={onSearchChange}
        />
      </div>
      {chips.length > 0 && onChipChange ? (
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
      ) : null}
      {meta ? <p className="filter-bar__meta">{meta}</p> : null}
    </div>
  );
}
