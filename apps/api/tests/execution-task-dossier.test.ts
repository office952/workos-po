import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_CODE,
  MCH_CNC_4020_ID,
  WC_CNC_ROUTING_ID,
  createWorkcenterRegistry,
  type WorkcenterRegistry,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import { completeTaskAs, sessionCookieViaHttp, startTaskAs, withCookie } from "./operator-test-helpers.js";

type JsonObject = Record<string, unknown>;

const readyValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const temps: string[] = [];
const runtimes: Array<{ close(): void }> = [];

afterEach(() => {
  for (const runtime of runtimes.splice(0)) {
    runtime.close();
  }
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createIsolatedApp(providerRegistry?: WorkcenterRegistry) {
  const dir = mkdtempSync(join(tmpdir(), "workos-dossier-"));
  temps.push(dir);
  const runtime = createProductSystemRuntime(join(dir, "product-system.sqlite"), {
    documentsRoot: join(dir, "documents"),
    ...(providerRegistry ? { providerRegistry } : {}),
  });
  runtimes.push(runtime);
  runtime.materializeTrustedWorkforce();
  return { app: createApp({ productSystem: runtime }), runtime, dir };
}

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

describe("task dossier and unique provider binding", () => {
  it("keeps observations and issues off the task state and versions files across tasks", async () => {
    const { app, runtime } = createIsolatedApp();
    const florin = runtime.listPeople().find((person) => person.displayName === "Florin CNC");
    expect(florin).toBeTruthy();
    if (!florin) {
      return;
    }
    const cookie = await sessionCookieViaHttp(app, florin.personId);
    const compiled = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues }),
      }),
    );
    const accepted = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues, reviewId: compiled.reviewId }),
      }),
    );
    const snapshot = accepted.snapshot as JsonObject;
    const created = await readBody(
      await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshot.snapshotId}/execution-plan`,
        { method: "POST" },
      ),
    );
    const view = created.executionPlan as { tasks: Array<JsonObject> };
    const backCnc = view.tasks.find(
      (item) => item.processLabel === "Debitare foaie CNC" && item.scopeLabel === "Spate",
    ) as JsonObject;
    const other = view.tasks.find((item) => item.taskId !== backCnc.taskId) as JsonObject;
    const taskId = String(backCnc.taskId);

    const before = await app.request(`/api/execution-tasks/${taskId}/observations`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ text: "Aștept dependența, nota rămâne." }),
    });
    expect(before.status).toBe(200);
    const noted = (await readBody(before)).dossier as JsonObject;
    expect((noted.observations as JsonObject[])[0]?.body).toBe("Aștept dependența, nota rămâne.");
    const stillPlanned = runtime.readExecutionPlanByTaskId(taskId);
    expect(stillPlanned?.tasks.find((item) => item.taskId === taskId)?.status).toBe("PLANNED");
    expect(stillPlanned?.tasks.find((item) => item.taskId === taskId)?.assignedProvider).toBeNull();

    const issue = await app.request(`/api/execution-tasks/${taskId}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ reason: "DRAWING", text: "Schița nu corespunde." }),
    });
    expect(issue.status).toBe(200);
    expect(runtime.readExecutionPlanByTaskId(taskId)?.tasks.find((item) => item.taskId === taskId)?.status).toBe(
      "PLANNED",
    );

    const svg = new File(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"], "sketch.svg", {
      type: "image/svg+xml",
    });
    const rejected = new FormData();
    rejected.set("file", svg);
    const badUpload = await app.request(`/api/execution-tasks/${taskId}/artifacts`, {
      method: "POST",
      headers: { cookie },
      body: rejected,
    });
    expect(badUpload.status).toBe(422);

    const pdf = new File(["%PDF-1.4"], "plan.pdf", { type: "application/pdf" });
    const upload = new FormData();
    upload.set("file", pdf);
    upload.set("purpose", "RECORD");
    upload.set("note", "Păstrat pentru evidență.");
    const stored = await app.request(`/api/execution-tasks/${taskId}/artifacts`, {
      method: "POST",
      headers: { cookie },
      body: upload,
    });
    expect(stored.status).toBe(200);
    const dossier = (await readBody(stored)).dossier as JsonObject;
    const artifactId = String((dossier.files as JsonObject[])[0]?.artifactId);
    expect((dossier.files as JsonObject[])[0]?.purpose).toBe("RECORD");
    expect((dossier.files as JsonObject[])[0]?.note).toBe("Păstrat pentru evidență.");
    expect((dossier.files as JsonObject[])[0]?.usedAt).toBeNull();
    expect(runtime.readExecutionPlanByTaskId(taskId)?.tasks.find((item) => item.taskId === taskId)?.status).toBe(
      "PLANNED",
    );
    const nextPdf = new File(["%PDF-1.5"], "plan-v2.pdf", { type: "application/pdf" });
    const version = new FormData();
    version.set("file", nextPdf);
    version.set("supersedesArtifactId", artifactId);
    const versioned = await app.request(`/api/execution-tasks/${taskId}/artifacts`, {
      method: "POST",
      headers: { cookie },
      body: version,
    });
    expect(versioned.status).toBe(200);
    const files = ((await readBody(versioned)).dossier as JsonObject).files as JsonObject[];
    expect(files.some((item) => item.supersedesArtifactId === artifactId)).toBe(true);
    expect(files.find((item) => item.artifactId === artifactId)?.sha256).not.toBe(
      files.find((item) => item.supersedesArtifactId === artifactId)?.sha256,
    );

    const linked = await app.request(`/api/execution-tasks/${other.taskId}/artifact-links`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ artifactId }),
    });
    expect(linked.status).toBe(200);
    const otherFiles = ((await readBody(linked)).dossier as JsonObject).files as JsonObject[];
    expect(otherFiles.some((item) => item.artifactId === artifactId)).toBe(true);

    const download = await app.request(`/api/execution-artifacts/${artifactId}/download`, withCookie(undefined, cookie));
    expect(download.status).toBe(200);
    expect(download.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await download.text()).toBe("%PDF-1.4");

    const otherOrg = createIsolatedApp();
    const foreign = await otherOrg.app.request(`/api/execution-artifacts/${artifactId}/download`);
    expect(foreign.status).toBe(404);

    const firstBind = await app.request(`/api/execution-tasks/${taskId}/bind-unique-provider`, {
      method: "POST",
      headers: { cookie },
    });
    const secondBind = await app.request(`/api/execution-tasks/${taskId}/bind-unique-provider`, {
      method: "POST",
      headers: { cookie },
    });
    expect(firstBind.status).toBe(200);
    expect(secondBind.status).toBe(200);
    expect((await readBody(secondBind)).alreadyApplied).toBe(true);
    const bound = runtime.readExecutionPlanByTaskId(taskId)?.tasks.find((item) => item.taskId === taskId);
    expect(bound?.assignedProvider?.id).toBe(MCH_CNC_4020_ID);
    expect(bound?.providerBindingSource).toBe("AUTO_UNIQUE");
    expect(bound?.status).toBe("PLANNED");

    const sameManual = await app.request(`/api/execution-tasks/${taskId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
    });
    expect(sameManual.status).toBe(200);
    expect((await readBody(sameManual)).alreadyApplied).toBe(true);
    expect(
      runtime.readExecutionPlanByTaskId(taskId)?.tasks.find((item) => item.taskId === taskId)?.providerBindingSource,
    ).toBe("AUTO_UNIQUE");

    const rejectedManual = await app.request(`/api/execution-tasks/${taskId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: "MCH-CNC-OTHER" }),
    });
    expect(rejectedManual.status).toBe(422);
    expect(
      runtime.readExecutionPlanByTaskId(taskId)?.tasks.find((item) => item.taskId === taskId)?.assignedProvider?.id,
    ).toBe(MCH_CNC_4020_ID);

    expect((await startTaskAs(app, taskId, cookie)).status).toBe(200);
    const during = await app.request(`/api/execution-tasks/${taskId}/observations`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ text: "Observație în timpul lucrului." }),
    });
    expect(during.status).toBe(200);
    expect(runtime.readExecutionPlanByTaskId(taskId)?.tasks.find((item) => item.taskId === taskId)?.status).toBe(
      "IN_PROGRESS",
    );

    expect((await completeTaskAs(app, taskId, cookie, { completedQuantity: 12.5 })).status).toBe(200);
    const after = await app.request(`/api/execution-tasks/${taskId}/observations`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ text: "Observație după închidere." }),
    });
    expect(after.status).toBe(200);
    const closed = runtime.readExecutionPlanByTaskId(taskId)?.tasks.find((item) => item.taskId === taskId);
    expect(closed?.status).toBe("COMPLETED");
    expect(closed?.assignedProvider?.id).toBe(MCH_CNC_4020_ID);
    expect(((await readBody(after)).dossier as JsonObject).observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ body: "Aștept dependența, nota rămâne." }),
        expect.objectContaining({ body: "Observație în timpul lucrului." }),
        expect.objectContaining({ body: "Observație după închidere." }),
      ]),
    );
    const remembered = await app.request(`/api/execution-tasks/${taskId}/dossier`, withCookie(undefined, cookie));
    const rememberedFiles = ((await readBody(remembered)).dossier as JsonObject).files as JsonObject[];
    expect(rememberedFiles.some((item) => item.artifactId === artifactId)).toBe(true);
    expect(rememberedFiles.some((item) => item.supersedesArtifactId === artifactId)).toBe(true);
    const marked = await app.request(`/api/execution-tasks/${taskId}/artifact-use`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ artifactId }),
    });
    expect(marked.status).toBe(200);
    expect(
      runtime.readExecutionPlanByTaskId(taskId)?.tasks.find((item) => item.taskId === taskId)?.status,
    ).toBe("COMPLETED");
    const used = ((await readBody(marked)).dossier as JsonObject).files as JsonObject[];
    const usedAt = used.find((item) => item.artifactId === artifactId)?.usedAt;
    expect(usedAt).toEqual(expect.any(String));
    const otherDossier = await app.request(
      `/api/execution-tasks/${String(other.taskId)}/dossier`,
      withCookie(undefined, cookie),
    );
    const otherUsed = ((await readBody(otherDossier)).dossier as JsonObject).files as JsonObject[];
    expect(otherUsed.find((item) => item.artifactId === artifactId)?.usedAt).toBeNull();
    const repeated = await app.request(`/api/execution-tasks/${taskId}/artifact-use`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ artifactId }),
    });
    expect(repeated.status).toBe(200);
    const repeatedBody = await readBody(repeated);
    expect(repeatedBody.alreadyApplied).toBe(true);
    const repeatedFiles = (repeatedBody.dossier as JsonObject).files as JsonObject[];
    expect(repeatedFiles.find((item) => item.artifactId === artifactId)?.usedAt).toBe(usedAt);
  });

  it("refuses zero or multiple providers and binds one provider once under concurrent requests", async () => {
    const none = createIsolatedApp(createWorkcenterRegistry([], []));
    const nonePlan = await createBackCnc(none.app);
    const nonePerson = none.runtime.listPeople().find((person) => person.displayName === "Florin CNC");
    expect(nonePerson).toBeTruthy();
    if (!nonePerson) {
      return;
    }
    const noneCookie = await sessionCookieViaHttp(none.app, nonePerson.personId);
    const noneBind = await none.app.request(`/api/execution-tasks/${nonePlan.taskId}/bind-unique-provider`, {
      method: "POST",
      headers: { cookie: noneCookie },
    });
    expect(noneBind.status).toBe(422);
    expect((await readBody(noneBind)).error).toBe("no_eligible_provider");
    expect(
      none.runtime.readExecutionPlanByTaskId(nonePlan.taskId)?.tasks.find((item) => item.taskId === nonePlan.taskId)
        ?.assignedProvider,
    ).toBeNull();

    const choice = createIsolatedApp(twoCncRegistry());
    const choicePlan = await createBackCnc(choice.app);
    const choicePerson = choice.runtime.listPeople().find((person) => person.displayName === "Florin CNC");
    expect(choicePerson).toBeTruthy();
    if (!choicePerson) {
      return;
    }
    const choiceCookie = await sessionCookieViaHttp(choice.app, choicePerson.personId);
    const choiceBind = await choice.app.request(`/api/execution-tasks/${choicePlan.taskId}/bind-unique-provider`, {
      method: "POST",
      headers: { cookie: choiceCookie },
    });
    expect(choiceBind.status).toBe(409);
    expect((await readBody(choiceBind)).error).toBe("explicit_provider_choice_required");
    expect(
      choice.runtime
        .readExecutionPlanByTaskId(choicePlan.taskId)
        ?.tasks.find((item) => item.taskId === choicePlan.taskId)?.assignedProvider,
    ).toBeNull();

    const unique = createIsolatedApp();
    const uniquePlan = await createBackCnc(unique.app);
    const uniquePerson = unique.runtime.listPeople().find((person) => person.displayName === "Florin CNC");
    expect(uniquePerson).toBeTruthy();
    if (!uniquePerson) {
      return;
    }
    const uniqueCookie = await sessionCookieViaHttp(unique.app, uniquePerson.personId);
    const [first, second] = await Promise.all([
      unique.app.request(`/api/execution-tasks/${uniquePlan.taskId}/bind-unique-provider`, {
        method: "POST",
        headers: { cookie: uniqueCookie },
      }),
      unique.app.request(`/api/execution-tasks/${uniquePlan.taskId}/bind-unique-provider`, {
        method: "POST",
        headers: { cookie: uniqueCookie },
      }),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const results = await Promise.all([readBody(first), readBody(second)]);
    expect(results.filter((item) => item.alreadyApplied === true)).toHaveLength(1);
    expect(
      unique.runtime
        .readExecutionPlanByTaskId(uniquePlan.taskId)
        ?.tasks.find((item) => item.taskId === uniquePlan.taskId)?.assignedProvider?.id,
    ).toBe(MCH_CNC_4020_ID);
  });
});

