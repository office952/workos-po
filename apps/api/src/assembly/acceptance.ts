import { acceptAssemblyQuote, type AssemblyOrderSnapshot } from "@workos-final/domain";
import type { getProductSystem } from "../cloud/context.js";
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
 * snapshot without an order can become an order; any other identity is refused before a write.
 */
export function planAssemblyAcceptance(
  runtime: ProductSystem,
  input: { assemblyId: string; quoteSnapshotId: string | null; createdAt: string },
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
  const children = definition.members.flatMap((member) => {
    const child = readConfirmedChild(plane.db, plane.organizationId, member.confirmedTruthId);
    return child ? [child] : [];
  });
  const accepted = acceptAssemblyQuote({
    orderSnapshotId: `asmo:${current.contentHash.slice(0, 24)}`,
    quote: current,
    children,
    createdAt: input.createdAt,
  });
  if (!accepted.ok) {
    return { ok: false, status: 422, body: { error: accepted.error, reasons: [...accepted.reasons] } };
  }
  return { ok: true, order: accepted.order };
}
