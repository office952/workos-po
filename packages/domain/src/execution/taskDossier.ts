export const DOSSIER_ENTRY_KINDS = ["INSTRUCTION", "OBSERVATION", "ISSUE_REPORT"] as const;
export type DossierEntryKind = (typeof DOSSIER_ENTRY_KINDS)[number];

export const ISSUE_REASON_CODES = ["MATERIAL", "MACHINE", "DRAWING", "QUALITY", "OTHER"] as const;
export type IssueReasonCode = (typeof ISSUE_REASON_CODES)[number];

export const ISSUE_STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_TRANSITION_ACTIONS = ["ACKNOWLEDGE", "RESOLVE"] as const;
export type IssueTransitionAction = (typeof ISSUE_TRANSITION_ACTIONS)[number];

export const ACTIVE_ISSUE_STATUSES = ["OPEN", "ACKNOWLEDGED"] as const;
export type ActiveIssueStatus = (typeof ACTIVE_ISSUE_STATUSES)[number];

export const ISSUE_ATTENTION_LABEL = "Problemă semnalată";
export const ISSUE_ATTENTION_LABEL_PLURAL = "Probleme semnalate";

export const DOSSIER_TEXT_MAX_LENGTH = 2000;
export const TASK_ARTIFACT_MAX_BYTES = 50 * 1024 * 1024;
export const TASK_ARTIFACT_MULTIPART_ENVELOPE_BYTES = 256 * 1024;
export const TASK_ARTIFACT_HTTP_BODY_BYTES =
  TASK_ARTIFACT_MAX_BYTES + TASK_ARTIFACT_MULTIPART_ENVELOPE_BYTES;

export const TASK_DOSSIER_ERRORS = [
  "not_found",
  "invalid_text",
  "invalid_reason",
  "invalid_file",
  "file_too_large",
  "storage_unavailable",
  "file_missing",
  "file_corrupt",
  "forbidden",
  "artifact_scope",
  "invalid_purpose",
  "invalid_issue_status",
] as const;
export type TaskDossierError = (typeof TASK_DOSSIER_ERRORS)[number];

export type TaskDossierActor = {
  accountId: string;
  operatorId: string | null;
};

export const FILE_PURPOSE_CODES = [
  "WORKING",
  "EXECUTION_READY",
  "TECHNICAL_REFERENCE",
  "EVIDENCE",
  "RECORD",
] as const;
export type FilePurposeCode = (typeof FILE_PURPOSE_CODES)[number];

export type TaskArtifactCategory = "PHOTO" | "DOCUMENT" | "TECHNICAL";
export type TaskArtifactPreview = "IMAGE" | "NONE";

const ALLOWED_ARTIFACTS: readonly {
  extension: string;
  mimes: readonly string[];
  category: TaskArtifactCategory;
  preview: TaskArtifactPreview;
  storedMime: string;
}[] = [
  { extension: "jpg", mimes: ["image/jpeg"], category: "PHOTO", preview: "IMAGE", storedMime: "image/jpeg" },
  { extension: "jpeg", mimes: ["image/jpeg"], category: "PHOTO", preview: "IMAGE", storedMime: "image/jpeg" },
  { extension: "png", mimes: ["image/png"], category: "PHOTO", preview: "IMAGE", storedMime: "image/png" },
  { extension: "webp", mimes: ["image/webp"], category: "PHOTO", preview: "IMAGE", storedMime: "image/webp" },
  { extension: "gif", mimes: ["image/gif"], category: "PHOTO", preview: "IMAGE", storedMime: "image/gif" },
  { extension: "pdf", mimes: ["application/pdf"], category: "DOCUMENT", preview: "NONE", storedMime: "application/pdf" },
  { extension: "txt", mimes: ["text/plain"], category: "DOCUMENT", preview: "NONE", storedMime: "text/plain" },
  {
    extension: "dxf",
    mimes: ["application/dxf", "image/vnd.dxf", "application/octet-stream"],
    category: "TECHNICAL",
    preview: "NONE",
    storedMime: "application/octet-stream",
  },
  {
    extension: "dwg",
    mimes: ["application/acad", "application/dwg", "image/vnd.dwg", "application/octet-stream"],
    category: "TECHNICAL",
    preview: "NONE",
    storedMime: "application/octet-stream",
  },
  {
    extension: "cdr",
    mimes: ["application/vnd.corel-draw", "application/x-cdr", "application/octet-stream"],
    category: "TECHNICAL",
    preview: "NONE",
    storedMime: "application/octet-stream",
  },
  {
    extension: "nc",
    mimes: ["text/plain", "application/octet-stream"],
    category: "TECHNICAL",
    preview: "NONE",
    storedMime: "application/octet-stream",
  },
  {
    extension: "tap",
    mimes: ["text/plain", "application/octet-stream"],
    category: "TECHNICAL",
    preview: "NONE",
    storedMime: "application/octet-stream",
  },
  {
    extension: "gcode",
    mimes: ["text/plain", "application/octet-stream"],
    category: "TECHNICAL",
    preview: "NONE",
    storedMime: "application/octet-stream",
  },
];

