import { sessionHasCapability } from "./capabilityAccess";

export function observationAccessExplanation(): string {
  return "Observațiile și problemele cer un operator identificat în Atelier. Contul de proprietar nu ține locul identificării.";
}

export function instructionAccessExplanation(): string {
  return "Instrucțiunile le publică Proprietarul sau Producția. Serverul verifică același drept.";
}

/**
 * Instructions and supervisor file writes: the server requires `execution.supervise`
 * (Proprietar, Producție). Pre-V1 servers keep the owner-only rule.
 */
export function canPublishInstructions(session: {
  ready: boolean;
  unavailable: boolean;
  mode: string;
  organization: { membershipRole?: string | null; capabilities?: readonly string[] | null } | null;
}): boolean {
  return sessionHasCapability(session, "execution.supervise");
}

export function fileAccessExplanation(canWrite: boolean): string {
  if (canWrite) {
    return "Poți adăuga sau asocia fișiere pentru această operație.";
  }
  return "Fișierele acestei operații cer un operator identificat, Proprietarul sau Producția.";
}
