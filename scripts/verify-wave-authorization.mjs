#!/usr/bin/env node
// WorkOS Governance V2: verifies an Owner-signed wave authorization read only from the protected base ref.
// It never calls Notion and never grants merge, deploy or real-system authority.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const V2_CONTRACT_PATH = "docs/governance/NOTION_JOURNAL_GATE_V2.md";
export const AUTHORIZATION_DIR = "docs/governance/authorizations/";
export const ALLOWED_SIGNERS_PATH = `${AUTHORIZATION_DIR}owner_allowed_signers`;
export const REVOCATIONS_PATH = `${AUTHORIZATION_DIR}revocations.json`;
export const SYNC_LEDGER_DIR = "docs/governance/journal/";
export const SIGNATURE_NAMESPACE = "workos-wave-authorization";
export const MANIFEST_SCHEMA = "workos.wave-authorization/v1";
export const REVOCATIONS_SCHEMA = "workos.wave-revocations/v1";
export const MAX_VALIDITY_DAYS = 30;

export const DELEGABLE_ACTIONS = Object.freeze([
  "IMPLEMENT",
  "TEST",
  "COMMIT",
  "PUSH",
  "PR_CREATE",
  "NOTION_JOURNAL_WRITE",
]);
export const NON_DELEGABLE_ACTIONS = Object.freeze([
  "MERGE",
  "DEPLOY",
  "REAL_CLOUD_ACCESS",
  "REAL_CLOUD_WRITE",
  "REAL_DB_WRITE",
  "DB_MIGRATION",
  "GITHUB_RULESET_MUTATION",
  "PERMISSION_EXPANSION",
]);
export const SYNC_STATES = Object.freeze([
  "SYNC_CONFIRMED",
  "SYNC_PENDING",
  "SYNC_FAILED",
  "SCOPE_CONFLICT",
]);

