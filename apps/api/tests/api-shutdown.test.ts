import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startWorkosApi } from "../src/startApi.js";
import { installProcessShutdown } from "../src/serverLifecycle.js";
import { cleanupCloudTemps, createCloudFixture } from "./cloud-harness.js";

const apiRoot = fileURLToPath(new URL("..", import.meta.url));
const shutdownChild = fileURLToPath(new URL("./api-shutdown-child.ts", import.meta.url));

afterEach(() => {
  vi.restoreAllMocks();
  cleanupCloudTemps();
});

function provisionIsolatedCloudRoot(): string {
  const fixture = createCloudFixture();
  const cloudRoot = fixture.cloudRoot;
  fixture.close();
  return cloudRoot;
}

function cloudProductEnv(cloudRoot: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: "0",
    WORKOS_CLOUD_ROOT: cloudRoot,
    WORKOS_SQLITE_PATH: "",
    WORKOS_LOCAL_ROOT: "",
    WORKOS_PUBLIC_ORIGIN: "",
    ...extra,
  };
}

describe("API shutdown", () => {
  it("closes the HTTP listener before closing the runtime", async () => {
    const started = await startWorkosApi(cloudProductEnv(provisionIsolatedCloudRoot()), {
      installSignals: false,
    });
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
    const cloudRoot = provisionIsolatedCloudRoot();
    const child = spawn(process.execPath, ["--import", "tsx", shutdownChild], {
      cwd: apiRoot,
      env: {
        ...cloudProductEnv(cloudRoot),
        VITEST: "",
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
