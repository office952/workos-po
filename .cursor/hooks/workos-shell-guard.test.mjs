import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { decide, handleHookInput, PERMISSION } from "./workos-shell-guard.mjs";

const GUARD_PATH = fileURLToPath(new URL("./workos-shell-guard.mjs", import.meta.url));
const REPO_CWD = "C:/Users/offic/workspace/workos-po-saas-canon-cursor-safety-wave-0-v1";

function decideCommand(command, cwd = REPO_CWD) {
  return decide({ command, cwd, sandbox: false });
}

function assertAllow(command, cwd) {
  const result = decideCommand(command, cwd);
  assert.equal(result.permission, PERMISSION.ALLOW, command);
  assert.deepEqual(result, { permission: PERMISSION.ALLOW });
}

function assertDeny(command, cwd) {
  const result = decideCommand(command, cwd);
  assert.equal(result.permission, PERMISSION.DENY, command);
  assert.equal(typeof result.user_message, "string");
  assert.equal(typeof result.agent_message, "string");
}

function assertAsk(command, cwd) {
  const result = decideCommand(command, cwd);
  assert.equal(result.permission, PERMISSION.ASK, command);
  assert.equal(typeof result.user_message, "string");
  assert.equal(typeof result.agent_message, "string");
}

describe("allow: routine development", () => {
  test("git status", () => {
    assertAllow("git status");
  });

  test("git diff", () => {
    assertAllow("git diff");
  });

  test("git fetch origin", () => {
    assertAllow("git fetch origin");
  });

  test("git log / show / rev-parse / merge-base", () => {
    assertAllow("git log -1 --oneline");
    assertAllow("git show HEAD");
    assertAllow("git rev-parse HEAD");
    assertAllow("git merge-base HEAD origin/main");
  });

  test("pnpm verify:all and test", () => {
    assertAllow("pnpm verify:all");
    assertAllow("pnpm test");
  });

  test("other routine verification", () => {
    assertAllow("pnpm typecheck");
    assertAllow("pnpm lint");
    assertAllow("pnpm build");
    assertAllow("pnpm engine:typecheck");
    assertAllow("pnpm engine:lint");
    assertAllow("pnpm engine:test");
    assertAllow("pnpm engine:build");
  });

  test("package-name mention of @workos-final is not a historical-repo deny", () => {
    assertAllow("pnpm --filter @workos-final/api test");
    assertAllow("rg workos-final docs/PROVENANCE.md");
    assertAllow("git log --grep=workos-final");
  });

  test("read-only Git against a historical checkout is allowed", () => {
    assertAllow("git -C C:/Users/offic/workspace/workos-final status");
    assertAllow("git -C ../workos-ui20 log -1");
    assertAllow("git -C C:/Users/offic/workspace/workos-final branch");
  });

  test("synthetic Cloud root remains engineering-only and is allowed", () => {
    assertAllow("WORKOS_CLOUD_ROOT=.tmp/workos-dev-cloud pnpm test");
  });

  test("feature-branch push without force is allowed", () => {
    assertAllow("git push origin chore/saas-canon-cursor-safety-wave-0-v1");
  });

  test("dry-run clean is allowed", () => {
    assertAllow("git clean -fdn");
  });
});

describe("deny: destructive Git", () => {
  test("git reset --hard HEAD", () => {
    assertDeny("git reset --hard HEAD");
  });

  test("git clean -fd", () => {
    assertDeny("git clean -fd");
  });

  test("git clean -fdx", () => {
    assertDeny("git clean -fdx");
  });

  test("git branch -D test", () => {
    assertDeny("git branch -D test");
  });

  test("git push --force origin main", () => {
    assertDeny("git push --force origin main");
  });

  test("git push -f and force-with-lease", () => {
    assertDeny("git push -f origin feature");
    assertDeny("git push --force-with-lease origin feature");
  });

  test("git push origin HEAD:main", () => {
    assertDeny("git push origin HEAD:main");
  });

  test("direct push to main without force", () => {
    assertDeny("git push origin main");
    assertDeny("git push origin refs/heads/main");
  });

  test("compound safe + destructive is denied", () => {
    assertDeny("git status && git reset --hard HEAD");
  });
});

