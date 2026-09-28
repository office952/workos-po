import { fileURLToPath } from "node:url";
import {
  ensureOwnerReviewProvisioned,
  OwnerReviewResetError,
  readOwnerReviewIdentity,
  resetOwnerReviewRoot,
} from "./ownerReviewReset.js";
import {
  createOperatorFetchClient,
  loginFetchSeedClient,
} from "./ownerReviewHttp.js";
import { seedOwnerReviewDataset } from "./ownerReviewSeed.js";
import { ensureOwnerReviewUsers } from "./ownerReviewUsers.js";
import {
  OWNER_REVIEW_ORG_NAME,
  OWNER_REVIEW_OWNER_EMAIL,
} from "./ownerReviewIdentity.js";

function readArg(argv: readonly string[], name: string): string {
  const index = argv.indexOf(`--${name}`);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing --${name}`);
  }
  return value;
}

function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

/**
 * pnpm/npm on Windows shell may forward a literal "--" before the command.
 * Strip those so Owner-facing reset/provision/seed resolve the real verb.
 */
function normalizeOwnerReviewArgv(argv: readonly string[]): string[] {
  const normalized = [...argv];
  while (normalized.length > 2 && normalized[2] === "--") {
    normalized.splice(2, 1);
  }
  return normalized;
}

function fail(code: string, detail?: string): never {
  console.error(detail ? `${code}: ${detail}` : code);
  process.exit(1);
}

export async function runOwnerReviewSeedCli(
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (env.NODE_ENV === "production") {
    fail("owner_review_production_refused");
  }
  const args = normalizeOwnerReviewArgv(argv);
  const command = args[2] ?? "help";
  try {
    if (command === "provision") {
      const root = readArg(args, "root");
      const result = await ensureOwnerReviewProvisioned({ cloudRoot: root, env });
      console.log("OWNER_REVIEW_PROVISIONED = YES");
      console.log(`organization: ${result.identity.organization}`);
      console.log(`organizationId: ${result.organizationId}`);
      console.log(`bootstrapPolicy: ${result.identity.bootstrapPolicy}`);
      console.log(`email: ${result.identity.email}`);
      console.log(`alreadyActive: ${result.alreadyActive ? "YES" : "NO"}`);
      return;
    }
    if (command === "reset") {
      if (hasFlag(args, "organization-id") || hasFlag(args, "org")) {
        fail(
          "owner_review_reset_refused",
          "Reset never accepts --organization-id or --org. It rebuilds the isolated synthetic reference root only.",
        );
      }
      const root = readArg(args, "root");
      const result = await resetOwnerReviewRoot({ cloudRoot: root, env });
      console.log("OWNER_REVIEW_RESET = YES");
      console.log(`root: ${result.cloudRoot}`);
      console.log(`organization: ${result.identity.organization}`);
      console.log(`organizationId: ${result.organizationId}`);
      console.log(`bootstrapPolicy: ${result.identity.bootstrapPolicy}`);
      console.log(`users: ${result.users.users.map((item) => item.email).join(", ")}`);
      console.log("SYNTHETIC_ONLY = YES");
      console.log("REAL_DATA = NO");
      return;
    }
    if (command === "seed") {
      const root = readArg(args, "root");
      const baseUrl = readArg(args, "base-url").replace(/\/$/, "");
      const identity = readOwnerReviewIdentity(root);
      if (!identity) {
        fail("owner_review_identity_missing", root);
      }
      await ensureOwnerReviewUsers({
        cloudRoot: root,
        password: identity.password,
      });
      const cloud = await loginFetchSeedClient({
        baseUrl,
        email: identity.email,
        password: identity.password,
        organizationId: identity.organizationId,
      });
      const report = await seedOwnerReviewDataset({
        client: cloud,
        createOperatorClient: async (personId, pin) =>
          createOperatorFetchClient({
            baseUrl,
            cloudCookie: (cloud as { jar: { cookie: string } }).jar.cookie,
            personId,
            pin,
          }),
      });
      console.log("OWNER_REVIEW_DATASET_SEEDED = YES");
      console.log("SYNTHETIC_REFERENCE_DATA = YES");
      console.log("DIRECT_SQL_SEED = NO");
      console.log(`organization: ${OWNER_REVIEW_ORG_NAME}`);
      console.log(`owner: ${OWNER_REVIEW_OWNER_EMAIL}`);
      console.log(`customers: ${report.customers}`);
      console.log(`requests: ${report.requests}`);
      console.log(`quotesFrozen: ${report.quotesFrozen}`);
      console.log(`quotesAccepted: ${report.quotesAccepted}`);
      console.log(`jobsReleased: ${report.jobsReleased}`);
      console.log(`assemblies: ${report.assemblies}`);
      console.log(`people: ${report.people}`);
      console.log(`machines: ${report.machines}`);
      console.log(
        `scenarioA: ${report.scenarioA.customer} / ${report.scenarioA.requestTitle} / ${report.scenarioA.assemblyId}`,
      );
      console.log(
        `tasks: planned=${report.tasksPlanned} blocked=${report.tasksBlocked} inProgress=${report.tasksInProgress} completed=${report.tasksCompleted}`,
      );
      return;
    }
    if (command === "help" || command === "--help") {
      console.log("Usage:");
      console.log("  owner-review provision --root <synthetic-root>");
      console.log("  owner-review reset --root <synthetic-root>");
      console.log("  owner-review seed --root <synthetic-root> --base-url <url>");
      return;
    }
    fail("owner_review_unknown_command", command);
  } catch (error) {
    if (error instanceof OwnerReviewResetError) {
      fail(`owner_review_reset_refused:${error.code}`, error.message);
    }
    throw error;
  }
}

const invokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1] ||
    process.argv[1].replaceAll("\\", "/").endsWith("ownerReviewSeedCli.ts")
  : false;

if (invokedDirectly) {
  await runOwnerReviewSeedCli();
}
