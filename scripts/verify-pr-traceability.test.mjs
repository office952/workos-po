import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const script = fileURLToPath(new URL("./verify-pr-traceability.mjs", import.meta.url));
const github = [
  "Reason: Trace ordinary WorkOS changes on the GitHub pull request",
  "Scope: Governance rules, pull request template, and metadata validation only",
  "Owner GO: Owner approved GitHub-primary Notion-optional governance for this scope",
  "Tests: node --test scripts/verify-pr-traceability.test.mjs",
  "Risks: Historical Notion links stay readable; no product or data change",
  "Evidence: Validator covers absent Notion, cited Notion, missing Owner GO and missing evidence",
].join("\n");
const notion = [
  "Notion Record ID: N-006",
  "Notion Record URL: https://app.notion.com/p/3f98ea98e40f819794edd8974c3b964e",
].join("\n");

function without(label) {
  return github
    .split("\n")
    .filter((line) => !line.startsWith(label + ":"))
    .join("\n");
}

function evaluate(body) {
  const folder = mkdtempSync(join(tmpdir(), "workos-pr-traceability-"));
  const eventPath = join(folder, "event.json");
  try {
    writeFileSync(eventPath, JSON.stringify({ pull_request: { body } }));
    return spawnSync(process.execPath, [script], {
      env: { ...process.env, GITHUB_EVENT_PATH: eventPath },
      encoding: "utf8",
    });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

test("pull request without Notion and with complete GitHub traceability passes", () => {
  const r = evaluate(github);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /PR_TRACEABILITY=PASS notion=ABSENT/);
});

test("pull request with Notion and complete GitHub traceability passes", () => {
  const r = evaluate(`${github}\n${notion}`);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /PR_TRACEABILITY=PASS notion=N-006/);
});

test("pull request without Owner GO fails", () => {
  const r = evaluate(without("Owner GO"));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /PR_TRACEABILITY=STOP/);
  assert.match(r.stderr, /Owner GO/);
});

test("pull request without mandatory evidence fails", () => {
  const r = evaluate(without("Evidence"));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /PR_TRACEABILITY=STOP/);
  assert.match(r.stderr, /Evidence/);
});

test("placeholder Owner GO fails", () => {
  const r = evaluate(github.replace(
    "Owner approved GitHub-primary Notion-optional governance for this scope",
    "pending",
  ));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Owner GO/);
});

test("malformed Notion URL fails when a citation is present", () => {
  const r = evaluate(`${github}\n${notion.replace("https://app.notion.com/p/", "https://example.com/p/")}`);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Notion Record URL/);
});

test("Notion ID without URL fails", () => {
  const r = evaluate(`${github}\nNotion Record ID: N-006`);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /both Notion Record ID and Notion Record URL/);
});
