import { acceptAssemblyQuote, type AssemblyOrderSnapshot } from "@workos-final/domain";
import type { getProductSystem } from "../cloud/context.js";
import { refuseAcceptIfDispositioned } from "../commercial/closureStore.js";
import {
  readAssemblyDefinition,
  readAssemblyOrderByQuote,
  readConfirmedChild,
  readLatestAssemblyQuote,
} from "./store.js";

type ProductSystem = ReturnType<typeof getProductSystem>;

export type AssemblyAcceptanceRefusal = {
  ok: false;
  status: 400 | 404 | 409 | 422;
  body: {
    error: string;
    reasons: string[];
    currentQuoteSnapshotId?: string;
    orderSnapshotId?: string;
  };
};

/**
 * Acceptance is bound to the exact frozen quote the operator reviewed. Only the assembly's current
 * snapshot without an order, priced from the configuration that is confirmed right now, can become an
 * order; anything else is refused before a write.
 */
export function planAssemblyAcceptance(
  runtime: ProductSystem,
  input: {
    assemblyId: string;
    quoteSnapshotId: string | null;
    createdAt: string;
    /** AUD-PRICING-002 · Owner exception from the authenticated session; needed for incomplete cost. */
    incompleteCost?: { acceptedByUserId: string; reason: string } | null;
    /**
     * Read-only dry run: answers whether the quote can be accepted at all. The exception is a
     * step of the acceptance itself, so its absence is not a refusal here. Nothing is persisted.
     */
    probe?: boolean;
  },
): { ok: true; order: AssemblyOrderSnapshot } | AssemblyAcceptanceRefusal {
  const plane = runtime.assemblyPlane();
  const definition = readAssemblyDefinition(plane.db, plane.organizationId, input.assemblyId);
  if (!definition) {
    return { ok: false, status: 404, body: { error: "not_found", reasons: [] } };
  }
  if (!input.quoteSnapshotId) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "quote_identity_required",
        reasons: ["Acceptarea trebuie să indice oferta înghețată pe care ai verificat-o."],
      },
    };
  }
  const current = readLatestAssemblyQuote(plane.db, plane.organizationId, definition.assemblyId);
  if (!current) {
    return {
      ok: false,
      status: 404,
      body: { error: "not_found", reasons: ["Ansamblul nu are o ofertă înghețată."] },
    };
  }
  if (current.quoteSnapshotId !== input.quoteSnapshotId) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "assembly_quote_superseded",
        reasons: [
          "Oferta deschisă nu mai este oferta curentă a ansamblului. Deschide oferta curentă și verific-o înainte de acceptare.",
        ],
        currentQuoteSnapshotId: current.quoteSnapshotId,
      },
    };
  }
  const existing = readAssemblyOrderByQuote(plane.db, plane.organizationId, current.quoteSnapshotId);
  const dispositionRefusal = refuseAcceptIfDispositioned(
    plane.db,
    plane.organizationId,
    current.requestId,
    current.quoteSnapshotId,
  );
  if (dispositionRefusal) {
    return {
      ok: false,
      status: 422,
      body: {
        error: dispositionRefusal.error,
        reasons: [...dispositionRefusal.reasons],
      },
    };
  }
  if (existing) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "assembly_quote_already_accepted",
        reasons: ["Oferta este deja acceptată și are comandă."],
        orderSnapshotId: existing.orderSnapshotId,
      },
    };
  }
  if (definition.status !== "CONFIRMED") {
    return staleConfiguration(
      "Ansamblul a fost modificat după înghețarea acestei oferte. Revizuiește și confirmă ansamblul, apoi îngheață o ofertă nouă.",
    );
  }
  if (
    definition.confirmedTruthId !== current.assemblyTruthId ||
    definition.confirmedTruthHash !== current.assemblyTruthHash
  ) {
    return staleConfiguration(
      "Configurația sau prețul unei părți s-a schimbat după înghețarea acestei oferte. Îngheață o ofertă nouă înainte de acceptare.",
    );
  }
  const children = definition.members.flatMap((member) => {
    const child = readConfirmedChild(plane.db, plane.organizationId, member.confirmedTruthId);
    return child ? [child] : [];
  });
  const accepted = acceptAssemblyQuote({
    orderSnapshotId: `asmo:${current.contentHash.slice(0, 24)}`,
    quote: current,
    children,
    createdAt: input.createdAt,
    incompleteCost: input.probe
      ? { acceptedByUserId: "probe", reason: "probe" }
      : (input.incompleteCost ?? null),
  });
  if (!accepted.ok) {
    return { ok: false, status: 422, body: { error: accepted.error, reasons: [...accepted.reasons] } };
  }
  return { ok: true, order: accepted.order };
}

function staleConfiguration(reason: string): AssemblyAcceptanceRefusal {
  return { ok: false, status: 409, body: { error: "assembly_quote_stale_configuration", reasons: [reason] } };
}
