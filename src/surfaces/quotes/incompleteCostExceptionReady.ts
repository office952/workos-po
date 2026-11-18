/** The acceptance can be sent: nothing to confirm, or confirmed with a reason. */
export function incompleteCostExceptionReady(required: boolean, acknowledged: boolean, reason: string): boolean {
  return !required || (acknowledged && reason.trim().length > 0);
}
