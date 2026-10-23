import { OPERATOR_SESSION_COOKIE } from "../operator/store.js";
import { createAppSeedClient, createFetchSeedClient } from "./ownerReviewHttp.js";
import type { SeedHttpClient, SeedHttpResponse } from "./ownerReviewSeed.js";

type CookieJar = { cookie: string };

type AppLike = {
  request(
    input: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string | FormData },
  ): Response | Promise<Response>;
};

export type DemoUploadFile = { name: string; type: string; bytes: Uint8Array };

/**
 * One owner Cloud session plus the two extra capabilities the demo needs:
 * multipart uploads and per-person operator identification by PIN.
 * Every call goes through the canonical HTTP routes.
 */
export type DemoTransport = {
  client: SeedHttpClient & { jar: CookieJar };
  upload(
    path: string,
    fields: Record<string, string>,
    file: DemoUploadFile,
  ): Promise<SeedHttpResponse>;
  operator(personId: string, pin: string): Promise<SeedHttpClient>;
};

async function readBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function formFor(fields: Record<string, string>, file: DemoUploadFile): FormData {
  const form = new FormData();
  form.set("file", new Blob([file.bytes], { type: file.type }), file.name);
  for (const [name, value] of Object.entries(fields)) {
    form.set(name, value);
  }
  return form;
}

async function login(
  client: SeedHttpClient,
  input: { email: string; password: string; organizationId?: string },
): Promise<void> {
  const response = await client.request("POST", "/api/cloud/login", {
    email: input.email,
    password: input.password,
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
  });
  if (!response.ok) {
    throw new Error(`demo_login_failed:${response.body?.error ?? response.status}`);
  }
}

/**
 * Identifies an operator with an already configured PIN. Unlike the owner-review
 * helper it never (re)sets the PIN, so a PIN changed during review is respected.
 */
async function identifyOperator(
  client: SeedHttpClient & { jar: CookieJar },
  personId: string,
  pin: string,
): Promise<SeedHttpClient> {
  const identified = await client.request("POST", "/api/operator-session", { personId, pin });
  if (!identified.ok || !client.jar.cookie.includes(OPERATOR_SESSION_COOKIE)) {
    throw new Error(`demo_operator_identify_failed:${identified.body?.error ?? identified.status}`);
  }
  return client;
}

export async function connectDemoFetchTransport(input: {
  baseUrl: string;
  email: string;
  password: string;
  organizationId?: string;
}): Promise<DemoTransport> {
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const client = createFetchSeedClient({ baseUrl });
  await login(client, input);
  return {
    client,
    async upload(path, fields, file) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { accept: "application/json", cookie: client.jar.cookie },
        body: formFor(fields, file),
      });
      return { ok: response.ok, status: response.status, body: await readBody(response) };
    },
    operator: (personId, pin) =>
      identifyOperator(createFetchSeedClient({ baseUrl, jar: { cookie: client.jar.cookie } }), personId, pin),
  };
}

export async function connectDemoAppTransport(input: {
  app: AppLike;
  email: string;
  password: string;
  organizationId?: string;
}): Promise<DemoTransport> {
  const client = createAppSeedClient({ app: input.app as never });
  await login(client, input);
  return {
    client,
    async upload(path, fields, file) {
      const response = await input.app.request(path, {
        method: "POST",
        headers: { accept: "application/json", cookie: client.jar.cookie },
        body: formFor(fields, file),
      });
      return { ok: response.ok, status: response.status, body: await readBody(response) };
    },
    operator: (personId, pin) =>
      identifyOperator(
        createAppSeedClient({ app: input.app as never, jar: { cookie: client.jar.cookie } }),
        personId,
        pin,
      ),
  };
}
