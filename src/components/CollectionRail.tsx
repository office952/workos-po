import { ContextRail } from "./ContextRail";
import { SurfacePanel } from "./SurfacePanel";

type CollectionItem = {
  id: string;
  label: string;
  selected?: boolean;
};

type CollectionRailProps = {
  label: string;
  items: readonly CollectionItem[];
};

export function CollectionRail({ label, items }: CollectionRailProps) {
  return (
    <SurfacePanel variant="quiet" title={label} label={label}>
      <ContextRail
        label={label}
        items={items.map((item) => ({
          id: item.id,
          label: item.label,
          selected: item.selected,
        }))}
      />
    </SurfacePanel>
  );
}
