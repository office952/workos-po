import type { HistoryBranch, HistoryEntry } from "../../../../adapters/customerDossierAdapter";
import type { QuoteListItemTransport } from "../../../../api/types";
import { countLabel, offerCount } from "../historyModel";

export type ChainTone = "done" | "attention" | "open" | "none";

export type ChainStep = { key: string; tone: ChainTone; label: string };

const lower = (value: string) => value.toLocaleLowerCase("ro");

/**
 * N-020 · the line under a collapsed project (Figma 604:8170): "Cerere → 2 oferte · urmează
 * acceptarea → fără lucrare încă". Each offer is counted once; the offers' words are the
 * server's (the attention reason when every offer shares it, else their stages, each counted, so
 * mixed offers are never reduced to the most advanced one). Works are counted from the branches.
 */
export function projectChain(entry: HistoryEntry, quotes: readonly QuoteListItemTransport[]): ChainStep[] {
  const steps: ChainStep[] = [{ key: "request", tone: entry.request ? "done" : "none", label: entry.request ? "Cerere" : "Fără cerere" }];
  const offered = entry.branches.filter((branch): branch is HistoryBranch & { quote: NonNullable<HistoryBranch["quote"]> } => branch.quote !== null);
  if (offered.length === 0) {
    steps.push({ key: "offers", tone: "none", label: "fără ofertă" });
  } else {
    const rows = offered.map((branch) => quotes.find((quote) => quote.quoteSnapshotId === branch.quote.quoteSnapshotId) ?? null);
    const attention = rows.filter((row) => row?.needsAttention);
    const reasons = [...new Set(attention.map((row) => row?.attentionLabel ?? ""))];
    const count = countLabel(offerCount(entry), "ofertă", "oferte");
    if (attention.length === offered.length && reasons.length === 1 && reasons[0]) {
      steps.push({ key: "offers", tone: "attention", label: `${count} · ${lower(reasons[0])}` });
    } else {
      const stages = new Map<string, number>();
      for (const branch of offered) stages.set(branch.quote.stageLabel, (stages.get(branch.quote.stageLabel) ?? 0) + 1);
      const label =
        stages.size === 1
          ? `${count} ${lower([...stages.keys()][0] ?? "")}`.trim()
          : `${count} · ${[...stages].map(([stage, n]) => `${n} ${lower(stage)}`).join(", ")}`;
      steps.push({ key: "offers", tone: attention.length ? "attention" : "done", label });
    }
  }
  const jobs = entry.branches.filter((branch) => branch.job).length;
  steps.push({ key: "jobs", tone: jobs ? "done" : "none", label: jobs ? countLabel(jobs, "lucrare", "lucrări") : "fără lucrare încă" });
  return steps;
}

/** Whether the server marks anything of this project as needing attention (warm card border). */
export function projectNeedsAttention(entry: HistoryEntry, quotes: readonly QuoteListItemTransport[]): boolean {
  if (entry.kind !== "PROJECT") return false;
  return entry.branches.some((branch) => branch.quote && quotes.some((quote) => quote.quoteSnapshotId === branch.quote?.quoteSnapshotId && quote.needsAttention && !quote.superseded));
}

/** The amount of an offer as the server formats it, with its currency. */
export function offerAmount(quote: QuoteListItemTransport | null): string | null {
  return quote?.grossDisplay ? `${quote.grossDisplay}${quote.currency ? ` ${quote.currency}` : ""}` : null;
}
