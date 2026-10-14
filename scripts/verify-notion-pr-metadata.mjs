#!/usr/bin/env node
// WorkOS V1: PR metadata gate. This deliberately does not claim live Notion verification.
import { readFileSync } from "node:fs";

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) {
  console.error("NOTION_GATE=STOP: GITHUB_EVENT_PATH is not set.");
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(readFileSync(eventPath, "utf8"));
} catch {
  console.error("NOTION_GATE=STOP: cannot read pull request event payload.");
  process.exit(1);
}
const body = payload?.pull_request?.body;
if (typeof body !== "string") {
  console.error("NOTION_GATE=STOP: pull request body is missing.");
  process.exit(1);
}

const lines = body.replace(/\r/g, "").split("\n");
const fail = [];
function field(key) {
  const match = lines.filter((line) =>
    line.trimStart().toLowerCase().startsWith(key.toLowerCase() + ":"),
  );
  if (match.length !== 1) {
    fail.push(`${key}: expected exactly one field.`);
    return "";
  }
  return match[0].trimStart().slice(key.length + 1).trim();
}

const id = field("Notion Record ID");
const urlText = field("Notion Record URL");
const ownerGo = field("Owner GO");
const scope = field("Scope");
const evidence = field("Evidence");

if (!/^[HNR]-[0-9]{3,}$/.test(id)) {
  fail.push("Notion Record ID must be a stable H-/N-/R- code from the implementation registry.");
}

try {
  const url = new URL(urlText);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "app.notion.com" ||
    !/^\/p\/[0-9a-f]{32}$/i.test(url.pathname)
  ) {
    fail.push("Notion Record URL must be an exact app.notion.com/p/<32-character-page-id> link.");
  }
} catch {
  fail.push("Notion Record URL is not a valid URL.");
}

for (const [name, value] of [
  ["Owner GO", ownerGo],
  ["Scope", scope],
  ["Evidence", evidence],
]) {
  if (
    value.length < 12 ||
    /^(replace|todo|tbd|none|n\/a|unknown|pending)/i.test(value)
  ) {
    fail.push(`${name}: replace the template with a specific and grounded value.`);
  }
}

if (fail.length) {
  console.error("NOTION_GATE=STOP (PR metadata only):");
  for (const reason of fail) console.error(`- ${reason}`);
  console.error(
    "Create/verify the Notion implementation record before PR publication; an ID/URL alone does not prove live Notion status or Owner approval.",
  );
  process.exit(1);
}

console.log(`NOTION_PR_METADATA=PASS record=${id}`);
console.log(
  "Review must still verify this exact record, its Owner GO and current state in Notion. This is not live Notion verification.",
);
