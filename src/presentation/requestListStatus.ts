/**
 * Presentation-only registry projection for Cereri.
 * Keeps canonical Request state and commercial progress as distinct columns.
 * Does not rewrite status from commercial progression.
 */
export function presentRequestRegistryStatus(input: {
  statusLabel: string;
  contextLabel: string | null;
}): { stateLabel: string; commercialProgressLabel: string } {
  return {
    stateLabel: input.statusLabel.trim() || "—",
    commercialProgressLabel: input.contextLabel?.trim() || "—",
  };
}
