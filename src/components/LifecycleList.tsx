import type { LifecycleMark, LifecycleStep } from "../presentation/jobLifecycle";
import type { PresentationTone } from "../presentation/foundationProof";
import { statusTone } from "../presentation/statusTone";
import { StatusBadge } from "./StatusBadge";

type LifecycleListProps = {
  steps: readonly LifecycleStep[];
  label?: string;
};

function toneFor(mark: LifecycleMark): PresentationTone {
  switch (mark) {
    case "done":
      return statusTone("success");
    case "current":
      return "pending";
    case "next":
      return statusTone("warning");
    case "blocked":
      return statusTone("warning");
    case "unavailable":
      return statusTone("workflow");
    default: {
      const exhaustive: never = mark;
      return exhaustive;
    }
  }
}

export function LifecycleList({ steps, label = "Parcurs" }: LifecycleListProps) {
  return (
    <ol className="lifecycle" aria-label={label}>
      {steps.map((step, index) => (
        <li
          key={step.id}
          className={`lifecycle__step lifecycle__step--${step.mark}`}
        >
          <span className="lifecycle__index">{String(index + 1).padStart(2, "0")}</span>
          <span className="lifecycle__label">{step.label}</span>
          <StatusBadge label={step.markLabel} tone={toneFor(step.mark)} />
        </li>
      ))}
    </ol>
  );
}
