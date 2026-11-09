export type CatalogComponentSummary = {
  settings: number;
  formulas: number;
  resources: number;
};

function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function catalogComponentSummaryText(summary: CatalogComponentSummary): string {
  const parts: string[] = [];
  if (summary.settings > 0) {
    parts.push(countLabel(summary.settings, "setare", "setări"));
  } else {
    parts.push("fără setări");
  }
  if (summary.formulas > 0) {
    parts.push(countLabel(summary.formulas, "formulă", "formule"));
  }
  if (summary.resources > 0) {
    parts.push(countLabel(summary.resources, "resursă", "resurse"));
  }
  return parts.join(" · ");
}
