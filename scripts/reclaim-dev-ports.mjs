import { execFileSync } from "node:child_process";

const CANONICAL_PORTS = [5173, 8787];
const UNSAFE_WINDOWS_PIDS = new Set([0, 4]);

function unique(values) {
  return [...new Set(values)];
}

function windowsListeners(port) {
  const output = execFileSync("netstat", ["-ano", "-p", "TCP"], {
    encoding: "utf8",
  });
  const pids = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.includes("LISTENING")) {
      continue;
    }
    const parts = line.trim().split(/\s+/);
    const local = parts[1] ?? "";
    const pid = Number(parts[parts.length - 1]);
    if (!local.endsWith(`:${port}`) || !Number.isInteger(pid) || pid < 0) {
      continue;
    }
    pids.push(pid);
  }
  return unique(pids);
}

function unixListeners(port) {
  try {
    const output = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8" },
    );
    return unique(
      output
        .split(/\r?\n/)
        .map((line) => Number(line.trim()))
        .filter((pid) => Number.isInteger(pid) && pid > 0),
    );
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 1) {
      return [];
    }
    throw error;
  }
}

function listeners(port) {
  return process.platform === "win32" ? windowsListeners(port) : unixListeners(port);
}

function windowsProcessName(pid) {
  const output = execFileSync(
    "tasklist",
    ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
    { encoding: "utf8" },
  ).trim();
  if (!output || output.toLowerCase().includes("no tasks")) {
    return "unknown";
  }
  const first = output.split(",")[0] ?? "";
  return first.replaceAll('"', "") || "unknown";
}

function unixProcessName(pid) {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "comm="], {
      encoding: "utf8",
    }).trim() || "unknown";
  } catch {
    return "unknown";
  }
}

function processName(pid) {
  return process.platform === "win32" ? windowsProcessName(pid) : unixProcessName(pid);
}

function terminate(pid) {
  if (process.platform === "win32") {
    if (UNSAFE_WINDOWS_PIDS.has(pid)) {
      return false;
    }
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return true;
  }
  process.kill(pid, "SIGTERM");
  return true;
}

function report(port, pid, processLabel, terminated) {
  console.log(`PORT ${port}`);
  console.log(`PID ${pid ?? "none"}`);
  console.log(`PROCESS ${processLabel}`);
  console.log(`TERMINATED ${terminated ? "yes" : "no"}`);
}

let failed = false;

for (const port of CANONICAL_PORTS) {
  const before = listeners(port);
  if (before.length === 0) {
    report(port, null, "none", false);
    continue;
  }

  for (const pid of before) {
    const name = processName(pid);
    let terminated = false;
    try {
      terminated = terminate(pid);
    } catch {
      terminated = false;
    }
    const remaining = listeners(port).includes(pid);
    if (remaining) {
      failed = true;
      report(port, pid, name, false);
      continue;
    }
    report(port, pid, name, terminated);
  }
}

if (failed) {
  process.exit(1);
}