describe("classify: git push destination safety", () => {
  test("explicit main and master destinations are denied", () => {
    assertDeny("git push origin main");
    assertDeny("git push origin HEAD:main");
    assertDeny("git push origin HEAD:refs/heads/main");
    assertDeny("git push origin :main");
    assertDeny("git push origin --delete main");
    assertDeny("git push --delete origin main");
    assertDeny("git push origin --delete refs/heads/main");
    assertDeny("git push origin HEAD:refs/heads/master");
  });

  test("broad --all / --mirror / --branches pushes are denied", () => {
    assertDeny("git push --all origin");
    assertDeny("git push origin --all");
    assertDeny("git push --mirror origin");
    assertDeny("git push origin --mirror");
    assertDeny("git push --branches origin");
  });

  test("ambiguous implicit and HEAD pushes require Owner review", () => {
    assertAsk("git push");
    assertAsk("git push origin");
    assertAsk("git push origin HEAD");
    assertAsk("git push -u origin HEAD");
    assertAsk("git push --set-upstream origin HEAD");
    assertAsk("git push origin HEAD~1");
  });

  test("explicit non-main feature pushes remain allowed", () => {
    assertAllow("git push origin chore/saas-canon-cursor-safety-wave-0-v1");
    assertAllow("git push -u origin chore/saas-canon-cursor-safety-wave-0-v1");
    assertAllow("git push origin HEAD:refs/heads/chore/saas-canon-cursor-safety-wave-0-v1");
  });

  test("non-main remote deletion and prune require Owner review", () => {
    assertAsk("git push --delete origin feature");
    assertAsk("git push origin --delete feature");
    assertAsk("git push origin :feature");
    assertAsk("git push --prune origin");
  });
});

describe("deny: historical repository writes", () => {
  test("destructive write targeted at workos-final", () => {
    assertDeny("git -C C:/Users/offic/workspace/workos-final reset --hard");
    assertDeny("git -C ../workos-final clean -fd");
    assertDeny("git push git@github.com:office952/workos-final.git HEAD:main");
  });

  test("cwd in historical repo plus write", () => {
    assertDeny("git commit -m ready", "C:/Users/offic/workspace/workos-ui20");
    assertDeny("cd C:/Users/offic/workspace/workos-final && git commit -m mutate");
  });
});

describe("ask: Owner-approval class", () => {
  test("pnpm ports:reclaim", () => {
    assertAsk("pnpm ports:reclaim");
  });

  test("pnpm engine:dev", () => {
    assertAsk("pnpm engine:dev");
  });

  test("cloud:backup", () => {
    assertAsk("pnpm --filter @workos-final/api cloud:backup");
  });

  test("cloud:restore", () => {
    assertAsk("pnpm --filter @workos-final/api cloud:restore -- --backup X --target Y");
  });

  test("cloud:adopt --execute", () => {
    assertAsk("pnpm --filter @workos-final/api cloud:adopt -- --execute");
  });

  test("cloud:provision and configure-providers --execute", () => {
    assertAsk("pnpm --filter @workos-final/api cloud:provision");
    assertAsk("pnpm --filter @workos-final/api cloud:configure-providers -- --execute");
  });

  test("non-synthetic WORKOS_CLOUD_ROOT assignment", () => {
    assertAsk("WORKOS_CLOUD_ROOT=C:/data/hub-media pnpm test");
    assertAsk("$env:WORKOS_CLOUD_ROOT='C:\\data\\hub-media'");
  });

  test("secret-printing examples are approval-gated", () => {
    assertAsk("cat .env");
    assertAsk("Get-Content .env");
    assertAsk("type .env");
    assertAsk("printenv");
    assertAsk("Get-Content ~/.cursor/mcp.json");
    assertAsk("git show HEAD:.env");
  });

  test("example env files are not treated as secrets", () => {
    assertAllow("cat .env.example");
  });
});

describe("hook protocol", () => {
  test("returns the official permission schema", () => {
    const allowed = decideCommand("git status");
    assert.deepEqual(Object.keys(allowed), ["permission"]);
    const denied = decideCommand("git reset --hard HEAD");
    assert.deepEqual(Object.keys(denied).sort(), ["agent_message", "permission", "user_message"]);
    assert.equal(denied.permission, PERMISSION.DENY);
  });

  test("invalid JSON is fail-closed via exit code 2", () => {
    const result = handleHookInput("not-json");
    assert.equal(result.exitCode, 2);
    assert.equal(result.body.permission, PERMISSION.DENY);
  });

  test("Windows UTF-8 BOM on stdin still parses", () => {
    const result = handleHookInput(`\uFEFF${JSON.stringify({ command: "git status", cwd: REPO_CWD, sandbox: false })}`);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.body, { permission: PERMISSION.ALLOW });
  });

  test("stdin hook payload allow path", () => {
    const spawned = spawnSync(process.execPath, [GUARD_PATH], {
      encoding: "utf8",
      input: JSON.stringify({ command: "git status", cwd: REPO_CWD, sandbox: false }),
    });
    assert.equal(spawned.status, 0, spawned.stderr);
    assert.deepEqual(JSON.parse(spawned.stdout), { permission: PERMISSION.ALLOW });
  });

  test("stdin hook payload deny path", () => {
    const spawned = spawnSync(process.execPath, [GUARD_PATH], {
      encoding: "utf8",
      input: JSON.stringify({ command: "git reset --hard HEAD", cwd: REPO_CWD, sandbox: false }),
    });
    assert.equal(spawned.status, 0, spawned.stderr);
    const body = JSON.parse(spawned.stdout);
    assert.equal(body.permission, PERMISSION.DENY);
  });
});

describe("path helpers stay scoped", () => {
  test("does not treat this implementation worktree as historical", () => {
    assertAllow("git status", path.resolve(REPO_CWD));
  });
});
