import type { ConfigurationReadiness } from "../api/types";

/**
 * Where the current values live. Only FROZEN_QUOTE is kept by the server; the other states are
 * this tab's draft, a server evaluation that is not stored, or a confirmation that is not an offer.
 */
export type ConfiguratorWorkState =
  | "LOCAL_DRAFT"
  | "SERVER_CHECK"
  | "CONFIRMED_CONFIGURATION"
  | "FROZEN_QUOTE";

export const CONFIGURATOR_WORK_STATES: readonly ConfiguratorWorkState[] = [
  "LOCAL_DRAFT",
  "SERVER_CHECK",
  "CONFIRMED_CONFIGURATION",
  "FROZEN_QUOTE",
];

export function resolveConfiguratorWorkState(input: {
  evaluated: boolean;
  confirmed: boolean;
  frozen: boolean;
}): ConfiguratorWorkState {
  if (input.frozen && input.confirmed) return "FROZEN_QUOTE";
  if (input.confirmed) return "CONFIRMED_CONFIGURATION";
  if (input.evaluated) return "SERVER_CHECK";
  return "LOCAL_DRAFT";
}

/** An assembly member is stored in its assembly at confirmation; the shared offer is frozen there. */
export function configuratorWorkStateLabel(
  state: ConfiguratorWorkState,
  assembly = false,
): { label: string; note: string } {
  switch (state) {
    case "LOCAL_DRAFT":
      return { label: "Modificări locale", note: "în această filă" };
    case "SERVER_CHECK":
      return { label: "Evaluare server", note: "nu se păstrează" };
    case "CONFIRMED_CONFIGURATION":
      return assembly
        ? { label: "Confirmată în ansamblu", note: "salvată în ansamblu" }
        : { label: "Configurație confirmată", note: "nu este ofertă" };
    case "FROZEN_QUOTE":
      return assembly
        ? { label: "Ofertă comună", note: "se îngheață din ansamblu" }
        : { label: "Înghețată în ofertă", note: "salvată pe server" };
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export type ConfiguratorReadinessTone = "pending" | "attention" | "ready" | "verified" | "blocked";

export type ConfiguratorReadiness = {
  tone: ConfiguratorReadinessTone;
  title: string;
  detail: string;
};

/** Header indicator: always the last server answer, never a local guess. */
export function resolveConfiguratorReadiness(input: {
  hasProduct: boolean;
  previewState: "idle" | "pending" | "ready" | "error";
  readiness: ConfigurationReadiness | null;
  missingCount: number;
  missingParts: readonly string[];
  confirmed: boolean;
  frozen?: boolean;
}): ConfiguratorReadiness {
  if (!input.hasProduct) {
    return { tone: "blocked", title: "Produsul nu este ales", detail: "Alege produsul în cerere." };
  }
  if (input.previewState === "error") {
    return { tone: "blocked", title: "Verificare indisponibilă", detail: "Serverul nu a evaluat valorile curente." };
  }
  if (input.previewState !== "ready" || input.readiness === null) {
    return { tone: "pending", title: "Se actualizează", detail: "Serverul evaluează valorile curente." };
  }
  if (input.confirmed && input.frozen) {
    return {
      tone: "verified",
      title: "Înghețată în ofertă",
      detail: "Oferta este salvată pe server. Modificările ulterioare nu o schimbă.",
    };
  }
  if (input.confirmed) {
    return {
      tone: "verified",
      title: "Configurație confirmată",
      detail: "Verificare de server, nu o salvare. Oferta apare doar la înghețare.",
    };
  }
  if (input.readiness === "ready") {
    return { tone: "ready", title: "Pregătit pentru verificare", detail: "După ultima evaluare nu lipsește nimic." };
  }
  if (input.missingCount > 0) {
    return {
      tone: "attention",
      title:
        input.missingCount === 1
          ? "Lipsește 1 informație obligatorie"
          : `Lipsesc ${input.missingCount} informații obligatorii`,
      detail: ["după ultima evaluare", input.missingParts.join(", ")].filter(Boolean).join(" · "),
    };
  }
  return { tone: "attention", title: "Configurația nu este gata", detail: "după ultima evaluare" };
}
