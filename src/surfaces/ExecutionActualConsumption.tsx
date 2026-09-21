import type {
  ActualConsumptionTransport,
  PlannedResourceTransport,
} from "../api/types";
import { TextField } from "../components/TextField";
import {
  actualConsumptionDraftKey,
  actualConsumptionFieldId,
  actualConsumptionFieldLabel,
} from "../presentation/executionActuals";
import { formatQuantity } from "../presentation/format";

export function ExecutionActualConsumptionFields({
  taskId,
  plannedResources,
  drafts,
  disabled,
  onChange,
}: {
  taskId: string;
  plannedResources: readonly PlannedResourceTransport[];
  drafts: Record<string, string>;
  disabled: boolean;
  onChange: (resourceId: string, value: string) => void;
}) {
  return (
    <section className="execution-actuals" aria-labelledby={`actuals-${taskId}`}>
      <h3 id={`actuals-${taskId}`} className="section-label">
        Consum efectiv
      </h3>
      {plannedResources.map((resource) => (
        <div key={resource.resourceId} className="execution-actuals__row">
          <p className="execution-actuals__planned">
            Planificat: {formatQuantity(resource.plannedQuantity, resource.unit)}
          </p>
          <TextField
            id={actualConsumptionFieldId(taskId, resource.resourceId)}
            label={actualConsumptionFieldLabel(resource.label)}
            hint={resource.unit}
            value={drafts[actualConsumptionDraftKey(taskId, resource.resourceId)] ?? ""}
            inputMode="decimal"
            disabled={disabled}
            onChange={(value) => onChange(resource.resourceId, value)}
          />
        </div>
      ))}
    </section>
  );
}

export function ExecutionActualConsumptionHistory({
  actualConsumption,
}: {
  actualConsumption: readonly ActualConsumptionTransport[];
}) {
  if (actualConsumption.length === 0) {
    return null;
  }
  return (
    <section className="execution-actuals execution-actuals--history">
      <h3 className="section-label">Consum efectiv</h3>
      <ul className="execution-actuals__history">
        {actualConsumption.map((line) => (
          <li key={`${line.resourceId}:${line.unit}:${line.actualQuantity}`}>
            <span>{line.label}</span>
            <span>{formatQuantity(line.actualQuantity, line.unit)}</span>
            {line.note ? <span>{line.note}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}