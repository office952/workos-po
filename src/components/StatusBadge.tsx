import type { PresentationTone } from "../presentation/foundationProof";

type StatusBadgeProps = {
  label: string;
  tone: PresentationTone;
};

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return <span className={`status status--${tone}`}>{label}</span>;
}
