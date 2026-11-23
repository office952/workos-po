import type { ApprovalView, OfferingOutcome } from "../commercial/offeringPolicy.js";

/**
 * Commercial Continuity V2 · a quote variant is one product chosen for a request, kept on the
 * server from the moment it is chosen. This module owns the single state label and the single
 * primary action the interface shows; the interface never composes them.
 */

export const QUOTE_VARIANT_STATES = [
  "WITHDRAWN",
  "ISSUED",
  "UNAVAILABLE",
  "NEEDS_REVERIFY",
  "IN_PROGRESS",
  "READY_TO_VERIFY",
  "APPROVAL_STALE",
  "REJECTED",
  "AWAITING_APPROVAL",
  "PRICE_APPROVED",
  "PRICE_PROPOSED",
  "PRICE_SET",
  "AWAITING_PRICE",
] as const;
export type QuoteVariantState = (typeof QUOTE_VARIANT_STATES)[number];

export const QUOTE_VARIANT_ACTIONS = [
  "CONTINUE",
  "VERIFY",
  "SET_PRICE",
  "REQUEST_APPROVAL",
  "DECIDE_APPROVAL",
  "ISSUE",
  "OPEN",
  "OPEN_QUOTE",
  "RESUME",
] as const;
export type QuoteVariantAction = (typeof QUOTE_VARIANT_ACTIONS)[number];

export type QuoteVariantFacts = {
  lifecycle: "ACTIVE" | "WITHDRAWN";
  issued: boolean;
  /** The product is still offered for new work. */
  productAvailable: boolean;
  /** Required values still missing, from the server preview of the saved values. */
  missingCount: number;
  /** A person confirmed the saved values. */
  confirmed: boolean;
  /** The stored confirmation still compiles against the current product definition. */
  confirmationValid: boolean;
  /** A product price is saved on the variant. */
  pricePresent: boolean;
  /** The saved price was set for the configuration that is confirmed now. */
  priceForConfirmedConfiguration: boolean;
  /** Policy outcome for the role that saved the price; null when it cannot be evaluated. */
  priceAuthorOutcome: OfferingOutcome | null;
  /** Latest approval for this variant against the current binding. */
  approvalStatus: ApprovalView["status"];
};

/** First true condition wins, top to bottom (R2 §3.2). */
export function deriveQuoteVariantState(facts: QuoteVariantFacts): QuoteVariantState {
  if (facts.lifecycle === "WITHDRAWN") return "WITHDRAWN";
  if (facts.issued) return "ISSUED";
  if (!facts.productAvailable) return "UNAVAILABLE";
  if (facts.confirmed && !facts.confirmationValid) return "NEEDS_REVERIFY";
  if (!facts.confirmed) return facts.missingCount > 0 ? "IN_PROGRESS" : "READY_TO_VERIFY";
  if (!facts.pricePresent || !facts.priceForConfirmedConfiguration) return "AWAITING_PRICE";
  if (facts.priceAuthorOutcome === "WITHIN_POLICY") return "PRICE_SET";
  switch (facts.approvalStatus) {
    case "STALE":
      return "APPROVAL_STALE";
    case "REJECTED":
      return "REJECTED";
    case "REQUESTED":
      return "AWAITING_APPROVAL";
    case "APPROVED":
      return "PRICE_APPROVED";
    case "NONE":
    case "WITHDRAWN":
      return "PRICE_PROPOSED";
    default: {
      const _exhaustive: never = facts.approvalStatus;
      return _exhaustive;
    }
  }
}

