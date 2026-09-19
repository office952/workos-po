import type { ConfigurationReadiness } from "../api/types";

export type PresentationTone = "neutral" | "incomplete" | "ready" | "blocked" | "pending";

export type ProofListItem = {
  id: string;
  title: string;
  statusLabel: string;
  tone: PresentationTone;
  dateLabel: string;
};

export type ProofObject = {
  id: string;
  title: string;
  purpose: string;
  nextAction: string;
  consequence: string;
  readiness: ConfigurationReadiness;
  missing: string[];
  fieldLabel: string;
  fieldValue: string;
  fieldHint: string;
};

export type FoundationProofModel = {
  pageTitle: string;
  pageLead: string;
  pageMeta: string;
  primaryAction: string;
  items: ProofListItem[];
  objects: Record<string, ProofObject>;
};

export type ProofNextStep = {
  title: string;
  body: string;
};

export function presentProofNextStep(
  contractOk: boolean,
  object: ProofObject,
): ProofNextStep {
  if (!contractOk) {
    return {
      title: "Acțiunea este indisponibilă",
      body: "Acțiunea principală rămâne indisponibilă deoarece contractul API nu este suportat.",
    };
  }

  switch (object.readiness) {
    case "blocked":
      return {
        title: "De ce este blocat",
        body: `Lipsește: ${object.missing.join(", ")}.`,
      };
    case "ready":
      return {
        title: "Ce urmează",
        body: object.nextAction,
      };
    default: {
      const exhaustive: never = object.readiness;
      return exhaustive;
    }
  }
}

export function selectProofObject(
  model: FoundationProofModel,
  id: string,
): ProofObject {
  const selected = model.objects[id];
  if (selected) {
    return selected;
  }

  const fallbackId = model.items[0]?.id;
  if (fallbackId && model.objects[fallbackId]) {
    return model.objects[fallbackId];
  }

  throw new Error("Foundation proof fixture is empty.");
}
