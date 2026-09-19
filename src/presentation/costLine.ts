import type { CostLineTransport } from "../api/types";
import { formatMoney, formatQuantity, formatRate } from "./format";

export type CostLinePresentation = {
  label: string;
  quantityLabel: string;
  rateLabel: string;
  costLabel: string;
  equationLabel: string;
};

export function presentCostLine(line: CostLineTransport): CostLinePresentation {
  const quantityLabel = formatQuantity(line.quantity, line.unit);
  const rateLabel = formatRate(line.rate, line.currency, line.unit);
  const costLabel = formatMoney(line.cost, line.currency);
  return {
    label: line.label,
    quantityLabel,
    rateLabel,
    costLabel,
    equationLabel: `${quantityLabel} × ${rateLabel} = ${costLabel}`,
  };
}

export function selectLineByResource(
  lines: readonly CostLineTransport[],
  resourceId: string,
): CostLineTransport | null {
  return lines.find((line) => line.resourceId === resourceId) ?? null;
}
