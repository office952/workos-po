import { notifyCloudUnauthorizedUnlessPublic } from "../session/sessionExpiryBridge";

export class TransportError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown = null) {
    super(message);
    this.name = "TransportError";
    this.status = status;
    this.body = body;
  }
}

export type JsonResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number; body: unknown };

export function readTransportErrorCode(body: unknown): string | null {
  if (body === null || typeof body !== "object") {
    return null;
  }
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

export function readTransportReasons(body: unknown): string[] {
  if (body === null || typeof body !== "object") {
    return [];
  }
  const reasons = (body as { reasons?: unknown }).reasons;
  if (!Array.isArray(reasons)) {
    return [];
  }
  return reasons.filter((reason): reason is string => typeof reason === "string");
}

export async function sendJson(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<JsonResult> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    notifyCloudUnauthorizedUnlessPublic(path, response.status);
    return { ok: false, status: response.status, body: payload };
  }
  return { ok: true, status: response.status, body: payload };
}

export async function getJson(path: string): Promise<unknown> {
  const result = await sendJson("GET", path);
  if (!result.ok) {
    throw new TransportError(`Cererea ${path} a eșuat.`, result.status, result.body);
  }
  return result.body;
}

export async function postJson(path: string, body?: unknown): Promise<unknown> {
  const result = await sendJson("POST", path, body);
  if (!result.ok) {
    throw new TransportError(`Cererea ${path} a eșuat.`, result.status, result.body);
  }
  return result.body;
}

export async function patchJson(path: string, body: unknown): Promise<unknown> {
  const result = await sendJson("PATCH", path, body);
  if (!result.ok) {
    throw new TransportError(`Cererea ${path} a eșuat.`, result.status, result.body);
  }
  return result.body;
}

export async function putJson(path: string, body: unknown): Promise<unknown> {
  const result = await sendJson("PUT", path, body);
  if (!result.ok) {
    throw new TransportError(`Cererea ${path} a eșuat.`, result.status, result.body);
  }
  return result.body;
}

export async function postForm(path: string, body: FormData): Promise<unknown> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
    body,
  });
  if (!response.ok) {
    notifyCloudUnauthorizedUnlessPublic(path, response.status);
    const payload = await response.json().catch(() => null);
    throw new TransportError(`Cererea ${path} a eșuat.`, response.status, payload);
  }
  return response.json().catch(() => null);
}

export type DownloadResult =
  | { ok: true; blob: Blob; filename: string | null }
  | { ok: false; status: number; body: unknown };

export async function fetchDownload(path: string): Promise<DownloadResult> {
  const response = await fetch(path, {
    method: "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/pdf, application/json",
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    notifyCloudUnauthorizedUnlessPublic(path, response.status);
    const body = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : null;
    return { ok: false, status: response.status, body };
  }
  return {
    ok: true,
    blob: await response.blob(),
    filename: readContentDispositionFilename(response.headers.get("content-disposition")),
  };
}

export function readContentDispositionFilename(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      return utf8[1];
    }
  }
  const ascii = header.match(/filename="([^"]+)"/i) ?? header.match(/filename=([^;]+)/i);
  return ascii?.[1]?.trim() ?? null;
}

export async function deleteJson(path: string): Promise<unknown> {
  const result = await sendJson("DELETE", path);
  if (!result.ok) {
    throw new TransportError(`Cererea ${path} a eșuat.`, result.status, result.body);
  }
  return result.body;
}
