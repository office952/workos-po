export const MAX_REQUEST_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/** HTTP envelope headroom above file bytes for multipart boundaries/headers. */
export const REQUEST_ATTACHMENT_MULTIPART_ENVELOPE_BYTES = 256 * 1024;

export const MAX_REQUEST_ATTACHMENT_HTTP_BODY_BYTES =
  MAX_REQUEST_ATTACHMENT_BYTES + REQUEST_ATTACHMENT_MULTIPART_ENVELOPE_BYTES;

export const REQUEST_ATTACHMENT_ERRORS = [
  "not_found",
  "request_cancelled",
  "file_too_large",
  "invalid_file",
  "storage_unavailable",
  "file_missing",
  "file_corrupt",
] as const;
export type RequestAttachmentError = (typeof REQUEST_ATTACHMENT_ERRORS)[number];

export type CommercialRequestAttachment = {
  attachmentId: string;
  requestId: string;
  originalFileName: string;
  mimeType: string | null;
  sizeBytes: number;
  storageKey: string;
  sha256: string;
  createdAt: string;
};

export type RequestAttachmentProjection = {
  attachmentId: string;
  originalFileName: string;
  mimeType: string | null;
  sizeBytes: number;
  sizeLabel: string;
  createdAt: string;
  downloadHref: string;
};

export function generateAttachmentId(): string {
  return `att:${crypto.randomUUID()}`;
}

/** Opaque filesystem object name — never derived from the user filename. */
export function generateAttachmentStorageKey(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export function canUploadRequestAttachment(status: string): boolean {
  return status !== "CANCELLED";
}

export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function requestAttachmentDownloadHref(
  requestId: string,
  attachmentId: string,
): string {
  return `/api/requests/${encodeURIComponent(requestId)}/attachments/${encodeURIComponent(
    attachmentId,
  )}/download`;
}

export function projectRequestAttachment(
  attachment: CommercialRequestAttachment,
): RequestAttachmentProjection {
  return {
    attachmentId: attachment.attachmentId,
    originalFileName: attachment.originalFileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    sizeLabel: formatAttachmentSize(attachment.sizeBytes),
    createdAt: attachment.createdAt,
    downloadHref: requestAttachmentDownloadHref(
      attachment.requestId,
      attachment.attachmentId,
    ),
  };
}

/**
 * Sanitize original filename for Content-Disposition ASCII fallback.
 * Does not change stored metadata; download uses this only for headers.
 */
export function safeAttachmentDownloadAsciiName(originalFileName: string): string {
  const base = originalFileName
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  if (!base || base === "." || base === "..") {
    return "fisier";
  }
  return base.slice(0, 180);
}
