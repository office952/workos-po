import { readTransportErrorCode, TransportError } from "../../../api/http";
import { presentCustomerLogo } from "../../../adapters/customerAdapter";
import type { CustomerLogoTransport } from "../../../api/types";

/**
 * N-023 · what the logo dialog checks before sending (the server checks everything again and is the
 * one that decides) and the operator's words for every answer. The limits mirror the API contract:
 * PNG, JPEG or WebP, at most 2 MB and 4096 px per side.
 */
export const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MAX_SIDE = 4096;
export const LOGO_LIMITS_TEXT = "PNG, JPEG sau WebP · cel mult 2 MB și 4096 px pe latură.";

const REASON_TEXT: Record<string, string> = {
  UNSUPPORTED_FORMAT: "Formatul nu este acceptat. Folosește PNG, JPEG sau WebP; SVG și GIF nu sunt acceptate.",
  TYPE_MISMATCH: "Conținutul fișierului nu corespunde extensiei lui. Salvează imaginea din nou ca PNG, JPEG sau WebP.",
  MALFORMED: "Fișierul este deteriorat sau incomplet și nu poate fi folosit.",
  ANIMATED: "O imagine animată nu poate fi folosită ca siglă.",
  DIMENSIONS: "Imaginea depășește 4096 px pe una dintre laturi.",
  EMPTY: "Fișierul este gol.",
  TOO_LARGE: "Fișierul depășește 2 MB.",
};

export function logoReasonText(reason: string): string {
  return REASON_TEXT[reason] ?? REASON_TEXT.MALFORMED!;
}

const FORMATS = [
  { type: "image/png", extensions: ["png"] },
  { type: "image/jpeg", extensions: ["jpg", "jpeg"] },
  { type: "image/webp", extensions: ["webp"] },
];

/** First look at a chosen file, before it is decoded: a refusal reason, or null. */
export function precheckLogoFile(file: { name: string; type: string; size: number }): string | null {
  if (file.size === 0) return "EMPTY";
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? "";
  const type = file.type.toLowerCase();
  const byType = FORMATS.find((format) => format.type === type);
  const byExtension = FORMATS.find((format) => format.extensions.includes(extension));
  if (!byType && !byExtension) return "UNSUPPORTED_FORMAT";
  if (byType && extension && byExtension !== byType) return "TYPE_MISMATCH";
  if (file.size > LOGO_MAX_BYTES) return "TOO_LARGE";
  return null;
}

export function checkLogoSize(size: { width: number; height: number }): string | null {
  if (size.width < 1 || size.height < 1) return "MALFORMED";
  return size.width > LOGO_MAX_SIDE || size.height > LOGO_MAX_SIDE ? "DIMENSIONS" : null;
}

/** The browser decodes the image: a file it cannot show is never offered for confirmation. */
export function readImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("decode"));
    image.src = url;
  });
}

export type LogoState = { logo: CustomerLogoTransport | null; revision: number };

/** The logo state in a server answer (success or 409), when it carries one. */
export function logoStateFrom(body: unknown): LogoState | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const revision = record.logoRevision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) return null;
  return { logo: presentCustomerLogo(record.logo), revision };
}

export type LogoFailure = { kind: "conflict"; current: LogoState | null } | { kind: "refused"; text: string } | { kind: "error"; text: string };

export function logoFailure(caught: unknown): LogoFailure {
  if (caught instanceof TransportError) {
    const code = readTransportErrorCode(caught.body);
    if (code === "stale_revision") return { kind: "conflict", current: logoStateFrom(caught.body) };
    if (code === "invalid_logo") {
      const reason = (caught.body as { reason?: unknown } | null)?.reason;
      return { kind: "refused", text: logoReasonText(typeof reason === "string" ? reason : "MALFORMED") };
    }
    if (code === "file_too_large") return { kind: "refused", text: logoReasonText("TOO_LARGE") };
    if (caught.status === 403) return { kind: "error", text: "Nu ai dreptul să modifici sigla acestui client." };
    if (caught.status === 404) return { kind: "error", text: "Clientul nu mai este disponibil în această organizație." };
  }
  return { kind: "error", text: "Sigla nu s-a salvat: serverul nu a răspuns sau a refuzat temporar. Fișierul ales a rămas selectat; poți reîncerca." };
}