export function issueReasonLabel(code: IssueReasonCode): string {
  switch (code) {
    case "MATERIAL":
      return "Material";
    case "MACHINE":
      return "Utilaj";
    case "DRAWING":
      return "Desen / fișier";
    case "QUALITY":
      return "Calitate";
    case "OTHER":
      return "Altceva";
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

export function issueStatusLabel(status: IssueStatus): string {
  switch (status) {
    case "OPEN":
      return "Deschisă";
    case "ACKNOWLEDGED":
      return "Preluată";
    case "RESOLVED":
      return "Rezolvată";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function issueTransitionEventKind(action: IssueTransitionAction): "ISSUE_ACKNOWLEDGED" | "ISSUE_RESOLVED" {
  switch (action) {
    case "ACKNOWLEDGE":
      return "ISSUE_ACKNOWLEDGED";
    case "RESOLVE":
      return "ISSUE_RESOLVED";
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function issueEventLabel(kind: string): string | null {
  switch (kind) {
    case "ISSUE_REPORTED":
      return "Problemă semnalată";
    case "ISSUE_ACKNOWLEDGED":
      return "Problemă preluată";
    case "ISSUE_RESOLVED":
      return "Problemă rezolvată";
    default:
      return null;
  }
}

export function isIssueStatus(value: unknown): value is IssueStatus {
  return value === "OPEN" || value === "ACKNOWLEDGED" || value === "RESOLVED";
}

export function isActiveIssueStatus(status: IssueStatus): status is ActiveIssueStatus {
  return status === "OPEN" || status === "ACKNOWLEDGED";
}

export function resolveIssueStatus(value: unknown): IssueStatus {
  return isIssueStatus(value) ? value : "OPEN";
}

export function presentIssueAttention(activeIssueCount: number): string | null {
  if (activeIssueCount <= 0) {
    return null;
  }
  return activeIssueCount === 1 ? ISSUE_ATTENTION_LABEL : ISSUE_ATTENTION_LABEL_PLURAL;
}

export function issueManagementActions(
  status: IssueStatus,
  canManage: boolean,
): { canAcknowledge: boolean; canResolve: boolean } {
  if (!canManage) {
    return { canAcknowledge: false, canResolve: false };
  }
  return {
    canAcknowledge: status === "OPEN",
    canResolve: status === "OPEN" || status === "ACKNOWLEDGED",
  };
}

export function applyIssueTransition(input: {
  current: IssueStatus;
  action: IssueTransitionAction;
}):
  | { ok: true; next: IssueStatus; alreadyApplied: boolean }
  | { ok: false; error: "invalid_issue_status" } {
  switch (input.action) {
    case "ACKNOWLEDGE":
      switch (input.current) {
        case "OPEN":
          return { ok: true, next: "ACKNOWLEDGED", alreadyApplied: false };
        case "ACKNOWLEDGED":
          return { ok: true, next: "ACKNOWLEDGED", alreadyApplied: true };
        case "RESOLVED":
          return { ok: false, error: "invalid_issue_status" };
        default: {
          const exhaustive: never = input.current;
          return exhaustive;
        }
      }
    case "RESOLVE":
      switch (input.current) {
        case "OPEN":
        case "ACKNOWLEDGED":
          return { ok: true, next: "RESOLVED", alreadyApplied: false };
        case "RESOLVED":
          return { ok: true, next: "RESOLVED", alreadyApplied: true };
        default: {
          const exhaustive: never = input.current;
          return exhaustive;
        }
      }
    default: {
      const exhaustive: never = input.action;
      return exhaustive;
    }
  }
}

export function filePurposeLabel(code: FilePurposeCode): string {
  switch (code) {
    case "WORKING":
      return "Fișier de lucru";
    case "EXECUTION_READY":
      return "Pregătit pentru execuție";
    case "TECHNICAL_REFERENCE":
      return "Referință tehnică";
    case "EVIDENCE":
      return "Dovadă";
    case "RECORD":
      return "Evidență";
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

export function parseOptionalFilePurpose(
  value: unknown,
): { ok: true; purpose: FilePurposeCode | null } | { ok: false; error: "invalid_purpose" } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, purpose: null };
  }
  if (typeof value !== "string" || !FILE_PURPOSE_CODES.includes(value.trim().toUpperCase() as FilePurposeCode)) {
    return { ok: false, error: "invalid_purpose" };
  }
  return { ok: true, purpose: value.trim().toUpperCase() as FilePurposeCode };
}

export function parseOptionalFileNote(
  value: unknown,
): { ok: true; note: string | null } | { ok: false; error: "invalid_text" } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, note: null };
  }
  const parsed = parseDossierText(value);
  if (!parsed.ok) {
    return parsed;
  }
  return { ok: true, note: parsed.text };
}

export function parseDossierText(value: unknown): { ok: true; text: string } | { ok: false; error: "invalid_text" } {
  if (typeof value !== "string") {
    return { ok: false, error: "invalid_text" };
  }
  const text = value.trim();
  if (text.length === 0 || text.length > DOSSIER_TEXT_MAX_LENGTH) {
    return { ok: false, error: "invalid_text" };
  }
  return { ok: true, text };
}

export function parseIssueReason(
  value: unknown,
): { ok: true; reason: IssueReasonCode } | { ok: false; error: "invalid_reason" } {
  if (typeof value !== "string") {
    return { ok: false, error: "invalid_reason" };
  }
  const reason = value.trim().toUpperCase();
  if (!ISSUE_REASON_CODES.includes(reason as IssueReasonCode)) {
    return { ok: false, error: "invalid_reason" };
  }
  return { ok: true, reason: reason as IssueReasonCode };
}

export function classifyTaskArtifact(input: {
  fileName: string;
  mimeType: string | null;
  bytes: Uint8Array;
}):
  | {
      ok: true;
      extension: string;
      mimeType: string;
      category: TaskArtifactCategory;
      preview: TaskArtifactPreview;
    }
  | { ok: false; error: "invalid_file" | "file_too_large" } {
  if (input.bytes.byteLength === 0) {
    return { ok: false, error: "invalid_file" };
  }
  if (input.bytes.byteLength > TASK_ARTIFACT_MAX_BYTES) {
    return { ok: false, error: "file_too_large" };
  }
  const extension = fileExtension(input.fileName);
  if (!extension || extension === "svg" || extension === "html" || extension === "htm" || extension === "js") {
    return { ok: false, error: "invalid_file" };
  }
  const allowed = ALLOWED_ARTIFACTS.find((item) => item.extension === extension);
  if (!allowed) {
    return { ok: false, error: "invalid_file" };
  }
  const mime = (input.mimeType ?? "").trim().toLowerCase();
  if (mime === "image/svg+xml" || mime === "text/html" || mime === "application/javascript") {
    return { ok: false, error: "invalid_file" };
  }
  if (mime.length > 0 && !allowed.mimes.includes(mime)) {
    return { ok: false, error: "invalid_file" };
  }
  if (looksLikeActiveMarkup(input.bytes)) {
    return { ok: false, error: "invalid_file" };
  }
  return {
    ok: true,
    extension,
    mimeType: allowed.storedMime,
    category: allowed.category,
    preview: allowed.preview,
  };
}

export function taskArtifactDownloadHref(artifactId: string): string {
  return `/api/execution-artifacts/${encodeURIComponent(artifactId)}/download`;
}

function fileExtension(fileName: string): string | null {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) {
    return null;
  }
  return base.slice(dot + 1).toLowerCase();
}

function looksLikeActiveMarkup(bytes: Uint8Array): boolean {
  const head = new TextDecoder()
    .decode(bytes.slice(0, 256))
    .trimStart()
    .toLowerCase();
  return (
    head.startsWith("<svg") ||
    head.startsWith("<?xml") ||
    head.startsWith("<!doctype html") ||
    head.startsWith("<html") ||
    head.startsWith("<script")
  );
}
