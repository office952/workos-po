#!/usr/bin/env node
// WorkOS: pull request traceability. GitHub fields are required. Notion is optional.
// This check does not call Notion and does not prove live Owner approval.
import { readFileSync } from "node:fs";

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) {
  console.error("PR_TRACEABILITY=STOP: GITHUB_EVENT_PATH is not set.");
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(readFileSync(eventPath, "utf8"));
} catch {
  console.error("PR_TRACEABILITY=STOP: cannot read pull request event payload.");
  process.exit(1);
}
const body = payload?.pull_request?.body;
if (typeof body !== "string") {
  console.error("PR_TRACEABILITY=STOP: pull request body is missing.");
  process.exit(1);
}

const lines = body.replace(/\r/g, "").split("\n");
const fail = [];

function occurrences(key) {
  const prefix = `${key.toLowerCase()}:`;
  return lines.filter((line) => line.trimStart().toLowerCase().startsWith(prefix));
}

function readField(key) {
  const match = occurrences(key);
  if (match.length > 1) {
    fail.push(`${key}: expected at most one field.`);
    return undefined;
  }
  if (match.length === 0) return undefined;
  return match[0].trimStart().slice(key.length + 1).trim();
}

function grounded(name, value) {
  if (
    value.length < 12 ||
    /^(replace|todo|tbd|none|n\/a|unknown|pending)/i.test(value)
  ) {
    fail.push(`${name}: replace the template with a specific and grounded value.`);
  }
}

for (const name of ["Reason", "Scope", "Owner GO", "Tests", "Risks", "Evidence"]) {
  const value = readField(name);
  if (value === undefined) {
    if (occurrences(name).length === 0) {
      fail.push(`${name}: expected exactly one field.`);
    }
    continue;
  }
  grounded(name, value);
}

const notionId = readField("Notion Record ID");
const notionUrl = readField("Notion Record URL");
const idCited = notionId !== undefined;
const urlCited = notionUrl !== undefined;

if (idCited !== urlCited) {
  fail.push("Notion citation must include both Notion Record ID and Notion Record URL, or neither.");
} else if (idCited) {
  if (!/^[HNR]-[0-9]{3,}$/.test(notionId)) {
    fail.push("Notion Record ID must be a stable H-/N-/R- code when cited.");
  }
  try {
    const url = new URL(notionUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "app.notion.com" ||
      !/^\/p\/[0-9a-f]{32}$/i.test(url.pathname)
    ) {
      fail.push("Notion Record URL must be an exact app.notion.com/p/<32-character-page-id> link when cited.");
    }
  } catch {
    fail.push("Notion Record URL is not a valid URL.");
  }
}

if (fail.length) {
  console.error("PR_TRACEABILITY=STOP");
  for (const reason of fail) console.error(`- ${reason}`);
  console.error(
    "GitHub must carry reason, scope, Owner GO, tests, risks and evidence. Notion is optional and is not verified live.",
  );
  process.exit(1);
}

console.log(`PR_TRACEABILITY=PASS notion=${idCited ? notionId : "ABSENT"}`);
console.log(
  "Review still reads the Owner authorization and the diff. This check does not call Notion.",
);
