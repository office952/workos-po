import type {
  ProviderCoverage,
  WorkcentersAdminTransport,
} from "../adapters/workcentersAdapter";
import type { ExecutionTaskTransport } from "../api/types";

export type MissingProviderGuidance = {
  title: string;
  reason: string;
  next: string;
  actionLabel: string;
};

export function taskMissingProvider(task: ExecutionTaskTransport | null): boolean {
  return (
    task !== null &&
    task.executionMode !== "EXTERNAL" &&
    task.requiresProvider &&
    task.assignmentLabel === "Nealocat" &&
    task.eligibleProviders.length === 0 &&
    task.status !== "COMPLETED"
  );
}

/**
 * Coverage comes from the server workcenters projection, which applies the same
 * ACTIVE rule as execution eligibility. Without that registry the guidance stays
 * conditional and never claims that an inactive resource exists.
 */
export function presentMissingProviderGuidance(input: {
  capabilityId: string | null;
  capabilityLabel: string | null;
  registry: WorkcentersAdminTransport | null;
}): MissingProviderGuidance {
  const record = input.capabilityId
    ? (input.registry?.coverage.find((item) => item.capabilityId === input.capabilityId) ??
      null)
    : null;
  const coverage: ProviderCoverage | null = record?.coverage ?? null;
  const label = input.capabilityLabel ?? record?.label ?? null;
  const owner = input.registry?.canEdit === true;
  const actionLabel = owner ? "Deschide zone și utilaje" : "Vezi zone și utilaje";
  switch (coverage) {
    case "PROVIDER_PLANNED":
      return {
        title: "Utilaj / zonă neactivată",
        reason: `Există o zonă sau un utilaj cu capabilitatea „${label ?? "necesară"}”, dar este încă Planificat. Execuția folosește doar zone și utilaje active.`,
        next: owner
          ? "Activează zona sau utilajul în Administrare › Zone și utilaje, apoi revino la această sarcină."
          : "Activarea o face proprietarul organizației în Administrare › Zone și utilaje. Anunță-l că sarcina așteaptă activarea.",
        actionLabel,
      };
    case "NO_PROVIDER":
      return {
        title: "Utilaj / zonă lipsă",
        reason:
          "Nu există momentan o zonă sau un utilaj disponibil pentru această capabilitate.",
        next: owner
          ? "Verifică resursele existente și starea lor în Administrare › Zone și utilaje, apoi configurează sau activează o resursă eligibilă."
          : "Proprietarul organizației gestionează aceste resurse în Administrare › Zone și utilaje și poate configura sau activa o resursă eligibilă.",
        actionLabel,
      };
    case "COVERED":
    case null:
      return {
        title: "Utilaj / zonă lipsă",
        reason: label
          ? `Această sarcină cere o zonă sau un utilaj activ cu capabilitatea „${label}”. Execuția nu inventează utilaje sau zone.`
          : "Această sarcină cere un utilaj sau o zonă de lucru eligibilă deja configurată în organizație. Execuția nu inventează utilaje sau zone.",
        next: owner
          ? "Verifică în Administrare › Zone și utilaje capabilitatea, starea zonei și starea utilajului."
          : "Verifică în Administrare › Zone și utilaje capabilitatea, starea zonei și starea utilajului. Atribuirea și activarea le face proprietarul organizației.",
        actionLabel,
      };
    default: {
      const exhaustive: never = coverage;
      return exhaustive;
    }
  }
}
