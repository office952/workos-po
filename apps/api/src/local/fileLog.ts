import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";

let attached = false;

export function attachLocalRuntimeFileLog(env: NodeJS.ProcessEnv = process.env): void {
  if (attached) {
    return;
  }
  const root = env.WORKOS_LOCAL_ROOT?.trim();
  if (!root) {
    return;
  }
  const logsRoot = join(root, "logs");
  mkdirSync(logsRoot, { recursive: true });
  const stream = createWriteStream(join(logsRoot, "runtime.log"), { flags: "a" });
  const write = (level: string, args: unknown[]) => {
    const text = args
      .map((value) => (typeof value === "string" ? value : safeText(value)))
      .join(" ");
    stream.write(`${new Date().toISOString()} ${level} ${text}\n`);
  };
  const originalLog = console.log.bind(console);
  const originalError = console.error.bind(console);
  console.log = (...args: unknown[]) => {
    originalLog(...args);
    write("info", args);
  };
  console.error = (...args: unknown[]) => {
    originalError(...args);
    write("error", args);
  };
  attached = true;
}

function safeText(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "[value]";
}
