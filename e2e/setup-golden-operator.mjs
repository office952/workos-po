const API = "http://127.0.0.1:8787";

const PIN = "246810";

const candidates = await fetch(`${API}/api/operator-candidates`, {
  headers: { Accept: "application/json" },
}).then((response) => response.json());

const candidate = Array.isArray(candidates?.candidates)
  ? candidates.candidates.find((item) => item?.pinConfigured === false) ??
    candidates.candidates[0]
  : null;

if (!candidate?.personId) {
  throw new Error("Harness operator candidate was not available.");
}

const configured = await fetch(
  `${API}/api/people/${encodeURIComponent(candidate.personId)}/operator-pin`,
  {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pin: PIN, confirmPin: PIN }),
  },
);

if (!configured.ok && configured.status !== 200) {
  const body = await configured.json().catch(() => null);
  if (body?.error !== "already_configured") {
    throw new Error(`Harness operator PIN was not configured: ${configured.status}`);
  }
}

process.stdout.write(`${candidate.personId}\n`);
process.stdout.write(`${candidate.displayName}\n`);
process.stdout.write(`${PIN}\n`);