export function quoteVariantStateLabel(state: QuoteVariantState, missingCount = 0): string {
  switch (state) {
    case "WITHDRAWN":
      return "Retrasă";
    case "ISSUED":
      return "Ofertă emisă";
    case "UNAVAILABLE":
      return "Indisponibilă";
    case "NEEDS_REVERIFY":
      return "De reverificat";
    case "IN_PROGRESS":
      return missingCount === 1 ? "În lucru · lipsește 1 informație" : `În lucru · lipsesc ${missingCount} informații`;
    case "READY_TO_VERIFY":
      return "Gata de verificare";
    case "APPROVAL_STALE":
      return "Aprobare caducă";
    case "REJECTED":
      return "Respinsă";
    case "AWAITING_APPROVAL":
      return "Așteaptă aprobarea";
    case "PRICE_APPROVED":
      return "Preț aprobat";
    case "PRICE_PROPOSED":
      return "Preț propus · necesită aprobare";
    case "PRICE_SET":
      return "Preț stabilit";
    case "AWAITING_PRICE":
      return "Așteaptă prețul";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export type QuoteVariantActor = {
  /** May configure quote variants (the right that lets a role create a quote). */
  canConfigure: boolean;
  /** May enter the official price now (role, or role + organization policy). */
  canSetPrice: boolean;
  /** May approve or reject a price request. */
  canApprove: boolean;
  /** Policy outcome if this actor issued the quote now; null when it cannot be evaluated. */
  outcome: OfferingOutcome | null;
};

/** The one action the server gives this actor for this variant. */
export function deriveQuoteVariantAction(
  state: QuoteVariantState,
  actor: QuoteVariantActor,
): QuoteVariantAction {
  if (!actor.canConfigure) return state === "ISSUED" ? "OPEN_QUOTE" : "OPEN";
  switch (state) {
    case "WITHDRAWN":
      return "RESUME";
    case "ISSUED":
      return "OPEN_QUOTE";
    case "UNAVAILABLE":
      return "OPEN";
    case "IN_PROGRESS":
      return "CONTINUE";
    case "NEEDS_REVERIFY":
    case "READY_TO_VERIFY":
      return "VERIFY";
    case "AWAITING_PRICE":
      return actor.canSetPrice ? "SET_PRICE" : "OPEN";
    case "PRICE_SET":
    case "PRICE_PROPOSED":
    case "APPROVAL_STALE":
      if (actor.outcome === "WITHIN_POLICY") return "ISSUE";
      if (actor.outcome === "APPROVAL_REQUIRED") return "REQUEST_APPROVAL";
      return "OPEN";
    case "AWAITING_APPROVAL":
      return actor.canApprove ? "DECIDE_APPROVAL" : "OPEN";
    case "PRICE_APPROVED":
      return actor.canSetPrice ? "ISSUE" : "OPEN";
    case "REJECTED":
      // The rejected binding cannot be asked again: the offer has to change first.
      return actor.outcome === "WITHIN_POLICY" ? "ISSUE" : "OPEN";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function quoteVariantActionLabel(action: QuoteVariantAction): string {
  switch (action) {
    case "CONTINUE":
      return "Continuă";
    case "VERIFY":
      return "Verifică configurația";
    case "SET_PRICE":
      return "Stabilește prețul";
    case "REQUEST_APPROVAL":
      return "Cere aprobarea";
    case "DECIDE_APPROVAL":
      return "Decide";
    case "ISSUE":
      return "Emite oferta";
    case "OPEN":
      return "Deschide";
    case "OPEN_QUOTE":
      return "Deschide oferta";
    case "RESUME":
      return "Reia";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

/** Does this variant ask something of the current actor (the "Necesită acțiune" filter)? */
export function quoteVariantNeedsActor(action: QuoteVariantAction): boolean {
  return action !== "OPEN" && action !== "OPEN_QUOTE" && action !== "RESUME";
}

// ---------------------------------------------------------------------------------------------
// Commercial journal
// ---------------------------------------------------------------------------------------------

export const JOURNAL_ENTRY_KINDS = ["DISCUSSION", "CUSTOMER_BUDGET", "DISCUSSED_PRICE"] as const;
export type JournalEntryKind = (typeof JOURNAL_ENTRY_KINDS)[number];

export const JOURNAL_CHANNELS = ["PHONE", "EMAIL", "WHATSAPP", "MEETING", "OTHER"] as const;
export type JournalChannel = (typeof JOURNAL_CHANNELS)[number];

export const JOURNAL_VAT_BASES = ["NET", "GROSS", "UNSPECIFIED"] as const;
export type JournalVatBasis = (typeof JOURNAL_VAT_BASES)[number];

/** Currencies a discussed amount may be written in. The official price currency is the policy's. */
export const JOURNAL_CURRENCIES = ["EUR", "RON", "USD"] as const;
export type JournalCurrency = (typeof JOURNAL_CURRENCIES)[number];

export const JOURNAL_TEXT_MAX_LENGTH = 1000;
export const JOURNAL_INTERLOCUTOR_MAX_LENGTH = 160;
export const JOURNAL_AMOUNT_MAX = 100_000_000;

export function journalEntryKindLabel(kind: JournalEntryKind): string {
  switch (kind) {
    case "DISCUSSION":
      return "Discuție";
    case "CUSTOMER_BUDGET":
      return "Buget client";
    case "DISCUSSED_PRICE":
      return "Preț discutat";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function journalChannelLabel(channel: JournalChannel): string {
  switch (channel) {
    case "PHONE":
      return "telefon";
    case "EMAIL":
      return "e-mail";
    case "WHATSAPP":
      return "WhatsApp";
    case "MEETING":
      return "întâlnire";
    case "OTHER":
      return "altul";
    default: {
      const _exhaustive: never = channel;
      return _exhaustive;
    }
  }
}

export function journalVatBasisLabel(basis: JournalVatBasis): string {
  switch (basis) {
    case "NET":
      return "fără TVA";
    case "GROSS":
      return "cu TVA";
    case "UNSPECIFIED":
      return "TVA neprecizat";
    default: {
      const _exhaustive: never = basis;
      return _exhaustive;
    }
  }
}

export type JournalEntryInput = {
  kind: JournalEntryKind;
  discussedAt: string;
  channel: JournalChannel;
  interlocutor: string | null;
  amountMin: number | null;
  amountMax: number | null;
  currency: JournalCurrency | null;
  vatBasis: JournalVatBasis | null;
  notes: string | null;
  variantId: string | null;
};

export type JournalEntryIssue = { field: string; reason: string };

function readTrimmed(value: unknown, max: number): string | null | false {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > max ? false : trimmed;
}

function readAmount(value: unknown): number | null | false {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > JOURNAL_AMOUNT_MAX) return false;
  return Math.round(value * 100) / 100;
}

/**
 * Validates what a person writes in the journal. Nothing here touches an official price: the
 * journal only records what was said.
 */
export function validateJournalEntryInput(
  raw: Record<string, unknown>,
  now: string,
): { ok: true; entry: JournalEntryInput } | { ok: false; issues: JournalEntryIssue[] } {
  const issues: JournalEntryIssue[] = [];
  const kind = (JOURNAL_ENTRY_KINDS as readonly string[]).includes(raw.kind as string)
    ? (raw.kind as JournalEntryKind)
    : null;
  if (!kind) issues.push({ field: "kind", reason: "Alege ce consemnezi: discuție, buget client sau preț discutat." });
  const channel = (JOURNAL_CHANNELS as readonly string[]).includes(raw.channel as string)
    ? (raw.channel as JournalChannel)
    : null;
  if (!channel) issues.push({ field: "channel", reason: "Alege canalul discuției." });

  let discussedAt = now;
  if (raw.discussedAt !== undefined && raw.discussedAt !== null && raw.discussedAt !== "") {
    const parsed = typeof raw.discussedAt === "string" ? Date.parse(raw.discussedAt) : Number.NaN;
    if (Number.isNaN(parsed)) {
      issues.push({ field: "discussedAt", reason: "Data discuției nu este validă." });
    } else if (parsed > Date.parse(now) + 5 * 60_000) {
      issues.push({ field: "discussedAt", reason: "Data discuției nu poate fi în viitor." });
    } else {
      discussedAt = new Date(parsed).toISOString();
    }
  }

  const interlocutor = readTrimmed(raw.interlocutor, JOURNAL_INTERLOCUTOR_MAX_LENGTH);
  if (interlocutor === false) {
    issues.push({ field: "interlocutor", reason: `Interlocutorul are cel mult ${JOURNAL_INTERLOCUTOR_MAX_LENGTH} de caractere.` });
  }
  const notes = readTrimmed(raw.notes, JOURNAL_TEXT_MAX_LENGTH);
  if (notes === false) {
    issues.push({ field: "notes", reason: `Observațiile au cel mult ${JOURNAL_TEXT_MAX_LENGTH} de caractere.` });
  }
  const amountMin = readAmount(raw.amountMin);
  const amountMax = readAmount(raw.amountMax);
  if (amountMin === false || amountMax === false) {
    issues.push({ field: "amount", reason: "Suma trebuie să fie un număr pozitiv." });
  }
  const variantId = readTrimmed(raw.variantId, 200);
  if (variantId === false) issues.push({ field: "variantId", reason: "Varianta indicată nu este validă." });

  let currency: JournalCurrency | null = null;
  let vatBasis: JournalVatBasis | null = null;
  if (kind === "DISCUSSION") {
    if ((typeof amountMin === "number") || (typeof amountMax === "number")) {
      issues.push({ field: "amount", reason: "O discuție fără sumă nu are valoare. Alege «Buget client» sau «Preț discutat»." });
    }
    if (notes === null) {
      issues.push({ field: "notes", reason: "Scrie pe scurt ce s-a discutat." });
    }
  } else if (kind) {
    if (amountMin === null && amountMax === null) {
      issues.push({ field: "amount", reason: "Introdu suma sau intervalul discutat." });
    }
    if (typeof amountMin === "number" && typeof amountMax === "number" && amountMin > amountMax) {
      issues.push({ field: "amount", reason: "Valoarea «de la» nu poate depăși valoarea «până la»." });
    }
    currency = (JOURNAL_CURRENCIES as readonly string[]).includes(raw.currency as string)
      ? (raw.currency as JournalCurrency)
      : null;
    if (!currency) issues.push({ field: "currency", reason: "Alege moneda sumei." });
    vatBasis =
      raw.vatBasis === undefined || raw.vatBasis === null
        ? "UNSPECIFIED"
        : (JOURNAL_VAT_BASES as readonly string[]).includes(raw.vatBasis as string)
          ? (raw.vatBasis as JournalVatBasis)
          : null;
    if (!vatBasis) issues.push({ field: "vatBasis", reason: "Baza de TVA nu este validă." });
  }

  if (issues.length > 0 || !kind || !channel) return { ok: false, issues };
  return {
    ok: true,
    entry: {
      kind,
      discussedAt,
      channel,
      interlocutor: interlocutor as string | null,
      amountMin: kind === "DISCUSSION" ? null : (amountMin as number | null),
      amountMax: kind === "DISCUSSION" ? null : (amountMax as number | null),
      currency,
      vatBasis,
      notes: notes as string | null,
      variantId: variantId as string | null,
    },
  };
}

/** Official steps the application adds to the journal thread; never editable. */
export const JOURNAL_OFFICIAL_EVENT_KINDS = [
  "PRICE_PROPOSED",
  "APPROVAL_REQUESTED",
  "PRICE_APPROVED",
  "APPROVAL_REJECTED",
  "QUOTE_ISSUED",
] as const;
export type JournalOfficialEventKind = (typeof JOURNAL_OFFICIAL_EVENT_KINDS)[number];

export function journalOfficialEventLabel(kind: JournalOfficialEventKind): string {
  switch (kind) {
    case "PRICE_PROPOSED":
      return "Preț propus";
    case "APPROVAL_REQUESTED":
      return "Trimisă spre aprobare";
    case "PRICE_APPROVED":
      return "Preț aprobat";
    case "APPROVAL_REJECTED":
      return "Respinsă";
    case "QUOTE_ISSUED":
      return "Ofertă emisă";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
