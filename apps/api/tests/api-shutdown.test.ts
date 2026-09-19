import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startWorkosApi } from "../src/startApi.js";
import { installProcessShutdown } from "../src/serverLifecycle.js";

const temps: string[] = [];
const apiRoot = fileURLToPath(new URL("..", import.meta.url));
const shutdownChild = fileURLToPath(new URL("./api-shutdown-child.ts", import.meta.url));

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempSqlitePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "workos-api-shutdown-"));
  temps.push(dir);
  return join(dir, "product-system.sqlite");
}

describe("API shutdown", () => {
  it("closes the HTTP listener before closing the runtime", async () => {
    const sqlitePath = tempSqlitePath();
    const started = await startWorkosApi(
      {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "0",
        WORKOS_SQLITE_PATH: sqlitePath,
        WORKOS_CLOUD_ROOT: "",
      },
      { installSignals: false },
    );
    const health = await fetch(`http://127.0.0.1:${started.port}/api/health`);
    expect(health.status).toBe(200);
    await started.close();
    await expect(fetch(`http://127.0.0.1:${started.port}/api/health`)).rejects.toThrow();
  });

  it("SIGTERM closes HTTP then resources exactly once and exits", async () => {
    const order: string[] = [];
    const server = {
      close: (callback?: (error?: Error) => void) => {
        order.push("http");
        callback?.();
      },
    };
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    installProcessShutdown(server, () => {
      order.push("resources");
    });
    process.emit("SIGTERM");
    await vi.waitFor(() => {
      expect(order).toEqual(["http", "resources"]);
      expect(exit).toHaveBeenCalledWith(0);
    });
    process.emit("SIGTERM");
    expect(order).toEqual(["http", "resources"]);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("process SIGTERM closes the listener and terminates cleanly", async () => {
    const sqlitePath = tempSqlitePath();
    const child = spawn(process.execPath, ["--import", "tsx", shutdownChild], {
      cwd: apiRoot,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "0",
        WORKOS_SQLITE_PATH: sqlitePath,
        VITEST: "",
        WORKOS_CLOUD_ROOT: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const finished = await new Promise<{
      code: number | null;
      logs: string;
      port: number | null;
    }>((resolve, reject) => {
      let logs = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`shutdown child timed out: ${logs}`));
      }, 20_000);
      const onData = (chunk: Buffer) => {
        logs += chunk.toString("utf8");
      };
      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      child.once("exit", (code) => {
        clearTimeout(timer);
        const match = logs.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);
        resolve({
          code,
          logs,
          port: match ? Number(match[1]) : null,
        });
      });
    });
    expect(finished.code).toBe(0);
    expect(finished.logs).toContain("workos-final-api shutdown complete");
    expect(finished.port).toBeTypeOf("number");
    await expect(
      fetch(`http://127.0.0.1:${finished.port}/api/health`),
    ).rejects.toThrow();
  });
});
