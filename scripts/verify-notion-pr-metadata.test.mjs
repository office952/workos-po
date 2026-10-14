import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const script = fileURLToPath(new URL("./verify-notion-pr-metadata.mjs", import.meta.url));
const example = [
  "Notion Record ID: N-006",
  "Notion Record URL: https://app.notion.com/p/3f98ea98e40f819794edd8974c3b964e",
  "Owner GO: Owner approved the governance scope on 2026-10-14",
  "Scope: Governance documentation and metadata validation only",
  "Evidence: Notion policy and branch diff checked against exact main",
].join("\n");

function evaluate(body) {
  const folder = mkdtempSync(join(tmpdir(), "workos-notion-gate-"));
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

test("well-formed Notion journal fields pass syntactic validation", () => {
  const r = evaluate(example);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /NOTION_PR_METADATA=PASS/);
});

test("missing fields fail closed", () => {
  const r = evaluate("Scope: Missing the required Notion record and authorization");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /NOTION_GATE=STOP/);
});

test("template placeholders cannot pass", () => {
  const r = evaluate(example
    .replace("N-006", "REPLACE_WITH_H_OR_N_OR_R_CODE")
    .replace("Owner approved the governance scope on 2026-10-14", "Replace with Owner GO"));
  assert.notEqual(r.status, 0);
});

test("non-Notion URL fails", () => {
  const r = evaluate(example.replace("https://app.notion.com/p/", "https://example.com/p/"));
  assert.notEqual(r.status, 0);
});

test("duplicated Notion ID fails", () => {
  const r = evaluate(example + "\nNotion Record ID: N-999");
  assert.notEqual(r.status, 0);
});

test("unknown Owner approval fails", () => {
  const r = evaluate(example.replace("Owner approved the governance scope on 2026-10-14", "pending"));
  assert.notEqual(r.status, 0);
});
