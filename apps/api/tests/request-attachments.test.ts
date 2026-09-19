import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_CODE,
  MAX_REQUEST_ATTACHMENT_BYTES,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import {
  resolveDocumentsRoot,
  resolveRequestAttachmentPath,
  writeRequestAttachmentBytes,
  removeRequestAttachmentFile,
} from "../src/requests/attachmentStorage.js";

type JsonObject = Record<string, unknown>;

const temps: string[] = [];
let previousDataDir: string | undefined;
let previousSqlitePath: string | undefined;

beforeEach(() => {
  previousDataDir = process.env.WORKOS_DATA_DIR;
  previousSqlitePath = process.env.WORKOS_SQLITE_PATH;
  delete process.env.WORKOS_SQLITE_PATH;
  const dir = mkdtempSync(join(tmpdir(), "workos-attachments-"));
  temps.push(dir);
  process.env.WORKOS_DATA_DIR = dir;
});

afterEach(() => {
  if (previousDataDir === undefined) {
    delete process.env.WORKOS_DATA_DIR;
  } else {
    process.env.WORKOS_DATA_DIR = previousDataDir;
  }
  if (previousSqlitePath === undefined) {
    delete process.env.WORKOS_SQLITE_PATH;
  } else {
    process.env.WORKOS_SQLITE_PATH = previousSqlitePath;
  }
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function createCustomer(app: ReturnType<typeof createApp>, displayName: string) {
  const created = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  return (await readBody(created)).customer as JsonObject;
}

async function createRequest(
  app: ReturnType<typeof createApp>,
  customerId: string,
  title: string,
) {
  const response = await app.request("/api/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customerId,
      title,
      description: "Clientul a trimis fișiere pentru ofertă.",
    }),
  });
  const body = await readBody(response);
  return body.request as JsonObject;
}

async function uploadFile(
  app: ReturnType<typeof createApp>,
  requestId: string,
  fileName: string,
  bytes: Uint8Array,
  mimeType = "application/octet-stream",
) {
  const form = new FormData();
  form.append("file", new File([bytes], fileName, { type: mimeType }));
  return app.request(`/api/requests/${encodeURIComponent(requestId)}/attachments`, {
    method: "POST",
    body: form,
  });
}

function listDocumentLeaves(): string[] {
  const root = join(resolveDocumentsRoot(), "requests");
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((name) => {
      const full = join(root, name);
      return existsSync(full) && statSync(full).isFile();
    });
}