const RECORD_ID = /^[HNR]-[0-9]{3,}$/;
const EVIDENCE_ID = /^[A-Z]{2,}(-[A-Z0-9]+)*-[0-9]{3,}$/;
const NOTION_URL = /^https:\/\/app\.notion\.com\/p\/[0-9a-f]{32}$/i;
const PRINCIPAL = /^[A-Za-z0-9._@+-]{3,128}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
export const AUTHORIZATION_MODES = Object.freeze(["V1", "V2"]);
// Conflict clearance is authority: it may only come from a newer Owner-signed manifest, never from the ledger.
const LEDGER_AUTHORITY_KEYS = [
  "authorizedActions",
  "prohibitedActions",
  "approver",
  "scope",
  "ownerGo",
  "validUntil",
  "authorization",
  "revision",
  "resolvedByRevision",
  "resolvesConflicts",
  "resolved",
];
const DAY_MS = 24 * 60 * 60 * 1000;

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function git(cwd, args) {
  return spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

export function resolveCommit(cwd, ref) {
  const r = git(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  return r.status === 0 ? r.stdout.trim() : null;
}

export function readAtRef(cwd, ref, path) {
  const r = git(cwd, ["show", `${ref}:${path}`]);
  return r.status === 0 ? normalize(r.stdout) : null;
}

export function changedPaths(cwd, base, head) {
  const r = git(cwd, ["diff", "--name-only", "--no-renames", `${base}...${head}`]);
  if (r.status !== 0) return null;
  return r.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function isV2Active(cwd, baseSha) {
  return readAtRef(cwd, baseSha, V2_CONTRACT_PATH) !== null;
}

export function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        i++;
        source += "(?:.*/)?";
      } else {
        source += ".*";
      }
    } else if (c === "*") {
      source += "[^/]*";
    } else if (c === "?") {
      source += "[^/]";
    } else {
      source += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

function isIsoInstant(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

function isNonEmptyText(value, min = 1) {
  return typeof value === "string" && value.trim().length >= min;
}

export function signerPrincipals(allowedSignersText) {
  return normalize(allowedSignersText ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(/\s+/)[0]);
}

export function validateManifest(manifest, expectedRecordId) {
  const reasons = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return ["manifest is not a JSON object."];
  }
  if (manifest.schema !== MANIFEST_SCHEMA) reasons.push(`manifest schema must be ${MANIFEST_SCHEMA}.`);
  if (manifest.recordId !== expectedRecordId) {
    reasons.push(`manifest recordId ${String(manifest.recordId)} does not match ${expectedRecordId}.`);
  }
  if (!NOTION_URL.test(manifest.notionRecordUrl ?? "")) {
    reasons.push("notionRecordUrl must be an exact app.notion.com/p/<32-hex> page URL.");
  }
  const go = manifest.ownerGo;
  if (!go || !EVIDENCE_ID.test(go.recordId ?? "") || !NOTION_URL.test(go.url ?? "")) {
    reasons.push("ownerGo must reference the Owner decision record ID and its exact Notion URL.");
  }
  if (!Number.isInteger(manifest.revision) || manifest.revision < 1) {
    reasons.push("revision must be a positive integer.");
  }
  if (!isNonEmptyText(manifest.objective, 12)) reasons.push("objective must describe the approved wave.");
  if (!REPOSITORY.test(manifest.repository ?? "")) reasons.push("repository must be <owner>/<name>.");
  if (!isNonEmptyText(manifest.branch) || /[*?\s]/.test(manifest.branch)) {
    reasons.push("branch must be one exact branch name.");
  }
  const paths = manifest.scope?.paths;
  if (!Array.isArray(paths) || paths.length === 0) {
    reasons.push("scope.paths must list the approved repository paths.");
  } else {
    for (const pattern of paths) {
      if (
        typeof pattern !== "string" ||
        !pattern ||
        pattern.startsWith("*") ||
        pattern.startsWith("/") ||
        pattern.split("/").includes("..")
      ) {
        reasons.push(`scope path ${JSON.stringify(pattern)} is not a bounded repository path.`);
      } else if (pattern.startsWith(AUTHORIZATION_DIR)) {
        reasons.push("scope may never include the authorization directory.");
      }
    }
  }
  const authorized = manifest.authorizedActions;
  if (!Array.isArray(authorized) || authorized.length === 0) {
    reasons.push("authorizedActions must list the delegated engineering actions.");
  } else {
    for (const action of authorized) {
      if (NON_DELEGABLE_ACTIONS.includes(action)) {
        reasons.push(`${action} can never be delegated through a wave authorization.`);
      } else if (!DELEGABLE_ACTIONS.includes(action)) {
        reasons.push(`unknown authorized action ${JSON.stringify(action)}.`);
      }
    }
  }
  const prohibited = manifest.prohibitedActions;
  if (!Array.isArray(prohibited) || NON_DELEGABLE_ACTIONS.some((action) => !prohibited.includes(action))) {
    reasons.push(`prohibitedActions must explicitly include ${NON_DELEGABLE_ACTIONS.join(", ")}.`);
  }
  const approver = manifest.approver;
  if (
    !approver ||
    !isNonEmptyText(approver.name, 2) ||
    !isNonEmptyText(approver.github, 1) ||
    !PRINCIPAL.test(approver.principal ?? "")
  ) {
    reasons.push("approver must provide Owner name, GitHub login and signing principal.");
  }
  if (!isIsoInstant(manifest.approvedAt) || !isIsoInstant(manifest.validUntil)) {
    reasons.push("approvedAt and validUntil must be ISO-8601 instants.");
  } else {
    const span = Date.parse(manifest.validUntil) - Date.parse(manifest.approvedAt);
    if (span <= 0 || span > MAX_VALIDITY_DAYS * DAY_MS) {
      reasons.push(`validity window must be positive and at most ${MAX_VALIDITY_DAYS} days.`);
    }
  }
  if (!Array.isArray(manifest.evidence) || manifest.evidence.length === 0) {
    reasons.push("evidence must link at least the Owner decision record.");
  }
  if (manifest.resolvesConflicts !== undefined) {
    const resolves = manifest.resolvesConflicts;
    if (
      !Array.isArray(resolves) ||
      resolves.length === 0 ||
      resolves.some((item) => !Number.isInteger(item?.seq) || item.seq < 1 || !SHA256_HEX.test(item?.sha256 ?? ""))
    ) {
      reasons.push("resolvesConflicts must list {seq, sha256} of the exact SCOPE_CONFLICT ledger lines.");
    } else if (!Number.isInteger(manifest.revision) || manifest.revision < 2) {
      reasons.push("resolvesConflicts requires a superseding revision; revision 1 has no earlier conflict to resolve.");
    }
  }
  return reasons;
}

export function ledgerLineHash(line) {
  return createHash("sha256").update(normalize(line), "utf8").digest("hex");
}

export function verifyOwnerSignature({ manifestText, signatureText, allowedSignersText, principal }) {
  if (!PRINCIPAL.test(principal ?? "")) return { ok: false, detail: "invalid signing principal." };
  const folder = mkdtempSync(join(tmpdir(), "workos-wave-auth-"));
  try {
    const signers = join(folder, "allowed_signers");
    const signature = join(folder, "manifest.sig");
    writeFileSync(signers, normalize(allowedSignersText));
    writeFileSync(signature, normalize(signatureText));
    const r = spawnSync(
      "ssh-keygen",
      ["-Y", "verify", "-f", signers, "-I", principal, "-n", SIGNATURE_NAMESPACE, "-s", signature],
      { input: normalize(manifestText), encoding: "utf8" },
    );
    if (r.error) return { ok: false, detail: "ssh-keygen is unavailable; cannot verify Owner signature." };
    return { ok: r.status === 0, detail: `${r.stdout}${r.stderr}`.trim() };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

export function parseRevocations(text) {
  if (text === null) return { entries: [], error: null };
  try {
    const parsed = JSON.parse(text);
    if (parsed?.schema !== REVOCATIONS_SCHEMA || !Array.isArray(parsed.revocations)) {
      return { entries: [], error: "revocations file has an invalid schema." };
    }
    for (const entry of parsed.revocations) {
      if (
        !RECORD_ID.test(entry?.recordId ?? "") ||
        !(entry.revision === "ALL" || (Number.isInteger(entry.revision) && entry.revision >= 1)) ||
        !isIsoInstant(entry.at) ||
        !isNonEmptyText(entry.reason, 3)
      ) {
        return { entries: [], error: "revocations file contains a malformed entry." };
      }
    }
    return { entries: parsed.revocations, error: null };
  } catch {
    return { entries: [], error: "revocations file is not valid JSON." };
  }
}

function isRevoked(entries, recordId, revision) {
  return entries.find(
    (entry) => entry.recordId === recordId && (entry.revision === "ALL" || entry.revision === revision),
  );
}

export function ledgerPath(recordId) {
  return `${SYNC_LEDGER_DIR}${recordId}.sync.jsonl`;
}

function parseLedgerLines(text) {
  return normalize(text ?? "")
    .split("\n")
    .filter((line) => line.trim());
}

// A SCOPE_CONFLICT is cleared only by the Owner-signed manifest in force: a superseding revision, approved
// after the conflict was raised, that names the exact ledger line (seq + SHA-256). Ledger content never clears it.
function isConflictResolved(entry, line, authorization) {
  const resolves = authorization?.resolvesConflicts;
  if (!Array.isArray(resolves) || !Number.isInteger(authorization.revision) || authorization.revision < 2) return false;
  if (!isIsoInstant(entry.at) || !isIsoInstant(authorization.approvedAt)) return false;
  if (Date.parse(entry.at) >= Date.parse(authorization.approvedAt)) return false;
  const hash = ledgerLineHash(line);
  return resolves.some((item) => item?.seq === entry.seq && item?.sha256 === hash);
}

// The ledger is an append-only chronology. It records journal synchronization; it never carries authority.
export function evaluateSyncLedger({ baseText, headText, authorization }) {
  const errors = [];
  const baseLines = parseLedgerLines(baseText);
  const headLines = parseLedgerLines(headText);
  if (baseLines.some((line, index) => headLines[index] !== line)) {
    errors.push("sync ledger history was rewritten; entries are append-only.");
  }
  const entries = [];
  const conflicts = [];
  headLines.forEach((line, index) => {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      errors.push(`sync ledger line ${index + 1} is not JSON.`);
      return;
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`sync ledger line ${index + 1} is not a JSON object.`);
      return;
    }
    if (entry.seq !== index + 1) errors.push(`sync ledger entry ${index + 1} has seq ${entry.seq}.`);
    if (!SYNC_STATES.includes(entry.state)) errors.push(`sync ledger entry ${index + 1} has unknown state.`);
    if (!isIsoInstant(entry.at)) errors.push(`sync ledger entry ${index + 1} needs an ISO timestamp.`);
    if (!isNonEmptyText(entry.event, 3)) errors.push(`sync ledger entry ${index + 1} needs an event.`);
    if (entry.state === "SYNC_CONFIRMED" && !NOTION_URL.test(entry.notionUrl ?? "")) {
      errors.push(`sync ledger entry ${index + 1} claims SYNC_CONFIRMED without the Notion journal URL.`);
    }
    for (const key of LEDGER_AUTHORITY_KEYS) {
      if (key in entry) errors.push(`sync ledger entry ${index + 1} carries authority field ${key}.`);
    }
    const previous = entries.at(-1);
    if (previous && isIsoInstant(previous.at) && isIsoInstant(entry.at) && Date.parse(entry.at) < Date.parse(previous.at)) {
      errors.push(`sync ledger entry ${index + 1} is out of chronological order.`);
    }
    entries.push(entry);
    if (entry.state === "SCOPE_CONFLICT" && !isConflictResolved(entry, line, authorization)) {
      conflicts.push(entry.seq ?? index + 1);
    }
  });
  // An unresolved conflict dominates: malformed or forged lines must never make it look cleared.
  if (conflicts.length) return { state: "SCOPE_CONFLICT", errors, unreconciled: conflicts };
  if (errors.length) return { state: "SYNC_FAILED", errors, unreconciled: [] };

  const reconciled = new Set(
    entries.filter((entry) => entry.state === "SYNC_CONFIRMED" && Number.isInteger(entry.reconciles)).map((entry) => entry.reconciles),
  );
  const open = entries.filter((entry) => entry.state !== "SYNC_CONFIRMED" && !reconciled.has(entry.seq));
  if (entries.length === 0) return { state: "SYNC_PENDING", errors, unreconciled: [] };
  if (open.some((entry) => entry.state === "SYNC_FAILED")) {
    return { state: "SYNC_FAILED", errors, unreconciled: open.map((entry) => entry.seq) };
  }
  if (open.length) return { state: "SYNC_PENDING", errors, unreconciled: open.map((entry) => entry.seq) };
  return { state: "SYNC_CONFIRMED", errors, unreconciled: [] };
}

function stop(reasons, extra = {}) {
  return { gate: "STOP", reasons, ...extra };
}

export function evaluateWaveAuthorization({ cwd, baseRef, headRef, recordId, action, repository, branch, now = new Date() }) {
  const baseSha = resolveCommit(cwd, baseRef);
  const headSha = resolveCommit(cwd, headRef);
  if (!baseSha || !headSha) return stop([`cannot resolve base ${baseRef} or head ${headRef}.`]);
  if (!isV2Active(cwd, baseSha)) {
    return stop(["V2_ACTIVE=NO on the protected base; the V1 live Notion gate applies."], { v2Active: false, baseSha });
  }
  const context = { v2Active: true, baseSha, headSha, recordId, action };
  if (NON_DELEGABLE_ACTIONS.includes(action)) {
    return stop([`${action} is never delegated by V2; it requires a separate, live Owner decision.`], context);
  }
  if (!DELEGABLE_ACTIONS.includes(action)) return stop([`unknown action ${JSON.stringify(action)}.`], context);
  if (!RECORD_ID.test(recordId ?? "")) return stop(["record ID must be a stable H-/N-/R- code."], context);

  const manifestPath = `${AUTHORIZATION_DIR}${recordId}.json`;
  const manifestText = readAtRef(cwd, baseSha, manifestPath);
  if (manifestText === null) {
    return stop(
      [`no Owner authorization for ${recordId} on the protected base; a manifest in the candidate branch is never trusted.`],
      context,
    );
  }
  const signatureText = readAtRef(cwd, baseSha, `${manifestPath}.sig`);
  if (signatureText === null) return stop([`authorization ${recordId} has no Owner signature on the protected base.`], context);
  const allowedSignersText = readAtRef(cwd, baseSha, ALLOWED_SIGNERS_PATH);
  if (!allowedSignersText || signerPrincipals(allowedSignersText).length === 0) {
    return stop(["no Owner signing key is registered on the protected base."], context);
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    return stop([`authorization ${recordId} is not valid JSON.`], context);
  }
  const invalid = validateManifest(manifest, recordId);
  if (invalid.length) return stop(invalid, context);
  const revision = manifest.revision;
  const principal = manifest.approver.principal;
  if (!signerPrincipals(allowedSignersText).includes(principal)) {
    return stop([`approver principal ${principal} is not a registered Owner signer.`], { ...context, revision });
  }
  const signature = verifyOwnerSignature({ manifestText, signatureText, allowedSignersText, principal });
  if (!signature.ok) {
    return stop(
      [`Owner signature did not verify: the manifest is unsigned, altered or signed by another key. ${signature.detail}`],
      { ...context, revision },
    );
  }

  const reasons = [];
  if (manifest.repository !== repository) {
    reasons.push(`repository ${repository} does not match authorized ${manifest.repository}.`);
  }
  if (manifest.branch !== branch) reasons.push(`branch ${branch} does not match authorized ${manifest.branch}.`);
  if (!manifest.authorizedActions.includes(action)) reasons.push(`${action} is not authorized for ${recordId}.`);
  const nowMs = now.getTime();
  if (nowMs < Date.parse(manifest.approvedAt)) reasons.push("authorization is not yet valid.");
  if (nowMs >= Date.parse(manifest.validUntil)) reasons.push(`authorization expired at ${manifest.validUntil}.`);

  for (const ref of [baseSha, headSha]) {
    const { entries, error } = parseRevocations(readAtRef(cwd, ref, REVOCATIONS_PATH));
    if (error) reasons.push(`${error} (fail-closed)`);
    const revoked = isRevoked(entries, recordId, revision);
    if (revoked) reasons.push(`authorization ${recordId} revision ${revision} is revoked: ${revoked.reason}`);
  }

  const changed = changedPaths(cwd, baseSha, headSha);
  if (changed === null) {
    reasons.push("cannot compute candidate changes against the protected base.");
  } else {
    const patterns = manifest.scope.paths.map(globToRegExp);
    const ownLedger = ledgerPath(recordId);
    for (const path of changed) {
      if (path.startsWith(AUTHORIZATION_DIR)) {
        reasons.push(`self-approval refused: the candidate changes authorization state (${path}).`);
      } else if (path !== ownLedger && !patterns.some((pattern) => pattern.test(path))) {
        reasons.push(`SCOPE_CONFLICT: ${path} is outside the approved scope.`);
      }
    }
  }

  const ledger = evaluateSyncLedger({
    baseText: readAtRef(cwd, baseSha, ledgerPath(recordId)),
    headText: readAtRef(cwd, headSha, ledgerPath(recordId)),
    authorization: manifest,
  });
  reasons.push(...ledger.errors);
  if (ledger.state === "SCOPE_CONFLICT") {
    reasons.push(
      `SCOPE_CONFLICT recorded in the sync ledger (seq ${ledger.unreconciled.join(", ")}); only a newer Owner-signed revision listing it in resolvesConflicts can clear it.`,
    );
  }

  const result = {
    ...context,
    revision,
    principal,
    changedCount: changed?.length ?? 0,
    syncState: ledger.state,
    unreconciled: ledger.unreconciled,
  };
  return reasons.length ? stop(reasons, result) : { gate: "PASS", reasons: [], ...result };
}

// Guards PRs that touch authorization state. Only an Owner signature verified against base signers can add authority.
export function evaluateAuthorizationChanges({ cwd, baseRef, headRef, now = new Date() }) {
  const baseSha = resolveCommit(cwd, baseRef);
  const headSha = resolveCommit(cwd, headRef);
  if (!baseSha || !headSha) return stop([`cannot resolve base ${baseRef} or head ${headRef}.`]);
  const changed = changedPaths(cwd, baseSha, headSha);
  if (changed === null) return stop(["cannot compute candidate changes against the protected base."]);
  const touched = changed.filter((path) => path.startsWith(AUTHORIZATION_DIR));
  if (touched.length === 0) return { gate: "PASS", reasons: [], touched };

  const reasons = [];
  if (touched.length !== changed.length) {
    reasons.push("authorization changes must be isolated in a dedicated Owner PR, without implementation changes.");
  }
  const allowedSignersText = readAtRef(cwd, baseSha, ALLOWED_SIGNERS_PATH) ?? "";
  for (const path of touched) {
    const name = path.slice(AUTHORIZATION_DIR.length);
    if (path === ALLOWED_SIGNERS_PATH) {
      reasons.push("Owner signer-set changes cannot pass CI; they require the Owner's own explicit decision outside the agent path.");
    } else if (path === REVOCATIONS_PATH) {
      const base = parseRevocations(readAtRef(cwd, baseSha, path));
      const head = parseRevocations(readAtRef(cwd, headSha, path));
      if (head.error) reasons.push(head.error);
      const headKeys = new Set(head.entries.map((entry) => JSON.stringify(entry)));
      if (base.entries.some((entry) => !headKeys.has(JSON.stringify(entry)))) {
        reasons.push("revocations are append-only; removing a revocation would restore authority.");
      }
    } else if (name === "README.md") {
      continue;
    } else {
      const match = /^([HNR]-[0-9]{3,})\.json(\.sig)?$/.exec(name);
      if (!match) {
        reasons.push(`unexpected file in authorization directory: ${path}.`);
        continue;
      }
      const recordId = match[1];
      const manifestPath = `${AUTHORIZATION_DIR}${recordId}.json`;
      const manifestText = readAtRef(cwd, headSha, manifestPath);
      const signatureText = readAtRef(cwd, headSha, `${manifestPath}.sig`);
      const previous = readAtRef(cwd, baseSha, manifestPath);
      if (manifestText === null && signatureText === null) {
        if (previous !== null) {
          reasons.push(
            `${recordId}: authorizations are never deleted; append a revocation instead (deletion would allow replaying an older revision).`,
          );
        }
        continue;
      }
      if (manifestText === null || signatureText === null) {
        reasons.push(`${recordId}: manifest and signature must be added or removed together.`);
        continue;
      }
      let manifest;
      try {
        manifest = JSON.parse(manifestText);
      } catch {
        reasons.push(`${recordId}: manifest is not valid JSON.`);
        continue;
      }
      const invalid = validateManifest(manifest, recordId);
      if (invalid.length) {
        reasons.push(...invalid.map((reason) => `${recordId}: ${reason}`));
        continue;
      }
      if (now.getTime() >= Date.parse(manifest.validUntil)) reasons.push(`${recordId}: authorization is already expired.`);
      const principal = manifest.approver.principal;
      const signature = verifyOwnerSignature({ manifestText, signatureText, allowedSignersText, principal });
      if (!signerPrincipals(allowedSignersText).includes(principal) || !signature.ok) {
        reasons.push(`${recordId}: not signed by a registered Owner key on the protected base.`);
      }
      if (previous !== null) {
        try {
          if (manifest.revision <= JSON.parse(previous).revision) {
            reasons.push(`${recordId}: a superseding authorization must increase the revision.`);
          }
        } catch {
          reasons.push(`${recordId}: previous authorization on base is unreadable.`);
        }
      } else if (manifest.resolvesConflicts !== undefined) {
        reasons.push(`${recordId}: resolvesConflicts must supersede an existing Owner authorization on the protected base.`);
      }
    }
  }
  return reasons.length ? stop(reasons, { touched }) : { gate: "PASS", reasons: [], touched };
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    options[token.slice(2)] = argv[i + 1];
    i++;
  }
  return options;
}

function prFieldValues(body, key) {
  return normalize(body)
    .split("\n")
    .filter((line) => line.trimStart().toLowerCase().startsWith(`${key.toLowerCase()}:`))
    .map((line) => line.trimStart().slice(key.length + 1).trim());
}

function prField(body, key) {
  const values = prFieldValues(body, key);
  return values.length === 1 ? values[0] : null;
}

// Exactly one `Authorization Mode:` line whose value is exactly V1 or V2. Nothing defaults to V1.
export function parseAuthorizationMode(body) {
  const values = prFieldValues(typeof body === "string" ? body : "", "Authorization Mode");
  if (values.length === 0) return { mode: null, error: "Authorization Mode is missing; declare exactly `Authorization Mode: V1` or `V2`." };
  if (values.length > 1) return { mode: null, error: "Authorization Mode is declared more than once." };
  if (!AUTHORIZATION_MODES.includes(values[0])) {
    return { mode: null, error: `Authorization Mode ${JSON.stringify(values[0])} is not exactly V1 or V2.` };
  }
  return { mode: values[0], error: null };
}

function reportManualV1(reason) {
  console.log("AUTHORIZATION_MODE=V1");
  console.log("OWNER_SIGNATURE=NOT_CHECKED");
  console.log("MANUAL_V1_REVIEW_REQUIRED=YES");
  console.log(`::warning title=V1 manual governance::${reason} No cryptographic Owner authorization was verified.`);
  console.log("GOVERNANCE_V2_CI=V1_MANUAL_REVIEW_REQUIRED");
  return 0;
}

function stopCi(reason) {
  console.error(`- ${reason}`);
  console.log("GOVERNANCE_V2_CI=STOP");
  return 1;
}

function originRepository(cwd) {
  const r = git(cwd, ["remote", "get-url", "origin"]);
  const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(r.stdout.trim());
  return match ? match[1] : null;
}

function report(result, label) {
  for (const reason of result.reasons) console.error(`- ${reason}`);
  console.log(`${label}=${result.gate}`);
  return result.gate === "PASS" ? 0 : 1;
}

function printWave(result) {
  console.log(`V2_ACTIVE=${result.v2Active ? "YES" : "NO"} base=${result.baseSha ?? "unknown"}`);
  if (result.gate === "PASS") {
    console.log(`WAVE_AUTHORIZATION=VALID record=${result.recordId} revision=${result.revision} action=${result.action}`);
    console.log(`OWNER_SIGNATURE=VERIFIED principal=${result.principal}`);
    console.log(`SCOPE=MATCH changed_files=${result.changedCount}`);
    console.log("NOTION_LIVE_CHECK=NOT_REQUIRED for this in-scope action of an Owner-signed wave");
  }
  if (result.syncState) {
    console.log(`NOTION_SYNC=${result.syncState}${result.unreconciled?.length ? ` unreconciled=${result.unreconciled.join(",")}` : ""}`);
  }
  console.log("MERGE / DEPLOY / REAL_CLOUD / REAL_DB / MIGRATION = NOT_AUTHORIZED_BY_V2");
}

function runCheck(options) {
  const cwd = process.cwd();
  const branchResult = git(cwd, ["branch", "--show-current"]);
  const result = evaluateWaveAuthorization({
    cwd,
    baseRef: options.base ?? "origin/main",
    headRef: options.head ?? "HEAD",
    recordId: options.record,
    action: options.action,
    repository: options.repository ?? originRepository(cwd),
    branch: options.branch ?? branchResult.stdout.trim(),
  });
  printWave(result);
  return report(result, "GOVERNANCE_GATE");
}

function runCi(options) {
  const cwd = process.cwd();
  const eventPath = process.env.GITHUB_EVENT_PATH;
  let payload;
  try {
    payload = JSON.parse(readFileSync(eventPath ?? "", "utf8"));
  } catch {
    return stopCi("cannot read the pull request event payload.");
  }
  const baseRef = options.base ?? "HEAD^1";
  const headRef = options.head ?? "HEAD";
  const baseSha = resolveCommit(cwd, baseRef);
  if (!baseSha) return stopCi(`cannot resolve protected base ${baseRef}.`);
  const body = payload?.pull_request?.body;
  const declared = parseAuthorizationMode(body);
  if (!isV2Active(cwd, baseSha)) {
    console.log(`V2_ACTIVE=NO base=${baseSha}`);
    if (declared.mode === "V2") return stopCi("Authorization Mode V2 is declared, but V2 is not active on the protected base.");
    return reportManualV1("V2 is not active on the protected base; the V1 metadata gate and Owner review govern this PR.");
  }
  const changes = evaluateAuthorizationChanges({ cwd, baseRef, headRef });
  if (changes.gate !== "PASS") return report(changes, "GOVERNANCE_V2_CI");

  if (declared.error) return stopCi(declared.error);
  if (declared.mode === "V1") {
    return reportManualV1("Authorization Mode V1: live Notion verification is declared by the PR author and must be checked by review.");
  }
  const headRepo = payload?.pull_request?.head?.repo?.full_name;
  const repository = payload?.repository?.full_name;
  const result = evaluateWaveAuthorization({
    cwd,
    baseRef,
    headRef,
    recordId: prField(body, "Notion Record ID"),
    action: "PR_CREATE",
    repository: headRepo === repository ? repository : `${headRepo} (fork)`,
    branch: payload?.pull_request?.head?.ref,
  });
  printWave(result);
  return report(result, "GOVERNANCE_V2_CI");
}

// Owner-only. Never run by an implementation agent: the signing key is the Owner's authority.
function runSign(options) {
  if (!options.manifest || !options.key) {
    console.error("usage: sign --manifest <path> --key <owner signing key>");
    return 1;
  }
  const manifestPath = resolve(options.manifest);
  const folder = mkdtempSync(join(tmpdir(), "workos-wave-sign-"));
  try {
    const staged = join(folder, "manifest.json");
    writeFileSync(staged, normalize(readFileSync(manifestPath, "utf8")));
    const r = spawnSync("ssh-keygen", ["-Y", "sign", "-f", options.key, "-n", SIGNATURE_NAMESPACE, staged], {
      stdio: "inherit",
    });
    if (r.status !== 0) return 1;
    copyFileSync(`${staged}.sig`, `${manifestPath}.sig`);
    console.log(`signed ${manifestPath}.sig (namespace ${SIGNATURE_NAMESPACE})`);
    return 0;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const options = parseArgs(rest);
  const handlers = { check: runCheck, ci: runCi, sign: runSign };
  const handler = handlers[command];
  if (!handler) {
    console.error("usage: verify-wave-authorization.mjs <check|ci|sign> [options]");
    process.exit(1);
  }
  process.exit(handler(options));
}
