import { OPERATOR_SESSION_COOKIE } from "../operator/store.js";
import type { SeedHttpClient, SeedHttpResponse } from "./ownerReviewSeed.js";

type CookieJar = { cookie: string };

function mergeSetCookie(jar: CookieJar, response: Response): void {
  const setCookie =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  if (setCookie.length === 0) {
    return;
  }
  const incoming = setCookie.map((entry) => entry.split(";")[0] ?? "").filter(Boolean);
  if (incoming.length === 0) {
    return;
  }
  const map = new Map<string, string>();
  for (const part of jar.cookie.split("; ").filter(Boolean)) {
    const name = part.split("=", 1)[0];
    if (name) {
      map.set(name, part);
    }
  }
  for (const part of incoming) {
    const name = part.split("=", 1)[0];
    if (name) {
      map.set(name, part);
    }
  }
  jar.cookie = [...map.values()].join("; ");
}

async function readBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * HTTP client against a running SaaS origin (reference runtime).
 */
export function createFetchSeedClient(input: {
  baseUrl: string;
  jar?: CookieJar;
}): SeedHttpClient & { jar: CookieJar } {
  const jar = input.jar ?? { cookie: "" };
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  return {
    jar,
    async request(method, path, body): Promise<SeedHttpResponse> {
      const headers: Record<string, string> = { accept: "application/json" };
      if (jar.cookie) {
        headers.cookie = jar.cookie;
      }
      if (body !== undefined) {
        headers["content-type"] = "application/json";
      }
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      mergeSetCookie(jar, response);
      return {
        ok: response.ok,
        status: response.status,
        body: await readBody(response),
      };
    },
  };
}

export async function loginFetchSeedClient(input: {
  baseUrl: string;
  email: string;
  password: string;
  organizationId?: string;
}): Promise<SeedHttpClient & { jar: CookieJar }> {
  const client = createFetchSeedClient({ baseUrl: input.baseUrl });
  const login = await client.request("POST", "/api/cloud/login", {
    email: input.email,
    password: input.password,
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
  });
  if (!login.ok) {
    throw new Error(`owner_review_login_failed:${login.body?.error ?? login.status}`);
  }
  return client;
}

export async function createOperatorFetchClient(input: {
  baseUrl: string;
  cloudCookie: string;
  personId: string;
  pin: string;
}): Promise<SeedHttpClient> {
  const jar: CookieJar = { cookie: input.cloudCookie };
  const client = createFetchSeedClient({ baseUrl: input.baseUrl, jar });
  const pinSet = await client.request(
    "PUT",
    `/api/people/${encodeURIComponent(input.personId)}/operator-pin`,
    { pin: input.pin, confirmPin: input.pin },
  );
  if (!pinSet.ok && pinSet.status !== 409) {
    // PIN may already be set; continue to identify.
  }
  const identified = await client.request("POST", "/api/operator-session", {
    personId: input.personId,
    pin: input.pin,
  });
  if (!identified.ok) {
    throw new Error(
      `owner_review_operator_login_failed:${identified.body?.error ?? identified.status}`,
    );
  }
  if (!jar.cookie.includes(OPERATOR_SESSION_COOKIE)) {
    throw new Error("owner_review_operator_cookie_missing");
  }
  return client;
}

type AppLike = {
  request(
    input: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    },
  ): Response | Promise<Response>;
};

/**
 * HTTP client against an in-process Hono app (tests).
 */
export function createAppSeedClient(input: {
  app: AppLike;
  jar?: CookieJar;
}): SeedHttpClient & { jar: CookieJar } {
  const jar = input.jar ?? { cookie: "" };
  return {
    jar,
    async request(method, path, body): Promise<SeedHttpResponse> {
      const headers: Record<string, string> = { accept: "application/json" };
      if (jar.cookie) {
        headers.cookie = jar.cookie;
      }
      if (body !== undefined) {
        headers["content-type"] = "application/json";
      }
      const response = await input.app.request(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      mergeSetCookie(jar, response);
      return {
        ok: response.ok,
        status: response.status,
        body: await readBody(response),
      };
    },
  };
}

export async function loginAppSeedClient(input: {
  app: AppLike;
  email: string;
  password: string;
  organizationId?: string;
}): Promise<SeedHttpClient & { jar: CookieJar }> {
  const client = createAppSeedClient({ app: input.app });
  const login = await client.request("POST", "/api/cloud/login", {
    email: input.email,
    password: input.password,
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
  });
  if (!login.ok) {
    throw new Error(`owner_review_login_failed:${login.body?.error ?? login.status}`);
  }
  return client;
}

export async function createOperatorAppClient(input: {
  app: AppLike;
  cloudCookie: string;
  personId: string;
  pin: string;
}): Promise<SeedHttpClient> {
  const jar: CookieJar = { cookie: input.cloudCookie };
  const client = createAppSeedClient({ app: input.app, jar });
  await client.request("PUT", `/api/people/${encodeURIComponent(input.personId)}/operator-pin`, {
    pin: input.pin,
    confirmPin: input.pin,
  });
  const identified = await client.request("POST", "/api/operator-session", {
    personId: input.personId,
    pin: input.pin,
  });
  if (!identified.ok) {
    throw new Error(
      `owner_review_operator_login_failed:${identified.body?.error ?? identified.status}`,
    );
  }
  return client;
}
