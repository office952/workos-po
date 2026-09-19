import type { LifecycleStep } from "../presentation/jobLifecycle";
import { statusTone } from "../presentation/statusTone";
import { StatusBadge } from "./StatusBadge";

type LifecycleListProps = {
  steps: readonly LifecycleStep[];
};

export function LifecycleList({ steps }: LifecycleListProps) {
  return (
    <ol className="lifecycle">
      {steps.map((step, index) => (
        <li
          key={step.id}
          className={`lifecycle__step lifecycle__step--${step.mark}`}
        >
          <span className="lifecycle__index">{String(index + 1).padStart(2, "0")}</span>
          <span className="lifecycle__label">{step.label}</span>
          <StatusBadge
            label={step.markLabel}
            tone={statusTone(step.mark === "done" ? "success" : "workflow")}
          />
        </li>
      ))}
    </ol>
  );
}
