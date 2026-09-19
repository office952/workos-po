/**
 * WorkOS PO Wave 0 beforeShellExecution guard.
 *
 * Official schema (verified 2026-09-20):
 * https://cursor.com/docs/hooks
 * https://cursor.com/docs/reference/permissions
 *
 * Input: { command, cwd, sandbox }
 * Output: { permission: "allow" | "deny" | "ask", user_message?, agent_message? }
 *
 * "ask" is supported by the current beforeShellExecution schema.
 * failClosed is enabled in .cursor/hooks.json so hook crashes block execution.
 * Windows Cursor stdin may include a UTF-8 BOM; that prefix is stripped before parse.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const PERMISSION = {
  ALLOW: "allow",
  DENY: "deny",
  ASK: "ask",
};

const RANK = {
  [PERMISSION.ALLOW]: 0,
  [PERMISSION.ASK]: 1,
  [PERMISSION.DENY]: 2,
};

const HISTORICAL_REPO_NAMES = ["workos-final", "workos-ui20"];
const GIT_WRITE_SUBCOMMANDS = new Set([
  "add",
  "branch",
  "checkout",
  "cherry-pick",
  "clean",
  "commit",
  "merge",
  "mv",
  "push",
  "rebase",
  "reset",
  "restore",
  "rm",
  "stash",
  "switch",
  "tag",
  "update-ref",
]);

const PRINT_COMMANDS = new Set([
  "cat",
  "type",
  "get-content",
  "gc",
  "less",
  "more",
  "bat",
  "head",
  "tail",
  "get-item",
]);

const CD_COMMANDS = new Set(["cd", "chdir", "set-location", "sl", "push-location"]);

const SECRET_NAME_RE =
  /(?:^|[/\\])(?:\.env(?:\..+)?|.*(?:credential|credentials|secret|secrets|token|tokens|cookie|cookies).*)(?:$|[/\\])/i;
const SECRET_NAME_ALLOW_RE = /\.(?:example|sample|template|example\..+)$/i;
const USER_CURSOR_CONFIG_RE =
  /(?:(?:~|\$home|\$env:userprofile|%userprofile%)[/\\]\.cursor|(?:[/\\]users[/\\][^/\\]+[/\\]\.cursor)|appdata[/\\](?:roaming|local)[/\\]cursor)/i;
const CLOUD_ROOT_ASSIGN_RE =
  /(?:^|[\s;&|])(?:\$env:)?WORKOS_CLOUD_ROOT\s*=\s*(?:['"]([^'"]+)['"]|(\S+))/i;
const ENV_DUMP_RE =
  /(?:^|[\s;&|])(?:printenv\b|get-childitem\s+(?:-path\s+)?env:|gci\s+env:|dir\s+env:|ls\s+env:)\b/i;
const PROCESS_ENV_DUMP_RE =
  /process\.env|os\.environ|Get-ChildItem\s+Env:/i;

function worstPermission(current, next) {
  if (RANK[next.permission] > RANK[current.permission]) {
    return next;
  }
  return current;
}

function baseCommand(token) {
  if (!token) {
    return "";
  }
  const trimmed = token.replace(/^['"]|['"]$/g, "");
  return path.basename(trimmed).replace(/\.(?:exe|cmd|bat|ps1)$/i, "").toLowerCase();
}

function stripQuotes(token) {
  if (!token) {
    return "";
  }
  if (
    (token.startsWith("'") && token.endsWith("'")) ||
    (token.startsWith('"') && token.endsWith('"'))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

export function splitCompound(command) {
  const parts = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      current += ch;
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "\n" || ch === "\r" || ch === ";") {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
      continue;
    }
    if (ch === "&" && command[i + 1] === "&") {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
      i += 1;
      continue;
    }
    if (ch === "|" && command[i + 1] === "|") {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
      i += 1;
      continue;
    }
    if (ch === "|") {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

export function tokenize(command) {
  const tokens = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      current += ch;
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function unwrapLaunchers(tokens) {
  const next = [...tokens];
  while (next.length > 0) {
    const head = baseCommand(next[0]);
    if (head === "sudo" || head === "doas") {
      next.shift();
      while (next[0] && next[0].startsWith("-")) {
        const flag = next.shift();
        if (flag === "-u" || flag === "--user" || flag === "-g" || flag === "--group") {
          next.shift();
        }
      }
      continue;
    }
    if (head === "env") {
      next.shift();
      while (next[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(next[0])) {
        next.shift();
      }
      continue;
    }
    break;
  }
  return next;
}

function findGitTokens(tokens) {
  const unwrapped = unwrapLaunchers(tokens);
  const gitIndex = unwrapped.findIndex((token) => baseCommand(token) === "git");
  if (gitIndex === -1) {
    return null;
  }
  if (gitIndex === 0) {
    return unwrapped;
  }
  const previous = baseCommand(unwrapped[gitIndex - 1]);
  const root = baseCommand(unwrapped[0]);
  if (
    (previous === "exec" || previous === "x") &&
    (root === "pnpm" || root === "npm" || root === "yarn")
  ) {
    return unwrapped.slice(gitIndex);
  }
  return null;
}

function parseGitInvocation(gitTokens) {
  const paths = [];
  let i = 1;
  while (i < gitTokens.length) {
    const token = gitTokens[i];
    if (token === "-C" || token === "--git-dir" || token === "--work-tree") {
      const value = gitTokens[i + 1];
      if (value) {
        paths.push(stripQuotes(value));
      }
      i += 2;
      continue;
    }
    if (token.startsWith("--git-dir=")) {
      paths.push(stripQuotes(token.slice("--git-dir=".length)));
      i += 1;
      continue;
    }
    if (token.startsWith("--work-tree=")) {
      paths.push(stripQuotes(token.slice("--work-tree=".length)));
      i += 1;
      continue;
    }
    if (token === "-c" || token === "--config-env" || token === "--namespace" || token === "--exec-path") {
      i += 2;
      continue;
    }
    if (token.startsWith("-") && token.includes("=")) {
      i += 1;
      continue;
    }
    if (token.startsWith("-")) {
      i += 1;
      continue;
    }
    break;
  }
  return {
    subcommand: gitTokens[i] ? gitTokens[i].toLowerCase() : "",
    args: gitTokens.slice(i + 1),
    paths,
  };
}

function flagSet(args) {
  const flags = new Set();
  for (const arg of args) {
    if (arg.startsWith("--")) {
      flags.add(arg.split("=")[0]);
      continue;
    }
    if (arg.startsWith("-") && arg !== "-") {
      for (const ch of arg.slice(1)) {
        flags.add(`-${ch}`);
      }
    }
  }
  return flags;
}

function hasFlag(args, ...names) {
  const flags = flagSet(args);
  return names.some((name) => flags.has(name));
}

function isDryRun(args) {
  return hasFlag(args, "-n", "--dry-run");
}

function isMainRefspec(spec) {
  const raw = spec.startsWith("+") ? spec.slice(1) : spec;
  const destination = raw.includes(":") ? raw.slice(raw.lastIndexOf(":") + 1) : raw;
  return (
    destination === "main" ||
    destination === "master" ||
    destination === "refs/heads/main" ||
    destination === "refs/heads/master"
  );
}

function pathMentionsHistoricalRepo(value, { allowBareName = false } = {}) {
  if (!value) {
    return false;
  }
  const normalized = value.replace(/\\/g, "/").toLowerCase().replaceAll("@workos-final/", "");
  if (/github\.com[/:]office952\/workos-(?:final|ui20)(?:\.git)?(?:$|[/#?])/i.test(normalized)) {
    return true;
  }
  return HISTORICAL_REPO_NAMES.some((name) => {
    if (allowBareName && (normalized === name || normalized === `${name}.git`)) {
      return true;
    }
    return pathHasSegment(normalized, name) && normalized.includes("/");
  });
}

function pathHasSegment(normalized, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|/)(?:${escaped})(?:/|\\.git$|$)`).test(normalized);
}

function cwdTargetsHistoricalRepo(cwd) {
  return pathMentionsHistoricalRepo(cwd, { allowBareName: true });
}

function classifyGit(git, cwd) {
  const positional = git.args.filter((arg) => !arg.startsWith("-"));
  const historicalTarget =
    cwdTargetsHistoricalRepo(cwd) ||
    git.paths.some((value) => pathMentionsHistoricalRepo(value, { allowBareName: true })) ||
    (git.subcommand === "push" &&
      positional[0] &&
      pathMentionsHistoricalRepo(positional[0], { allowBareName: true }));

  if (git.subcommand === "show" || git.subcommand === "diff" || git.subcommand === "cat-file") {
    if (git.args.some((value) => looksLikeSecretFile(value))) {
      return ask("Printing secrets, credential files, or private Cursor user config needs Owner review.");
    }
  }

  if (git.subcommand === "push") {
    if (hasFlag(git.args, "-f", "--force", "--force-with-lease", "--force-if-includes")) {
      return deny("Force-push is hard-denied.");
    }
    const refspecs = positional.slice(1);
    if (refspecs.some((spec) => isMainRefspec(spec))) {
      return deny("Direct push to main is hard-denied.");
    }
    if (historicalTarget) {
      return deny("Write/destructive Git against a historical repository is hard-denied.");
    }
    return null;
  }

  if (git.subcommand === "reset" && hasFlag(git.args, "--hard")) {
    return deny("git reset --hard is hard-denied.");
  }

  if (git.subcommand === "clean") {
    const forced = hasFlag(git.args, "-f", "--force");
    if (forced && !isDryRun(git.args)) {
      return deny("Forced git clean is hard-denied.");
    }
  }

  if (git.subcommand === "branch") {
    const deletedForce = hasFlag(git.args, "-D") || (hasFlag(git.args, "-d", "--delete") && hasFlag(git.args, "-f", "--force"));
    if (deletedForce) {
      return deny("git branch -D is hard-denied.");
    }
  }

  if (historicalTarget && GIT_WRITE_SUBCOMMANDS.has(git.subcommand) && !isReadOnlyGitShape(git, positional)) {
    return deny("Write/destructive Git against a historical repository is hard-denied.");
  }

  return null;
}

function isReadOnlyGitShape(git, positional) {
  if (git.subcommand === "branch") {
    return (
      !hasFlag(git.args, "-D", "-d", "--delete", "-m", "-M", "-c", "-C", "-f", "--force") &&
      positional.length === 0
    );
  }
  if (git.subcommand === "tag") {
    return !hasFlag(git.args, "-d", "--delete", "-a", "-f", "-s") && positional.length === 0;
  }
  if (git.subcommand === "stash") {
    return git.args[0] === "list" || git.args[0] === "show";
  }
  return false;
}

function classifyPnpm(tokens) {
  const joined = tokens.join(" ");
  const names = new Set(tokens.map((token) => stripQuotes(token)));
  if (names.has("ports:reclaim")) {
    return ask("pnpm ports:reclaim terminates listener ports and needs Owner review.");
  }
  if (names.has("engine:dev")) {
    return ask("pnpm engine:dev can start a Cloud-capable API process and needs Owner review.");
  }
  if (names.has("cloud:provision")) {
    return ask("cloud:provision is Owner-controlled Cloud administration.");
  }
  if (names.has("cloud:backup")) {
    return ask("cloud:backup is Owner-controlled Cloud administration.");
  }
  if (names.has("cloud:restore")) {
    return ask("cloud:restore is Owner-controlled Cloud administration.");
  }
  if (names.has("cloud:adopt") && /(?:^|[\s])--execute(?:$|[\s])/.test(joined)) {
    return ask("cloud:adopt --execute is Owner-controlled Cloud administration.");
  }
  if (names.has("cloud:configure-providers") && /(?:^|[\s])--execute(?:$|[\s])/.test(joined)) {
    return ask("cloud:configure-providers --execute is Owner-controlled Cloud administration.");
  }
  return null;
}

function isSyntheticCloudRoot(value) {
  const normalized = value.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("workos-dev-cloud")) {
    return true;
  }
  if (normalized.includes("/.tmp/") || normalized.startsWith(".tmp/") || normalized.includes("/tmp/")) {
    return true;
  }
  if (normalized.includes("/temp/") || normalized.includes("/appdata/local/temp")) {
    return true;
  }
  if (normalized.includes("%temp%") || normalized.includes("%tmp%") || /\$env:temp/i.test(value)) {
    return true;
  }
  return false;
}

function classifyCloudRootAssignment(segment) {
  const match = segment.match(CLOUD_ROOT_ASSIGN_RE);
  if (!match) {
    return null;
  }
  const value = (match[1] || match[2] || "").trim();
  if (!value || isSyntheticCloudRoot(value)) {
    return null;
  }
  return ask("Setting WORKOS_CLOUD_ROOT outside a synthetic .tmp / OS-temp path needs Owner review.");
}

function isUserCursorConfigPath(value) {
  return USER_CURSOR_CONFIG_RE.test(stripQuotes(value));
}

function looksLikeSecretFile(value) {
  const cleaned = stripQuotes(value);
  if (!cleaned || SECRET_NAME_ALLOW_RE.test(cleaned)) {
    return false;
  }
  const withoutRevision = cleaned.replace(/^[^:]+:/, "");
  const base = path.basename(withoutRevision).toLowerCase();
  if (base === ".env" || base.startsWith(".env.")) {
    return !SECRET_NAME_ALLOW_RE.test(base);
  }
  return SECRET_NAME_RE.test(withoutRevision.replace(/\\/g, "/"));
}

function classifySecretDump(segment, tokens) {
  if (ENV_DUMP_RE.test(segment) || PROCESS_ENV_DUMP_RE.test(segment)) {
    return ask("Commands that dump environment or credential material need Owner review.");
  }
  const commandName = baseCommand(tokens[0]);
  if (PRINT_COMMANDS.has(commandName) && commandName === "gc" && tokens.some((token) => baseCommand(token) === "git")) {
    return null;
  }
  if (PRINT_COMMANDS.has(commandName)) {
    const targets = tokens.slice(1).filter((token) => !token.startsWith("-"));
    if (targets.some((token) => looksLikeSecretFile(token) || isUserCursorConfigPath(token))) {
      return ask("Printing secrets, credential files, or private Cursor user config needs Owner review.");
    }
  }
  return null;
}

function applyDirectoryChange(tokens, cwd) {
  const commandName = baseCommand(tokens[0]);
  if (!CD_COMMANDS.has(commandName)) {
    return cwd;
  }
  const target = tokens.filter((token) => !token.startsWith("-")).at(-1);
  if (!target || baseCommand(target) === commandName) {
    return cwd;
  }
  const cleaned = stripQuotes(target);
  if (path.isAbsolute(cleaned) || /^[A-Za-z]:[\\/]/.test(cleaned)) {
    return cleaned;
  }
  return path.posix.normalize(`${cwd.replace(/\\/g, "/")}/${cleaned.replace(/\\/g, "/")}`);
}

function deny(message) {
  return {
    permission: PERMISSION.DENY,
    user_message: message,
    agent_message: message,
  };
}

function ask(message) {
  return {
    permission: PERMISSION.ASK,
    user_message: message,
    agent_message: message,
  };
}

function allow() {
  return { permission: PERMISSION.ALLOW };
}

function classifySegment(segment, cwd) {
  const tokens = unwrapLaunchers(tokenize(segment));
  if (tokens.length === 0) {
    return allow();
  }

  const cloudRoot = classifyCloudRootAssignment(segment);
  if (cloudRoot) {
    return cloudRoot;
  }

  const secrets = classifySecretDump(segment, tokens);
  if (secrets) {
    return secrets;
  }

  const pnpm = classifyPnpm(tokens);
  if (pnpm) {
    return pnpm;
  }

  const gitTokens = findGitTokens(tokens);
  if (gitTokens) {
    const git = parseGitInvocation(gitTokens);
    const decision = classifyGit(git, cwd);
    if (decision) {
      return decision;
    }
  }

  return allow();
}

export function decide(payload) {
  if (!payload || typeof payload.command !== "string") {
    return deny("Shell guard received an invalid hook payload.");
  }
  const command = payload.command.trim();
  if (!command) {
    return deny("Empty shell command is fail-closed.");
  }

  let cwd = typeof payload.cwd === "string" ? payload.cwd : "";
  let current = allow();
  for (const segment of splitCompound(command)) {
    const tokens = unwrapLaunchers(tokenize(segment));
    cwd = applyDirectoryChange(tokens, cwd);
    current = worstPermission(current, classifySegment(segment, cwd));
    if (current.permission === PERMISSION.DENY) {
      return current;
    }
  }
  return current;
}

export function normalizeHookInput(raw) {
  return String(raw ?? "")
    .replace(/^\uFEFF/, "")
    .trim();
}

export function handleHookInput(raw) {
  let payload;
  try {
    payload = JSON.parse(normalizeHookInput(raw));
  } catch {
    return {
      exitCode: 2,
      body: deny("Shell guard could not parse hook JSON."),
    };
  }
  return {
    exitCode: 0,
    body: decide(payload),
  };
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return fileURLToPath(import.meta.url).toLowerCase() === path.resolve(entry).toLowerCase();
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const raw = readFileSync(0, "utf8");
  const result = handleHookInput(raw);
  process.stdout.write(`${JSON.stringify(result.body)}\n`);
  process.exit(result.exitCode);
}