const lettersValues = {
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

describe("request attachments documents V1", () => {
  it("lists empty attachments for a new request", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Attach Client");
    const request = await createRequest(app, String(customer.customerId), "Cerere goală");

    const list = await app.request(
      `/api/requests/${encodeURIComponent(String(request.requestId))}/attachments`,
    );
    const body = await readBody(list);
    expect(list.status).toBe(200);
    expect(body.attachments).toEqual([]);

    const detail = await readBody(
      await app.request(`/api/requests/${encodeURIComponent(String(request.requestId))}`),
    );
    const projected = detail.detail as JsonObject;
    expect(projected.attachments).toEqual([]);
    expect(projected.canUploadAttachments).toBe(true);
  });

  it("uploads, lists, downloads exact bytes with opaque storage keys", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Attach Persist");
    const request = await createRequest(app, String(customer.customerId), "Cu fișier");
    const requestId = String(request.requestId);
    const payload = new TextEncoder().encode("brief client PDF bytes");
    const expectedSha = createHash("sha256").update(payload).digest("hex");

    const uploaded = await uploadFile(
      app,
      requestId,
      "brief-client.pdf",
      payload,
      "application/pdf",
    );
    const uploadBody = await readBody(uploaded);
    expect(uploaded.status).toBe(201);
    const attachment = uploadBody.attachment as JsonObject;
    expect(attachment.originalFileName).toBe("brief-client.pdf");
    expect(attachment.sizeBytes).toBe(payload.byteLength);
    expect(String(attachment.attachmentId)).toMatch(/^att:/);
    expect(JSON.stringify(uploadBody)).not.toMatch(/[\\/]documents[\\/]/);
    expect(JSON.stringify(uploadBody)).not.toMatch(/WORKOS_DATA_DIR/);

    const list = await readBody(
      await app.request(`/api/requests/${encodeURIComponent(requestId)}/attachments`),
    );
    expect(list.attachments).toHaveLength(1);

    const download = await app.request(
      `/api/requests/${encodeURIComponent(requestId)}/attachments/${encodeURIComponent(
        String(attachment.attachmentId),
      )}/download`,
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain("attachment;");
    expect(download.headers.get("content-disposition")).toContain("brief-client.pdf");
    const downloaded = new Uint8Array(await download.arrayBuffer());
    expect(Buffer.from(downloaded).equals(Buffer.from(payload))).toBe(true);
    expect(createHash("sha256").update(downloaded).digest("hex")).toBe(expectedSha);

    const leaves = listDocumentLeaves();
    expect(leaves).toHaveLength(1);
    expect(leaves[0]).not.toContain("brief-client");
    expect(leaves[0]).not.toContain(".pdf");
  });

  it("stores path-like filenames safely with opaque keys", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Path Client");
    const request = await createRequest(app, String(customer.customerId), "Path name");
    const requestId = String(request.requestId);
    const bytes = new TextEncoder().encode("safe");
    const uploaded = await uploadFile(
      app,
      requestId,
      "../../etc/passwd\\evil.svg",
      bytes,
      "image/svg+xml",
    );
    const body = await readBody(uploaded);
    expect(uploaded.status).toBe(201);
    expect((body.attachment as JsonObject).originalFileName).toBe(
      "../../etc/passwd\\evil.svg",
    );

    const leaves = listDocumentLeaves();
    expect(leaves).toHaveLength(1);
    expect(leaves[0]).not.toContain("passwd");
    expect(leaves[0]).not.toContain("..");
    expect(leaves[0]).not.toContain(".svg");
  });

  it("rejects missing request and cross-request download", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Cross Client");
    const first = await createRequest(app, String(customer.customerId), "A");
    const second = await createRequest(app, String(customer.customerId), "B");
    const bytes = new TextEncoder().encode("owned-by-a");
    const uploaded = await readBody(
      await uploadFile(app, String(first.requestId), "a.txt", bytes, "text/plain"),
    );
    const attachmentId = String((uploaded.attachment as JsonObject).attachmentId);

    const missing = await app.request("/api/requests/crq:missing/attachments");
    expect(missing.status).toBe(404);

    const cross = await app.request(
      `/api/requests/${encodeURIComponent(String(second.requestId))}/attachments/${encodeURIComponent(
        attachmentId,
      )}/download`,
    );
    expect(cross.status).toBe(404);
    expect((await readBody(cross)).error).toBe("not_found");
  });

  it("rejects oversized uploads without metadata or orphan files", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Oversize Client");
    const request = await createRequest(app, String(customer.customerId), "Oversize");
    const requestId = String(request.requestId);
    const before = listDocumentLeaves();
    const huge = new Uint8Array(MAX_REQUEST_ATTACHMENT_BYTES + 1);
    huge.fill(7);

    const uploaded = await uploadFile(app, requestId, "huge.bin", huge);
    expect(uploaded.status).toBe(413);
    expect((await readBody(uploaded)).error).toBe("file_too_large");

    const list = await readBody(
      await app.request(`/api/requests/${encodeURIComponent(requestId)}/attachments`),
    );
    expect(list.attachments).toEqual([]);
    expect(listDocumentLeaves()).toEqual(before);
  });

  it("allows download on cancelled request but blocks new uploads", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Cancel Client");
    const request = await createRequest(app, String(customer.customerId), "Cancel");
    const requestId = String(request.requestId);
    const bytes = new TextEncoder().encode("keep-me");
    const uploaded = await readBody(
      await uploadFile(app, requestId, "keep.txt", bytes, "text/plain"),
    );
    const attachmentId = String((uploaded.attachment as JsonObject).attachmentId);

    const cancelled = await app.request(`/api/requests/${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    expect(cancelled.status).toBe(200);

    const download = await app.request(
      `/api/requests/${encodeURIComponent(requestId)}/attachments/${encodeURIComponent(
        attachmentId,
      )}/download`,
    );
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer()).toString("utf8")).toBe("keep-me");

    const blocked = await uploadFile(
      app,
      requestId,
      "late.txt",
      new TextEncoder().encode("nope"),
      "text/plain",
    );
    expect(blocked.status).toBe(400);
    expect((await readBody(blocked)).error).toBe("request_cancelled");

    const detail = (
      await readBody(await app.request(`/api/requests/${encodeURIComponent(requestId)}`))
    ).detail as JsonObject;
    expect(detail.canUploadAttachments).toBe(false);
    expect(detail.attachments).toHaveLength(1);
  });

  it("returns file_missing honestly when physical bytes disappear", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Missing Bytes");
    const request = await createRequest(app, String(customer.customerId), "Missing");
    const requestId = String(request.requestId);
    const uploaded = await readBody(
      await uploadFile(
        app,
        requestId,
        "gone.txt",
        new TextEncoder().encode("gone"),
        "text/plain",
      ),
    );
    const attachmentId = String((uploaded.attachment as JsonObject).attachmentId);
    const leaves = listDocumentLeaves();
    expect(leaves).toHaveLength(1);
    const storageKey = leaves[0]!.split(/[\\/]/).at(-1)!;
    rmSync(resolveRequestAttachmentPath(requestId, storageKey), { force: true });

    const download = await app.request(
      `/api/requests/${encodeURIComponent(requestId)}/attachments/${encodeURIComponent(
        attachmentId,
      )}/download`,
    );
    expect(download.status).toBe(404);
    expect((await readBody(download)).error).toBe("file_missing");

    const list = await readBody(
      await app.request(`/api/requests/${encodeURIComponent(requestId)}/attachments`),
    );
    expect(list.attachments).toHaveLength(1);
  });

  it("rejects download when stored bytes no longer match sha256", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Corrupt Client");
    const request = await createRequest(app, String(customer.customerId), "Corrupt");
    const requestId = String(request.requestId);
    const original = new TextEncoder().encode("integrity-original");
    const uploaded = await readBody(
      await uploadFile(app, requestId, "integrity.txt", original, "text/plain"),
    );
    const attachmentId = String((uploaded.attachment as JsonObject).attachmentId);
    const leaves = listDocumentLeaves();
    expect(leaves).toHaveLength(1);
    const storageKey = leaves[0]!.split(/[\\/]/).at(-1)!;
    writeFileSync(
      resolveRequestAttachmentPath(requestId, storageKey),
      new TextEncoder().encode("tampered-bytes"),
    );

    const download = await app.request(
      `/api/requests/${encodeURIComponent(requestId)}/attachments/${encodeURIComponent(
        attachmentId,
      )}/download`,
    );
    expect(download.status).toBe(409);
    expect((await readBody(download)).error).toBe("file_corrupt");

    const list = await readBody(
      await app.request(`/api/requests/${encodeURIComponent(requestId)}/attachments`),
    );
    expect(list.attachments).toHaveLength(1);
    expect((list.attachments as JsonObject[])[0]?.originalFileName).toBe("integrity.txt");

    const detail = (
      await readBody(await app.request(`/api/requests/${encodeURIComponent(requestId)}`))
    ).detail as JsonObject;
    expect(detail.request).toMatchObject({ requestId, title: "Corrupt" });
  });

  it("accepts a file of exactly 50 MiB despite multipart envelope", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Exact Limit");
    const request = await createRequest(app, String(customer.customerId), "Exact");
    const requestId = String(request.requestId);
    const exact = new Uint8Array(MAX_REQUEST_ATTACHMENT_BYTES);
    exact.fill(3);

    const uploaded = await uploadFile(app, requestId, "exact.bin", exact);
    expect(uploaded.status).toBe(201);
    const body = await readBody(uploaded);
    expect((body.attachment as JsonObject).sizeBytes).toBe(MAX_REQUEST_ATTACHMENT_BYTES);

    const download = await app.request(
      `/api/requests/${encodeURIComponent(requestId)}/attachments/${encodeURIComponent(
        String((body.attachment as JsonObject).attachmentId),
      )}/download`,
    );
    expect(download.status).toBe(200);
    expect((await download.arrayBuffer()).byteLength).toBe(MAX_REQUEST_ATTACHMENT_BYTES);
  }, 30_000);

  it("binds documents root for the lifetime of one runtime", async () => {
    const bound = mkdtempSync(join(tmpdir(), "workos-bound-docs-"));
    const drifted = mkdtempSync(join(tmpdir(), "workos-drift-docs-"));
    temps.push(bound, drifted);
    process.env.WORKOS_DATA_DIR = bound;
    const runtime = createProductSystemRuntime(join(bound, "product-system.sqlite"));
    expect(runtime.documentsRoot).toBe(join(bound, "documents"));

    process.env.WORKOS_DATA_DIR = drifted;
    const customer = runtime.createCustomer("Stable Root");
    expect(customer.ok).toBe(true);
    if (!customer.ok) {
      runtime.close();
      return;
    }
    const created = runtime.createCommercialRequest(
      customer.customer.customerId,
      "Stable",
      "Root remains bound.",
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      runtime.close();
      return;
    }
    const uploaded = runtime.createRequestAttachment(created.request.requestId, {
      originalFileName: "bound.txt",
      mimeType: "text/plain",
      bytes: new TextEncoder().encode("bound-bytes"),
    });
    expect(uploaded.ok).toBe(true);
    expect(existsSync(join(drifted, "documents"))).toBe(false);
    expect(existsSync(join(bound, "documents", "requests"))).toBe(true);
    runtime.close();
  });

  it("does not mutate quote contentHash when attaching after freeze", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Freeze Client");
    const request = await createRequest(app, String(customer.customerId), "Freeze");
    const requestId = String(request.requestId);
    const customerId = String(customer.customerId);

    await uploadFile(
      app,
      requestId,
      "before-freeze.txt",
      new TextEncoder().encode("before"),
      "text/plain",
    );

    const compiled = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        values: {
          ...lettersValues,
          "root.inscription": "ATTACH",
        },
      }),
    });
    const compiledBody = await readBody(compiled);
    const frozen = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: compiledBody.definition,
          reviewId: compiledBody.reviewId,
          customerId,
          requestId,
        }),
      },
    );
    expect(frozen.status).toBe(200);
    const quote = (await readBody(frozen)).quoteSnapshot as JsonObject;
    const contentHash = String(quote.contentHash);
    const quoteSnapshotId = String(quote.quoteSnapshotId);

    await uploadFile(
      app,
      requestId,
      "after-freeze.txt",
      new TextEncoder().encode("after"),
      "text/plain",
    );

    const reread = await readBody(
      await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent(
          quoteSnapshotId,
        )}`,
      ),
    );
    expect((reread.quoteSnapshot as JsonObject).contentHash).toBe(contentHash);

    const detail = (
      await readBody(await app.request(`/api/requests/${encodeURIComponent(requestId)}`))
    ).detail as JsonObject;
    expect(detail.attachments).toHaveLength(2);
    expect(JSON.stringify(quote)).not.toContain("attachment");
    expect(JSON.stringify(quote)).not.toContain("before-freeze");
  });

  it("stores SVG as opaque bytes without product truth side effects", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Svg Client");
    const request = await createRequest(app, String(customer.customerId), "SVG");
    const requestId = String(request.requestId);
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
    );
    const uploaded = await uploadFile(app, requestId, "sample.svg", svg, "image/svg+xml");
    expect(uploaded.status).toBe(201);

    const catalog = await readBody(await app.request("/api/products/catalog"));
    expect(JSON.stringify(catalog)).not.toContain("sample.svg");

    const compile = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        values: {
          ...lettersValues,
          "root.inscription": "SVGOPAQUE",
        },
      }),
    });
    expect(compile.status).toBe(200);
    const compiled = await readBody(compile);
    expect(JSON.stringify(compiled)).not.toContain("sample.svg");
    expect(JSON.stringify(compiled)).not.toContain("attachment");
  });

  it("removes written bytes when metadata persistence is aborted", () => {
    const written = writeRequestAttachmentBytes({
      requestId: "crq:cleanup-test",
      bytes: new TextEncoder().encode("orphan-candidate"),
    });
    expect(existsSync(written.absolutePath)).toBe(true);
    removeRequestAttachmentFile("crq:cleanup-test", written.storageKey);
    expect(existsSync(written.absolutePath)).toBe(false);
  });

  it("lists multiple attachments newest first", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Multi Client");
    const request = await createRequest(app, String(customer.customerId), "Multi");
    const requestId = String(request.requestId);

    await uploadFile(
      app,
      requestId,
      "first.txt",
      new TextEncoder().encode("one"),
      "text/plain",
    );
    await uploadFile(
      app,
      requestId,
      "second.txt",
      new TextEncoder().encode("two"),
      "text/plain",
    );
    await uploadFile(
      app,
      requestId,
      "third-with-a-very-long-realistic-client-filename-that-should-not-break-layout-or-storage.txt",
      new TextEncoder().encode("three"),
      "text/plain",
    );

    const list = await readBody(
      await app.request(`/api/requests/${encodeURIComponent(requestId)}/attachments`),
    );
    const names = (list.attachments as JsonObject[]).map((item) => item.originalFileName);
    expect(names[0]).toContain("third-with-a-very-long");
    expect(names).toHaveLength(3);
  });
});
