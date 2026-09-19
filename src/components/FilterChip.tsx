type FilterChipProps = {
  label: string;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function FilterChip({ label, pressed, disabled, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      className="filter-chip"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
