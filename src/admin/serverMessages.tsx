import type { ReactNode } from "react";
import { TransportError, readTransportErrorCode, readTransportReasons } from "../api/http";
import { AdminSupportDetails } from "./adminParts";

/**
 * What the operator reads when the server refuses an Administration change.
 *
 * Order (nothing here invents meaning):
 * 1. a code this page knows, or a code with the same meaning everywhere → a Romanian explanation;
 * 2. otherwise the server's own operator reason, as sent;
 * 3. otherwise the page's fallback sentence.
 * When the code is not one we explain, it stays available under „Detalii pentru suport”
 * (code and HTTP status), never in the operator's sentence and never as a success.
 */
export type AdminFailure = { text: string; diagnostic: string | null };

/** Codes whose meaning is the same on every Administration endpoint that returns them. */
const COMMON_CODES: Record<string, string> = {
  forbidden: "Nu ai dreptul să faci această modificare. Doar proprietarul organizației o poate face.",
  unavailable: "Serviciul nu este disponibil acum. Nimic nu a fost schimbat; încearcă din nou.",
};

export function describeAdminFailure(
  status: number | null,
  body: unknown,
  known: Readonly<Record<string, string>>,
  fallback: string,
): AdminFailure {
  const code = readTransportErrorCode(body);
  if (code && known[code]) return { text: known[code], diagnostic: null };
  if (code && COMMON_CODES[code]) return { text: COMMON_CODES[code], diagnostic: null };
  const diagnostic = `${code ?? "fără cod"} · HTTP ${status ?? "fără răspuns"}`;
  const reason = readTransportReasons(body)[0];
  if (reason) return { text: reason, diagnostic };
  return { text: fallback, diagnostic };
}

/** Same as above for calls that throw (getJson/postJson): a TransportError carries the answer. */
export function describeAdminException(
  error: unknown,
  known: Readonly<Record<string, string>>,
  fallback: string,
): AdminFailure {
  if (error instanceof TransportError) {
    return describeAdminFailure(error.status, error.body, known, fallback);
  }
  return { text: fallback, diagnostic: "fără răspuns de la server" };
}

/** The operator sentence, with the diagnostic folded away for support. */
export function adminFailureContent(failure: AdminFailure): ReactNode {
  if (!failure.diagnostic) return failure.text;
  return (
    <>
      {failure.text}
      <AdminSupportDetails>Cod: {failure.diagnostic}</AdminSupportDetails>
    </>
  );
}
