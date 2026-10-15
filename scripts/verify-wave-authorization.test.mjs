import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_SIGNERS_PATH,
  AUTHORIZATION_DIR,
  MANIFEST_SCHEMA,
  NON_DELEGABLE_ACTIONS,
  REVOCATIONS_PATH,
  REVOCATIONS_SCHEMA,
  SIGNATURE_NAMESPACE,
  V2_CONTRACT_PATH,
  evaluateAuthorizationChanges,
  evaluateSyncLedger,
  evaluateWaveAuthorization,
  ledgerLineHash,
  ledgerPath,
  parseAuthorizationMode,
} from "./verify-wave-authorization.mjs";

const script = fileURLToPath(new URL("./verify-wave-authorization.mjs", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "workos-wave-test-"));
after(() => rmSync(root, { recursive: true, force: true }));

const NOW = new Date("2026-10-14T12:00:00Z");
const RECORD = "R-901";
const MANIFEST_PATH = `${AUTHORIZATION_DIR}${RECORD}.json`;
const BRANCH = "feat/synthetic-wave";
const REPOSITORY = "office952/workos-po";

function run(cmd, args, cwd, input) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", input });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

let counter = 0;
function freshDir(name) {
  const folder = join(root, `${name}-${++counter}`);
  mkdirSync(folder, { recursive: true });
  return folder;
}

function makeKey(principal) {
  const folder = freshDir("key");
  const path = join(folder, "id_ed25519");
  run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", principal, "-f", path], folder);
  return { path, principal, publicKey: readFileSync(`${path}.pub`, "utf8").trim() };
}

const owner = makeKey("owner@workos.test");
const agent = makeKey("agent@workos.test");

function allowedSigners(...keys) {
  return keys.map((key) => `${key.principal} namespaces="${SIGNATURE_NAMESPACE}" ${key.publicKey}`).join("\n") + "\n";
}

function sign(key, text) {
  const folder = freshDir("sig");
  const file = join(folder, "manifest.json");
  writeFileSync(file, text);
  run("ssh-keygen", ["-Y", "sign", "-f", key.path, "-n", SIGNATURE_NAMESPACE, file], folder);
  return readFileSync(`${file}.sig`, "utf8");
}

function manifest(overrides = {}) {
  return {
    schema: MANIFEST_SCHEMA,
    recordId: RECORD,
    notionRecordUrl: `https://app.notion.com/p/${"a".repeat(32)}`,
    ownerGo: { recordId: "EV-GOV-901", url: `https://app.notion.com/p/${"b".repeat(32)}` },
    revision: 1,
    objective: "Synthetic approved engineering wave for verifier tests",
    repository: REPOSITORY,
    branch: BRANCH,
    scope: { paths: ["src/feature/**", "docs/feature.md"] },
    authorizedActions: ["IMPLEMENT", "TEST", "COMMIT", "PUSH", "PR_CREATE", "NOTION_JOURNAL_WRITE"],
    prohibitedActions: [...NON_DELEGABLE_ACTIONS],
    approver: { name: "Synthetic Owner", github: "office952", principal: owner.principal },
    approvedAt: "2026-10-10T00:00:00Z",
    validUntil: "2026-10-30T00:00:00Z",
    supersedes: null,
    evidence: [{ kind: "notion", ref: "EV-GOV-901", status: "VERIFIED" }],
    ...overrides,
  };
}

function signedManifestFiles(content, key = owner) {
  const text = `${JSON.stringify(content, null, 2)}\n`;
  return { [MANIFEST_PATH]: text, [`${MANIFEST_PATH}.sig`]: sign(key, text) };
}

