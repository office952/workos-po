import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  resolveProductSystemSqlitePath,
  resolveWorkosDataDir,
} from "../src/persistence/sqlite.js";

const sentinels: string[] = [];
let previousDataDir: string | undefined;
let previousSqlitePath: string | undefined;

afterEach(() => {
  if (previousDataDir === undefined) {
    if (process.env.WORKOS_TEST_DATA_DIR) {
      process.env.WORKOS_DATA_DIR = process.env.WORKOS_TEST_DATA_DIR;
    } else {
      delete process.env.WORKOS_DATA_DIR;
    }
  } else {
    process.env.WORKOS_DATA_DIR = previousDataDir;
  }
  if (previousSqlitePath === undefined) {
    delete process.env.WORKOS_SQLITE_PATH;
  } else {
    process.env.WORKOS_SQLITE_PATH = previousSqlitePath;
  }
  for (const dir of sentinels.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("vitest ambient persistence isolation", () => {
  it("never writes to inherited DEV sqlite path or data dir", async () => {
    const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
    const sentinel = join(repoRoot, ".tmp", `sentinel-dev-${Date.now()}`);
    sentinels.push(sentinel);
    mkdirSync(sentinel, { recursive: true });
    previousDataDir = process.env.WORKOS_DATA_DIR;
    previousSqlitePath = process.env.WORKOS_SQLITE_PATH;
    const canaryPath = join(sentinel, "CANARY.txt");
    writeFileSync(canaryPath, "untouched-dev-storage");
    const sentinelSqlite = join(sentinel, "product-system.sqlite");

    process.env.WORKOS_DATA_DIR = sentinel;
    process.env.WORKOS_SQLITE_PATH = sentinelSqlite;

    expect(resolveProductSystemSqlitePath()).toBe(":memory:");
    const dataDir = resolve(resolveWorkosDataDir());
    const tmp = resolve(tmpdir());
    expect(dataDir === tmp || dataDir.startsWith(tmp + sep)).toBe(true);
    expect(dataDir).not.toBe(resolve(sentinel));

    const app = createApp();
    const createdCustomer = await app.request("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Isolation Sentinel" }),
    });
    const customer = (await createdCustomer.json()) as {
      customer: { customerId: string };
    };
    const createdRequest = await app.request("/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId: customer.customer.customerId,
        title: "Isolation",
        description: "Must not touch sentinel DEV storage.",
      }),
    });
    const request = (await createdRequest.json()) as {
      request: { requestId: string };
    };
    const form = new FormData();
    form.append(
      "file",
      new File([new TextEncoder().encode("isolation-bytes")], "iso.txt", {
        type: "text/plain",
      }),
    );
    const uploaded = await app.request(
      `/api/requests/${encodeURIComponent(request.request.requestId)}/attachments`,
      { method: "POST", body: form },
    );
    expect(uploaded.status).toBe(201);

    expect(existsSync(sentinelSqlite)).toBe(false);
    expect(existsSync(join(sentinel, "documents"))).toBe(false);
    expect(readFileSync(canaryPath, "utf8")).toBe("untouched-dev-storage");
    const leftover = existsSync(sentinel)
      ? readdirSync(sentinel)
      : [];
    expect(leftover).toEqual(["CANARY.txt"]);
  });
});