function twoCncRegistry(): WorkcenterRegistry {
  return createWorkcenterRegistry(
    [
      {
        id: WC_CNC_ROUTING_ID,
        label: "Zonă CNC",
        description: "Zonă",
        lifecycle: "ACTIVE",
        capabilityIds: [],
      },
    ],
    [
      {
        id: MCH_CNC_4020_ID,
        label: "CNC 4020",
        description: "Utilaj",
        workcenterId: WC_CNC_ROUTING_ID,
        lifecycle: "ACTIVE",
        capabilityIds: ["CNC_ROUTING"],
      },
      {
        id: "MCH-CNC-SECOND",
        label: "CNC secund",
        description: "Utilaj",
        workcenterId: WC_CNC_ROUTING_ID,
        lifecycle: "ACTIVE",
        capabilityIds: ["CNC_ROUTING"],
      },
    ],
  );
}

async function createBackCnc(app: ReturnType<typeof createApp>) {
  const compiled = await readBody(
    await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: readyValues }),
    }),
  );
  const accepted = await readBody(
    await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: readyValues, reviewId: compiled.reviewId }),
    }),
  );
  const snapshot = accepted.snapshot as JsonObject;
  const created = await readBody(
    await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshot.snapshotId}/execution-plan`,
      { method: "POST" },
    ),
  );
  const view = created.executionPlan as { tasks: Array<JsonObject> };
  const backCnc = view.tasks.find(
    (item) => item.processLabel === "Debitare foaie CNC" && item.scopeLabel === "Spate",
  ) as JsonObject;
  return { taskId: String(backCnc.taskId) };
}