function writeFiles(cwd, files) {
  for (const [path, content] of Object.entries(files)) {
    const full = join(cwd, path);
    if (content === null) {
      rmSync(full, { force: true });
      continue;
    }
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

function commit(cwd, message) {
  run("git", ["add", "-A"], cwd);
  run("git", ["-c", "user.name=Synthetic", "-c", "user.email=synthetic@workos.test", "commit", "-q", "--allow-empty", "-m", message], cwd);
}

// Builds a synthetic repository: `main` is the protected base, BRANCH is the candidate.
function scenario({ base = {}, head = { "src/feature/a.ts": "export const a = 1;\n" }, v2 = true, signers = [owner], authorization = manifest(), signer = owner } = {}) {
  const cwd = freshDir("repo");
  run("git", ["init", "-q", "-b", "main"], cwd);
  run("git", ["config", "core.autocrlf", "false"], cwd);
  const baseFiles = {
    "README.md": "synthetic\n",
    ...(v2 ? { [V2_CONTRACT_PATH]: "# V2\n" } : {}),
    ...(signers ? { [ALLOWED_SIGNERS_PATH]: `# Owner signers\n${allowedSigners(...signers)}` } : {}),
    ...(authorization ? signedManifestFiles(authorization, signer) : {}),
    ...base,
  };
  writeFiles(cwd, baseFiles);
  commit(cwd, "protected base");
  run("git", ["switch", "-q", "-c", BRANCH], cwd);
  writeFiles(cwd, head);
  commit(cwd, "candidate");
  return cwd;
}

function evaluate(cwd, overrides = {}) {
  return evaluateWaveAuthorization({
    cwd,
    baseRef: "main",
    headRef: BRANCH,
    recordId: RECORD,
    action: "COMMIT",
    repository: REPOSITORY,
    branch: BRANCH,
    now: NOW,
    ...overrides,
  });
}

function assertStop(result, pattern) {
  assert.equal(result.gate, "STOP", JSON.stringify(result));
  assert.ok(result.reasons.some((reason) => pattern.test(reason)), result.reasons.join("\n"));
}

describe("executable wave authorization", () => {
  test("valid Owner-signed wave continues offline, without Notion login", () => {
    const result = evaluate(scenario());
    assert.equal(result.gate, "PASS", result.reasons.join("\n"));
    assert.equal(result.v2Active, true);
    assert.equal(result.principal, owner.principal);
    assert.equal(result.syncState, "SYNC_PENDING");
  });

  test("every delegated engineering action of the wave passes", () => {
    const cwd = scenario();
    for (const action of ["IMPLEMENT", "TEST", "COMMIT", "PUSH", "PR_CREATE", "NOTION_JOURNAL_WRITE"]) {
      assert.equal(evaluate(cwd, { action }).gate, "PASS", action);
    }
  });

  test("V2 does not activate from an unmerged branch", () => {
    const cwd = scenario({ v2: false, head: { [V2_CONTRACT_PATH]: "# V2\n", "src/feature/a.ts": "x\n" } });
    assertStop(evaluate(cwd), /V2_ACTIVE=NO/);
  });

  test("missing approval fails closed", () => {
    assertStop(evaluate(scenario({ authorization: null })), /no Owner authorization/);
  });

  test("Notion unavailable without valid prior approval fails closed", () => {
    assertStop(evaluate(scenario({ authorization: null })), /never trusted/);
  });

  test("fabricated Notion record ID fails", () => {
    const cwd = scenario();
    assertStop(evaluate(cwd, { recordId: "N-999" }), /no Owner authorization for N-999/);
    assertStop(evaluate(cwd, { recordId: "FAKE-7" }), /stable H-\/N-\/R- code/);
  });

  test("feature-writer self-approval through the candidate branch fails", () => {
    const cwd = scenario({
      authorization: null,
      head: { ...signedManifestFiles(manifest(), agent), "src/feature/a.ts": "x\n" },
    });
    assertStop(evaluate(cwd), /never trusted/);
  });

  test("candidate edits to authorization state are refused even with a valid base approval", () => {
    const cwd = scenario({
      head: {
        "src/feature/a.ts": "x\n",
        [ALLOWED_SIGNERS_PATH]: `# Owner signers\n${allowedSigners(owner, agent)}`,
      },
    });
    assertStop(evaluate(cwd), /self-approval refused/);
  });

  test("manifest modified after Owner signature fails", () => {
    const signed = signedManifestFiles(manifest());
    const tampered = signed[MANIFEST_PATH].replace('"src/feature/**"', '"src/**"');
    const cwd = scenario({ authorization: null, base: { ...signed, [MANIFEST_PATH]: tampered } });
    assertStop(evaluate(cwd), /signature did not verify/);
  });

  test("manifest signed by an unregistered (agent) key fails", () => {
    assertStop(evaluate(scenario({ signer: agent })), /signature did not verify/);
  });

  test("agent principal claiming Owner identity is not a registered signer", () => {
    const cwd = scenario({
      authorization: manifest({ approver: { name: "Agent", github: "office952", principal: agent.principal } }),
      signer: agent,
    });
    assertStop(evaluate(cwd), /not a registered Owner signer/);
  });

  test("missing Owner identity evidence fails", () => {
    assertStop(evaluate(scenario({ signers: null })), /no Owner signing key/);
    assertStop(evaluate(scenario({ signers: [] })), /no Owner signing key/);
    const cwd = scenario({ authorization: manifest({ approver: { name: "Synthetic Owner" } }) });
    assertStop(evaluate(cwd), /approver must provide/);
  });

  test("unrecorded scope expansion fails", () => {
    const cwd = scenario({ head: { "src/feature/a.ts": "x\n", "apps/api/src/pricing.ts": "x\n" } });
    const result = evaluate(cwd);
    assertStop(result, /SCOPE_CONFLICT: apps\/api\/src\/pricing\.ts/);
  });

  test("universal scope cannot be approved", () => {
    const cwd = scenario({ authorization: manifest({ scope: { paths: ["**"] } }) });
    assertStop(evaluate(cwd), /not a bounded repository path/);
  });

  test("repository mismatch fails", () => {
    assertStop(evaluate(scenario(), { repository: "office952/workos-final" }), /repository/);
  });

  test("branch mismatch fails", () => {
    assertStop(evaluate(scenario(), { branch: "feat/other" }), /branch feat\/other/);
  });

  test("expired authorization fails", () => {
    assertStop(evaluate(scenario(), { now: new Date("2026-10-30T00:00:01Z") }), /expired/);
  });

  test("validity longer than the bounded window is rejected", () => {
    const cwd = scenario({ authorization: manifest({ validUntil: "2027-01-01T00:00:00Z" }) });
    assertStop(evaluate(cwd), /validity window/);
  });

  test("revoked authorization fails", () => {
    const revocations = JSON.stringify({
      schema: REVOCATIONS_SCHEMA,
      revocations: [{ recordId: RECORD, revision: 1, at: "2026-10-12T00:00:00Z", reason: "Owner withdrew the wave" }],
    });
    assertStop(evaluate(scenario({ base: { [REVOCATIONS_PATH]: revocations } })), /revoked: Owner withdrew/);
  });

  test("malformed revocation state fails closed", () => {
    assertStop(evaluate(scenario({ base: { [REVOCATIONS_PATH]: "{" } })), /fail-closed/);
  });

  test("merge, deploy and real-system actions are never delegated", () => {
    const cwd = scenario();
    for (const action of NON_DELEGABLE_ACTIONS) {
      assertStop(evaluate(cwd, { action }), /never delegated/);
    }
  });

  test("a manifest that tries to authorize merge or deploy is invalid", () => {
    const cwd = scenario({ authorization: manifest({ authorizedActions: ["COMMIT", "MERGE", "DEPLOY"] }) });
    assertStop(evaluate(cwd), /MERGE can never be delegated/);
  });

  test("an action absent from the approval fails", () => {
    const cwd = scenario({ authorization: manifest({ authorizedActions: ["IMPLEMENT", "TEST"] }) });
    assertStop(evaluate(cwd, { action: "PUSH" }), /PUSH is not authorized/);
  });

  test("unknown action fails", () => {
    assertStop(evaluate(scenario(), { action: "SHIP_IT" }), /unknown action/);
  });
});

describe("Notion synchronization ledger", () => {
  const url = `https://app.notion.com/p/${"c".repeat(32)}`;
  const line = (entry) => JSON.stringify(entry);
  const pending = { seq: 1, at: "2026-10-14T10:00:00Z", event: "commit abc during Notion outage", state: "SYNC_PENDING" };
  const conflictEntry = { seq: 1, at: "2026-10-14T10:00:00Z", event: "pricing change needed", state: "SCOPE_CONFLICT" };

  test("pending entries stay pending until reconciled", () => {
    assert.equal(evaluateSyncLedger({ baseText: null, headText: line(pending) }).state, "SYNC_PENDING");
    const reconciled = [line(pending), line({ seq: 2, at: "2026-10-14T11:00:00Z", event: "journal restored", state: "SYNC_CONFIRMED", notionUrl: url, reconciles: 1 })].join("\n");
    assert.equal(evaluateSyncLedger({ baseText: line(pending), headText: reconciled }).state, "SYNC_CONFIRMED");
  });

  test("failed synchronization is reported, not hidden", () => {
    const failed = { ...pending, state: "SYNC_FAILED" };
    const result = evaluateSyncLedger({ baseText: null, headText: line(failed) });
    assert.equal(result.state, "SYNC_FAILED");
    assert.deepEqual(result.unreconciled, [1]);
  });

  test("SYNC_CONFIRMED cannot be claimed without the Notion journal URL", () => {
    const result = evaluateSyncLedger({ baseText: null, headText: line({ ...pending, state: "SYNC_CONFIRMED" }) });
    assert.ok(result.errors.some((error) => /without the Notion journal URL/.test(error)));
  });

  test("history cannot be rewritten", () => {
    const result = evaluateSyncLedger({ baseText: line(pending), headText: line({ ...pending, event: "rewritten" }) });
    assert.ok(result.errors.some((error) => /append-only/.test(error)));
  });

  test("pending synchronization never carries authority", () => {
    const result = evaluateSyncLedger({ baseText: null, headText: line({ ...pending, authorizedActions: ["MERGE"] }) });
    assert.ok(result.errors.some((error) => /authority field authorizedActions/.test(error)));
  });

  test("entries must stay chronological and sequential", () => {
    const text = [line(pending), line({ ...pending, seq: 3, at: "2026-10-13T00:00:00Z" })].join("\n");
    const result = evaluateSyncLedger({ baseText: null, headText: text });
    assert.ok(result.errors.some((error) => /seq 3/.test(error)));
    assert.ok(result.errors.some((error) => /chronological/.test(error)));
  });

  test("SCOPE_CONFLICT stops the wave", () => {
    const cwd = scenario({ head: { "src/feature/a.ts": "x\n", [ledgerPath(RECORD)]: `${line(conflictEntry)}\n` } });
    assertStop(evaluate(cwd), /SCOPE_CONFLICT recorded/);
  });

  test("regression: ledger resolvedByRevision equal to the signed revision does not clear the conflict", () => {
    const forged = line({ ...conflictEntry, resolvedByRevision: 1 });
    const result = evaluateSyncLedger({ baseText: null, headText: forged, authorization: manifest({ revision: 1 }) });
    assert.equal(result.state, "SCOPE_CONFLICT");
    assert.deepEqual(result.unreconciled, [1]);
    assert.ok(result.errors.some((error) => /authority field resolvedByRevision/.test(error)));
    const cwd = scenario({ head: { "src/feature/a.ts": "x\n", [ledgerPath(RECORD)]: `${forged}\n` } });
    assertStop(evaluate(cwd), /SCOPE_CONFLICT recorded/);
  });

  test("ledger clearance markers for older, current or future revisions never clear the conflict", () => {
    for (const revision of [0, 1, 2, 99]) {
      for (const marker of [{ resolvedByRevision: revision }, { revision }, { resolved: true }]) {
        const forged = line({ ...conflictEntry, ...marker });
        for (const authorization of [manifest({ revision: 1 }), manifest({ revision: 2 }), undefined]) {
          const result = evaluateSyncLedger({ baseText: null, headText: forged, authorization });
          assert.equal(result.state, "SCOPE_CONFLICT", `${JSON.stringify(marker)} @ ${authorization?.revision}`);
        }
      }
    }
  });

  test("an appended ledger line cannot clear an earlier conflict", () => {
    const clearances = [
      { seq: 2, at: "2026-10-14T11:00:00Z", event: "conflict cleared", state: "SYNC_CONFIRMED", notionUrl: url, reconciles: 1 },
      { seq: 2, at: "2026-10-14T11:00:00Z", event: "conflict cleared", state: "SYNC_PENDING", resolvesConflicts: [{ seq: 1, sha256: ledgerLineHash(line(conflictEntry)) }] },
    ];
    for (const clearance of clearances) {
      const text = [line(conflictEntry), line(clearance)].join("\n");
      const result = evaluateSyncLedger({ baseText: line(conflictEntry), headText: text, authorization: manifest() });
      assert.equal(result.state, "SCOPE_CONFLICT", JSON.stringify(clearance));
    }
  });

  test("a historical conflict line cannot be edited or removed to escape it", () => {
    const base = line(conflictEntry);
    for (const head of [line({ ...conflictEntry, state: "SYNC_CONFIRMED", notionUrl: url }), ""]) {
      const result = evaluateSyncLedger({ baseText: base, headText: head, authorization: manifest() });
      assert.notEqual(result.state, "SYNC_CONFIRMED");
      assert.notEqual(result.state, "SYNC_PENDING");
      assert.ok(result.errors.some((error) => /append-only/.test(error)));
    }
  });

  test("a newer Owner-signed revision naming the exact conflict line clears it", () => {
    const conflict = line(conflictEntry);
    const revision2 = manifest({ revision: 2, supersedes: 1, approvedAt: "2026-10-14T11:00:00Z", resolvesConflicts: [{ seq: 1, sha256: ledgerLineHash(conflict) }] });
    const result = evaluateSyncLedger({ baseText: conflict, headText: conflict, authorization: revision2 });
    assert.equal(result.state, "SYNC_PENDING");
    assert.deepEqual(result.unreconciled, [1]);

    const cwd = scenario({
      authorization: revision2,
      base: { [ledgerPath(RECORD)]: `${conflict}\n` },
      head: { "src/feature/a.ts": "x\n", [ledgerPath(RECORD)]: `${conflict}\n${line({ ...pending, seq: 2, at: "2026-10-14T11:30:00Z" })}\n` },
    });
    const gate = evaluate(cwd);
    assert.equal(gate.gate, "PASS", gate.reasons.join("\n"));
    assert.equal(gate.syncState, "SYNC_PENDING");
  });

  test("a signed resolution that does not match the conflict exactly does not clear it", () => {
    const conflict = line(conflictEntry);
    const hash = ledgerLineHash(conflict);
    const cases = [
      ["different line content", { resolvesConflicts: [{ seq: 1, sha256: ledgerLineHash(line({ ...conflictEntry, event: "other" })) }] }],
      ["different seq", { resolvesConflicts: [{ seq: 2, sha256: hash }] }],
      ["approved before the conflict was raised", { approvedAt: "2026-10-14T09:00:00Z", resolvesConflicts: [{ seq: 1, sha256: hash }] }],
      ["revision 1 cannot resolve", { revision: 1, resolvesConflicts: [{ seq: 1, sha256: hash }] }],
    ];
    for (const [name, overrides] of cases) {
      const authorization = manifest({ revision: 2, supersedes: 1, approvedAt: "2026-10-14T11:00:00Z", ...overrides });
      const result = evaluateSyncLedger({ baseText: null, headText: conflict, authorization });
      assert.equal(result.state, "SCOPE_CONFLICT", name);
    }
  });

  test("a later conflict is not pre-cleared by an earlier resolution", () => {
    const first = line(conflictEntry);
    const second = line({ ...conflictEntry, seq: 2, at: "2026-10-14T12:00:00Z", event: "second conflict" });
    const authorization = manifest({ revision: 2, supersedes: 1, approvedAt: "2026-10-14T11:00:00Z", resolvesConflicts: [{ seq: 1, sha256: ledgerLineHash(first) }] });
    const result = evaluateSyncLedger({ baseText: first, headText: `${first}\n${second}`, authorization });
    assert.equal(result.state, "SCOPE_CONFLICT");
    assert.deepEqual(result.unreconciled, [2]);
  });

  test("resolvesConflicts is only valid in a superseding manifest", () => {
    const hash = "d".repeat(64);
    assertStop(evaluate(scenario({ authorization: manifest({ resolvesConflicts: [{ seq: 1, sha256: hash }] }) })), /superseding revision/);
    assertStop(evaluate(scenario({ authorization: manifest({ revision: 2, resolvesConflicts: [{ seq: 1 }] }) })), /resolvesConflicts must list/);
  });

  test("a non-object ledger line fails closed", () => {
    for (const text of ["null", "1", "[]"]) {
      assert.equal(evaluateSyncLedger({ baseText: null, headText: text }).state, "SYNC_FAILED", text);
    }
  });

  test("wave ledger is writable by the wave without widening its scope", () => {
    const cwd = scenario({ head: { "src/feature/a.ts": "x\n", [ledgerPath(RECORD)]: `${line(pending)}\n` } });
    const result = evaluate(cwd);
    assert.equal(result.gate, "PASS", result.reasons.join("\n"));
    assert.equal(result.syncState, "SYNC_PENDING");
  });

  test("malformed ledger fails closed", () => {
    const cwd = scenario({ head: { "src/feature/a.ts": "x\n", [ledgerPath(RECORD)]: "not json\n" } });
    assertStop(evaluate(cwd), /not JSON/);
  });
});

describe("authorization-change PRs", () => {
  function changes(cwd) {
    return evaluateAuthorizationChanges({ cwd, baseRef: "main", headRef: BRANCH, now: NOW });
  }

  test("a dedicated PR with an Owner-signed manifest passes", () => {
    const cwd = scenario({ authorization: null, head: signedManifestFiles(manifest()) });
    assert.equal(changes(cwd).gate, "PASS", changes(cwd).reasons.join("\n"));
  });

  test("an agent-signed manifest is refused", () => {
    const cwd = scenario({ authorization: null, head: signedManifestFiles(manifest(), agent) });
    assertStop(changes(cwd), /not signed by a registered Owner key/);
  });

  test("authorization mixed with implementation is refused", () => {
    const cwd = scenario({ authorization: null, head: { ...signedManifestFiles(manifest()), "src/feature/a.ts": "x\n" } });
    assertStop(changes(cwd), /dedicated Owner PR/);
  });

  test("signer-set changes cannot pass CI", () => {
    const cwd = scenario({ head: { [ALLOWED_SIGNERS_PATH]: allowedSigners(owner, agent) } });
    assertStop(changes(cwd), /signer-set changes cannot pass CI/);
  });

  test("revocations are append-only", () => {
    const entry = { recordId: RECORD, revision: "ALL", at: "2026-10-12T00:00:00Z", reason: "withdrawn" };
    const withEntry = JSON.stringify({ schema: REVOCATIONS_SCHEMA, revocations: [entry] });
    const empty = JSON.stringify({ schema: REVOCATIONS_SCHEMA, revocations: [] });
    assertStop(changes(scenario({ base: { [REVOCATIONS_PATH]: withEntry }, head: { [REVOCATIONS_PATH]: empty } })), /append-only/);
    assert.equal(changes(scenario({ base: { [REVOCATIONS_PATH]: empty }, head: { [REVOCATIONS_PATH]: withEntry } })).gate, "PASS");
  });

  test("superseding authorization must increase the revision", () => {
    const cwd = scenario({ head: signedManifestFiles(manifest({ objective: "Same revision with wider intent" })) });
    assertStop(changes(cwd), /increase the revision/);
    const next = scenario({ head: signedManifestFiles(manifest({ revision: 2, supersedes: 1 })) });
    assert.equal(changes(next).gate, "PASS", changes(next).reasons.join("\n"));
  });

  test("an authorization cannot be deleted to make room for replaying an older revision", () => {
    const cwd = scenario({ head: { [MANIFEST_PATH]: null, [`${MANIFEST_PATH}.sig`]: null } });
    assertStop(changes(cwd), /never deleted; append a revocation/);
  });

  test("a conflict resolution must supersede an existing base authorization", () => {
    const resolution = manifest({ revision: 2, supersedes: 1, resolvesConflicts: [{ seq: 1, sha256: "e".repeat(64) }] });
    assertStop(changes(scenario({ authorization: null, head: signedManifestFiles(resolution) })), /must supersede an existing/);
    const superseding = scenario({ head: signedManifestFiles(resolution) });
    assert.equal(changes(superseding).gate, "PASS", changes(superseding).reasons.join("\n"));
  });

  test("ordinary implementation PRs are untouched by the guard", () => {
    assert.equal(changes(scenario()).gate, "PASS");
  });
});

describe("CLI", () => {
  function ci(cwd, body) {
    const eventPath = join(freshDir("event"), "event.json");
    writeFileSync(
      eventPath,
      JSON.stringify({
        pull_request: { body, head: { ref: BRANCH, repo: { full_name: REPOSITORY } } },
        repository: { full_name: REPOSITORY },
      }),
    );
    return spawnSync(process.execPath, [script, "ci", "--base", "main", "--head", BRANCH], {
      cwd,
      env: { ...process.env, GITHUB_EVENT_PATH: eventPath },
      encoding: "utf8",
    });
  }

  const v1Body = `Notion Record ID: ${RECORD}\nAuthorization Mode: V1`;

  test("CI keeps the V1 path while V2 is inactive, reported as manual review, never as signed authorization", () => {
    for (const body of [v1Body, "Notion Record ID: N-006"]) {
      const r = ci(scenario({ v2: false }), body);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /V2_ACTIVE=NO/);
      assert.match(r.stdout, /MANUAL_V1_REVIEW_REQUIRED=YES/);
      assert.match(r.stdout, /OWNER_SIGNATURE=NOT_CHECKED/);
      assert.match(r.stdout, /GOVERNANCE_V2_CI=V1_MANUAL_REVIEW_REQUIRED/);
      assert.doesNotMatch(r.stdout, /GOVERNANCE_V2_CI=PASS|WAVE_AUTHORIZATION=VALID|OWNER_SIGNATURE=VERIFIED/);
    }
  });

  test("CI refuses a V2 claim while V2 is inactive on the protected base", () => {
    const r = ci(scenario({ v2: false }), `Authorization Mode: V2\nNotion Record ID: ${RECORD}`);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /GOVERNANCE_V2_CI=STOP/);
    assert.match(r.stderr, /not active/);
  });

  test("CI with V2 active accepts explicit V1 only as manual review", () => {
    const r = ci(scenario(), v1Body);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /AUTHORIZATION_MODE=V1/);
    assert.match(r.stdout, /MANUAL_V1_REVIEW_REQUIRED=YES/);
    assert.match(r.stdout, /::warning title=V1 manual governance::/);
    assert.doesNotMatch(r.stdout, /GOVERNANCE_V2_CI=PASS|OWNER_SIGNATURE=VERIFIED/);
  });

  test("CI with V2 active refuses a missing, duplicated or unrecognized Authorization Mode", () => {
    const bodies = [
      [`Notion Record ID: ${RECORD}`, /missing/],
      [`${v1Body}\nAuthorization Mode: V2`, /more than once/],
      [`${v1Body}\nAuthorization Mode: V1`, /more than once/],
      [`Notion Record ID: ${RECORD}\nAuthorization Mode: V1 | V2`, /not exactly V1 or V2/],
      [`Notion Record ID: ${RECORD}\nAuthorization Mode: V2-signed`, /not exactly V1 or V2/],
      [`Notion Record ID: ${RECORD}\nAuthorization Mode: v1`, /not exactly V1 or V2/],
      [`Notion Record ID: ${RECORD}\nAuthorization Mode: V3`, /not exactly V1 or V2/],
      [`Notion Record ID: ${RECORD}\nAuthorization Mode:`, /not exactly V1 or V2/],
    ];
    for (const [body, pattern] of bodies) {
      const r = ci(scenario(), body);
      assert.notEqual(r.status, 0, body);
      assert.match(r.stdout, /GOVERNANCE_V2_CI=STOP/, body);
      assert.match(r.stderr, pattern, body);
    }
  });

  test("CI with V2 active refuses a pull request without a body", () => {
    const r = ci(scenario(), null);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Authorization Mode is missing/);
  });

  test("parseAuthorizationMode accepts only one exact V1 or V2 declaration", () => {
    assert.deepEqual(parseAuthorizationMode("Authorization Mode: V1"), { mode: "V1", error: null });
    assert.deepEqual(parseAuthorizationMode("  authorization mode:   V2  "), { mode: "V2", error: null });
    assert.deepEqual(parseAuthorizationMode("Authorization Mode: V2\r\nScope: x"), { mode: "V2", error: null });
    for (const body of [undefined, null, "", "Authorization Mode: V2 ok", "Authorization Mode: V1\nAuthorization Mode: V1"]) {
      assert.equal(parseAuthorizationMode(body).mode, null, String(body));
    }
  });

  test("CI fails a V2 PR without a protected Owner authorization", () => {
    const r = ci(scenario({ authorization: null }), `Authorization Mode: V2\nNotion Record ID: ${RECORD}`);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /GOVERNANCE_V2_CI=STOP/);
  });

  test("CI passes a V2 PR of a valid Owner-signed wave without contacting Notion", () => {
    const now = Date.now();
    const authorization = manifest({
      approvedAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      validUntil: new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const r = ci(scenario({ authorization }), `Authorization Mode: V2\nNotion Record ID: ${RECORD}`);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /WAVE_AUTHORIZATION=VALID/);
    assert.match(r.stdout, /NOTION_LIVE_CHECK=NOT_REQUIRED/);
    assert.match(r.stdout, /NOT_AUTHORIZED_BY_V2/);
  });

  test("CI fails self-approval attempts even in V1 mode", () => {
    const cwd = scenario({ head: { [ALLOWED_SIGNERS_PATH]: allowedSigners(owner, agent) } });
    const r = ci(cwd, "Authorization Mode: V1");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /signer-set/);
  });

  test("check exits non-zero for merge", () => {
    const cwd = scenario();
    const r = spawnSync(
      process.execPath,
      [script, "check", "--base", "main", "--head", BRANCH, "--record", RECORD, "--action", "MERGE", "--repository", REPOSITORY, "--branch", BRANCH],
      { cwd, encoding: "utf8" },
    );
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /GOVERNANCE_GATE=STOP/);
  });
});
