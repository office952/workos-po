import {
  provisionNewOrganization,
  resumeOrganizationProvision,
} from "../src/cloud/provision.js";

const mode = process.env.WORKOS_PROVISION_WORKER_MODE;
const cloudRoot = process.env.WORKOS_PROVISION_WORKER_ROOT;
const email = process.env.WORKOS_PROVISION_WORKER_EMAIL;
const password = process.env.WORKOS_PROVISION_WORKER_PASSWORD;
const organizationId = process.env.WORKOS_PROVISION_WORKER_ORG_ID;
const displayName = process.env.WORKOS_PROVISION_WORKER_ORG_NAME;

if (!mode || !cloudRoot || !email || !password) {
  process.stderr.write("missing worker environment\n");
  process.exit(1);
}

try {
  if (mode === "resume") {
    if (!organizationId) {
      throw new Error("missing organization id");
    }
    const result = await resumeOrganizationProvision({
      cloudRoot,
      organizationId,
      email,
      password,
      env: { NODE_ENV: "test" },
    });
    process.stdout.write(
      JSON.stringify({
        protocol: "workos-provision-worker-v1",
        ok: true,
        alreadyActive: result.alreadyActive,
        userId: result.user.userId,
        email: result.user.email,
      }),
    );
  } else if (mode === "create") {
    const result = await provisionNewOrganization({
      cloudRoot,
      displayName: displayName ?? "Worker Org",
      email,
      password,
      bootstrapPolicy: "SYNTHETIC_TEST",
      env: { NODE_ENV: "test" },
    });
    process.stdout.write(
      JSON.stringify({
        protocol: "workos-provision-worker-v1",
        ok: true,
        organizationId: result.organization.organizationId,
        alreadyActive: result.alreadyActive,
        email: result.user.email,
      }),
    );
  } else {
    throw new Error(`unknown mode:${mode}`);
  }
} catch (error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  process.stdout.write(
    JSON.stringify({
      protocol: "workos-provision-worker-v1",
      ok: false,
      code,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 2;
}
