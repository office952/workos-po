/**
 * Presentation-only registry state for Cereri.
 * When commercial progress already exists, do not keep a misleading "Nouă" badge.
 * Does not change stored request status or invent a new enum.
 */
export function presentRequestRegistryStatus(input: {
  status: string | null;
  statusLabel: string;
  contextLabel: string | null;
}): { stateLabel: string; supportLabel: string } {
  const commercial = input.contextLabel?.trim() || "";
  const workflow = input.statusLabel.trim() || "—";
  const isNewWorkflow =
    input.status === "NEW" || /^nouă$/i.test(workflow);

  if (commercial.length > 0 && isNewWorkflow) {
    return { stateLabel: commercial, supportLabel: "" };
  }

  return {
    stateLabel: workflow,
    supportLabel: commercial,
  };
}
