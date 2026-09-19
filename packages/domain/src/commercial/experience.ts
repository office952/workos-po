import type { CommercialPriceCompleteness } from "./price.js";
import type { QuoteAcceptanceDecision } from "./quoteAcceptance.js";
import type { QuoteSnapshot } from "./quoteSnapshot.js";
import type { OrderSnapshot } from "./orderSnapshot.js";

export const COMMERCIAL_EXPERIENCE_STAGES = [
  "CONFIGURATION_CONFIRMED",
  "QUOTE_READY",
  "QUOTE_CREATED",
  "QUOTE_ACCEPTED",
  "ORDER_CREATED",
  "RELEASED",
  "EXECUTION_PLANNED",
] as const;
export type CommercialExperienceStage = (typeof COMMERCIAL_EXPERIENCE_STAGES)[number];

export const COMMERCIAL_PRIMARY_ACTIONS = [
  "CREATE_QUOTE",
  "DOWNLOAD_QUOTE",
  "ACCEPT_QUOTE",
  "CREATE_ORDER",
  "RELEASE_PRODUCTION",
  "CREATE_EXECUTION_PLAN",
  "OPEN_EXECUTION",
] as const;
export type CommercialPrimaryAction = (typeof COMMERCIAL_PRIMARY_ACTIONS)[number];

export type CommercialMilestoneId =
  | "configuration"
  | "quote"
  | "acceptance"
  | "order"
  | "production";

export type CommercialMilestoneState = "complete" | "current" | "upcoming";

export type CommercialMilestone = {
  id: CommercialMilestoneId;
  label: string;
  state: CommercialMilestoneState;
};

export type CommercialExperienceInput = {
  commercialCompleteness: CommercialPriceCompleteness;
  internalCostCompleteness?: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
  quote?: QuoteSnapshot;
  acceptance?: QuoteAcceptanceDecision;
  order?: OrderSnapshot;
  released?: boolean;
  executionPlanId?: string;
};

export type CommercialExperienceProjection = {
  stage: CommercialExperienceStage;
  primaryAction: CommercialPrimaryAction | null;
  secondaryActions: readonly CommercialPrimaryAction[];
  milestones: readonly CommercialMilestone[];
  quoteBlocker: string | null;
};

const INCOMPLETE_INTERNAL = "Costul intern nu este complet.";
const INCOMPLETE_PRICE = "Prețul clientului nu poate fi calculat.";

export function projectCommercialExperience(
  input: CommercialExperienceInput,
): CommercialExperienceProjection {
  if (input.executionPlanId) {
    return projection("EXECUTION_PLANNED", "OPEN_EXECUTION");
  }
  if (input.released) {
    return projection("RELEASED", "CREATE_EXECUTION_PLAN");
  }
  if (input.order) {
    return projection("ORDER_CREATED", "RELEASE_PRODUCTION");
  }
  if (input.acceptance && input.quote) {
    return projection("QUOTE_ACCEPTED", "CREATE_ORDER");
  }
  if (input.quote) {
    return projection("QUOTE_CREATED", "DOWNLOAD_QUOTE", ["ACCEPT_QUOTE"]);
  }
  if (input.commercialCompleteness === "COMPLETE") {
    return projection("QUOTE_READY", "CREATE_QUOTE");
  }
  return {
    ...projection("CONFIGURATION_CONFIRMED", null),
    quoteBlocker:
      input.internalCostCompleteness === "COMPLETE" ? INCOMPLETE_PRICE : INCOMPLETE_INTERNAL,
  };
}

export function commercialPrimaryActionLabel(action: CommercialPrimaryAction): string {
  switch (action) {
    case "CREATE_QUOTE":
      return "Creează oferta";
    case "DOWNLOAD_QUOTE":
      return "Descarcă oferta PDF";
    case "ACCEPT_QUOTE":
      return "Marchează acceptată";
    case "CREATE_ORDER":
      return "Creează comanda";
    case "RELEASE_PRODUCTION":
      return "Eliberează pentru producție";
    case "CREATE_EXECUTION_PLAN":
      return "Creează planul de execuție";
    case "OPEN_EXECUTION":
      return "Deschide execuția";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function projection(
  stage: CommercialExperienceStage,
  primaryAction: CommercialPrimaryAction | null,
  secondaryActions: readonly CommercialPrimaryAction[] = [],
): CommercialExperienceProjection {
  return {
    stage,
    primaryAction,
    secondaryActions,
    milestones: milestonesFor(stage),
    quoteBlocker: null,
  };
}

function milestonesFor(stage: CommercialExperienceStage): CommercialMilestone[] {
  return [
    {
      id: "configuration",
      label: "Configurație confirmată",
      state: "complete",
    },
    {
      id: "quote",
      label: stage === "QUOTE_READY" ? "Ofertă" : "Ofertă creată",
      state: stateAfter(stage, "QUOTE_READY", "QUOTE_CREATED"),
    },
    {
      id: "acceptance",
      label: "Ofertă acceptată",
      state: stateAfter(stage, "QUOTE_CREATED", "QUOTE_ACCEPTED"),
    },
    {
      id: "order",
      label: "Comandă creată",
      state: stateAfter(stage, "QUOTE_ACCEPTED", "ORDER_CREATED"),
    },
    {
      id: "production",
      label: "Producție",
      state: stateAfter(stage, "ORDER_CREATED", "EXECUTION_PLANNED"),
    },
  ];
}

function stateAfter(
  stage: CommercialExperienceStage,
  currentAt: CommercialExperienceStage,
  completeAt: CommercialExperienceStage,
): CommercialMilestoneState {
  const order = COMMERCIAL_EXPERIENCE_STAGES;
  const currentIndex = order.indexOf(stage);
  if (currentIndex >= order.indexOf(completeAt)) {
    return "complete";
  }
  if (currentIndex >= order.indexOf(currentAt)) {
    return "current";
  }
  return "upcoming";
}
