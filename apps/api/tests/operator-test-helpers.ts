import type { Hono } from "hono";
import type { ApiEnv } from "../src/cloud/context.js";
import type { ProductSystemRuntime } from "../src/productSystem/runtime.js";
import { OPERATOR_SESSION_COOKIE } from "../src/operator/store.js";

type TestApp = Hono<ApiEnv>;

export async function setPinViaHttp(
  app: TestApp,
  personId: string,
  pin = "246810",
): Promise<void> {
  const response = await app.request(`/api/people/${encodeURIComponent(personId)}/operator-pin`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pin, confirmPin: pin }),
  });
  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(`pin_http_failed:${body.error ?? response.status}`);
  }
}

export async function sessionCookieViaHttp(
  app: TestApp,
  personId: string,
  pin = "246810",
): Promise<string> {
  await setPinViaHttp(app, personId, pin);
  const response = await app.request("/api/operator-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ personId, pin }),
  });
  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(`identify_http_failed:${body.error ?? response.status}`);
  }
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(new RegExp(`${OPERATOR_SESSION_COOKIE}=([^;]+)`));
  if (!match) {
    throw new Error("missing_session_cookie");
  }
  return `${OPERATOR_SESSION_COOKIE}=${match[1]}`;
}

export async function ensureOperatorSession(
  runtime: ProductSystemRuntime,
  personId: string,
  pin = "246810",
): Promise<string> {
  if (!runtime.personHasOperatorPin(personId)) {
    const created = await runtime.setOperatorPin(personId, pin, pin);
    if (!created.ok) {
      throw new Error(`pin_setup_failed:${created.error}`);
    }
  }
  let identified = await runtime.identifyOperator(personId, pin);
  if (!identified.ok) {
    const reset = await runtime.setOperatorPin(personId, pin, pin);
    if (!reset.ok) {
      throw new Error(`pin_reset_failed:${reset.error}`);
    }
    identified = await runtime.identifyOperator(personId, pin);
    if (!identified.ok) {
      throw new Error(`identify_failed:${identified.error}`);
    }
  }
  return `${OPERATOR_SESSION_COOKIE}=${identified.rawToken}`;
}

export async function cookieForPersonName(
  runtime: ProductSystemRuntime,
  displayName: string,
  pin = "246810",
): Promise<string> {
  const person = runtime.listPeople().find((item) => item.displayName === displayName);
  if (!person) {
    throw new Error(`missing_person:${displayName}`);
  }
  return ensureOperatorSession(runtime, person.personId, pin);
}

export function withCookie(init: RequestInit | undefined, cookie: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("cookie", cookie);
  return { ...init, headers };
}

export async function startTaskAs(app: TestApp, taskId: string, cookie: string): Promise<Response> {
  return app.request(`/api/execution-tasks/${taskId}/start`, withCookie({ method: "POST" }, cookie));
}

export async function completeTaskAs(
  app: TestApp,
  taskId: string,
  cookie: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return app.request(
    `/api/execution-tasks/${taskId}/complete`,
    withCookie(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      cookie,
    ),
  );
}
