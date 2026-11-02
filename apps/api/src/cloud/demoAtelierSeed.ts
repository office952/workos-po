import { buildDemoFile, type DemoFileKey } from "./demoAtelierFiles.js";
import type { DemoTransport } from "./demoAtelierHttp.js";
import {
  DEMO_CUSTOMERS,
  DEMO_EXTRA_SKILLS,
  DEMO_MACHINES,
  DEMO_PEOPLE,
  DEMO_WORKCENTERS,
  demoAcmValues,
  demoLettersValues,
  type DemoPersonKey,
} from "./demoAtelierIdentity.js";
import type { DemoLedger } from "./demoAtelierLedger.js";
import type { DemoSecrets } from "./demoAtelierSecrets.js";
import {
  ACM,
  LETTERS,
  acceptAndOrder,
  ensureAssemblyScenarioA,
  ensureRequest,
  ensureSeller,
  freezeQuote,
  quotesForRequest,
  releaseAndPlan,
  requireOk,
  type SeedHttpClient,
} from "./ownerReviewSeed.js";

export type DemoPlanKey = "nord" | "alpha" | "meadow" | "orbit";

export type DemoTask = {
  taskId: string;
  processId: string;
  processLabel: string;
  scope: string;
  scopeLabel: string;
  seqLabel: string;
  status: string;
  dependsOnTaskIds: string[];
  requiredCapabilityId: string;
  requiresProvider?: boolean;
  assignedProvider?: { id: string; label: string } | null;
  assignedExecutor?: { id: string; label: string } | null;
  plannedEffortMinutes?: number | null;
  eligibleProviders?: Array<{ id: string; label: string }>;
  eligibleExecutors?: Array<{ id: string; label: string }>;
  requiresCompletedQuantity?: boolean;
  measurableQuantity?: { plannedQuantity?: number | null; unit?: string } | null;
  quantities?: { planned?: number | null } | null;
  participants?: Array<{ personId: string; label: string; active: boolean }>;
  activeMachineRun?: { machineRunId: string } | null;
  qualityControl?: unknown;
};

export type DemoPrepareReport = {
  people: number;
  customers: number;
  requests: number;
  quotes: number;
  acceptedQuotes: number;
  jobs: number;
  releasedPlans: Record<DemoPlanKey, string | null>;
  applied: string[];
  skipped: string[];
  refusals: string[];
};

type Ctx = {
  secrets: DemoSecrets;
  t: DemoTransport;
  c: SeedHttpClient;
  ledger: DemoLedger;
  report: DemoPrepareReport;
  log: (line: string) => void;
};

/** Credible planned minutes per process; planning data only, never measured labor. */
const PLANNED_MINUTES: Record<string, number> = {
  CUT_SHEET_CNC: 75,
  FORM_ALUMINIUM_PROFILE: 150,
  APPLY_SURFACE_FINISH: 60,
  PLACE_LED_MODULES: 60,
  WIRE_LIGHTING: 45,
  INSTALL_OR_CONNECT_PSU: 30,
  TEST_LIGHTING_IGNITION: 20,
  BOND_LETTER_BODY: 90,
  CLOSE_LETTER_BODY: 60,
  TEST_ILLUMINATION_UNIFORMITY: 25,
  INSPECT_FINISHED_LETTER: 30,
  INSPECT_FINISHED_ASSEMBLY: 40,
  PACK_PRODUCT: 40,
  CUT_METAL_STOCK: 50,
  FORM_SHEET_CASSETTE: 120,
  ATTACH_INTERNAL_FRAME: 90,
  MOUNT_LETTERS_ON_PANEL: 100,
  PAINT_RAL: 120,
};

/** Who is planned for each capability, per job. Eligibility is still decided by the server. */
const PLANNED_EXECUTOR: Record<DemoPlanKey, Partial<Record<string, DemoPersonKey>>> = {
  alpha: {
    CNC_ROUTING: "cnc1",
    PROFILE_FORMING: "cant",
    ELECTRICAL_ASSEMBLY: "electric",
    MANUAL_ASSEMBLY: "assembly1",
    QUALITY_CONTROL: "quality",
    PACKAGING: "assembly2",
  },
  nord: {
    CNC_ROUTING: "cnc1",
    PROFILE_FORMING: "cant",
    METAL_CUTTING: "weldSteel",
    ELECTRICAL_ASSEMBLY: "electric",
    MANUAL_ASSEMBLY: "assembly1",
    QUALITY_CONTROL: "quality",
    PACKAGING: "assembly2",
  },
  meadow: {
    CNC_ROUTING: "cnc2",
    PROFILE_FORMING: "weldAlu",
    VINYL_APPLICATION: "finish",
    PAINTING: "finish",
    ELECTRICAL_ASSEMBLY: "electric",
    MANUAL_ASSEMBLY: "assembly2",
    QUALITY_CONTROL: "quality",
    PACKAGING: "assembly2",
  },
  orbit: {
    CNC_ROUTING: "cnc2",
    METAL_CUTTING: "weldSteel",
    MANUAL_ASSEMBLY: "assembly2",
    QUALITY_CONTROL: "quality",
    PACKAGING: "assembly2",
  },
};

const PROVIDER_PREFERENCE: Record<DemoPlanKey, Partial<Record<string, string>>> = {
  alpha: { MANUAL_ASSEMBLY: "Masă asamblare 1" },
  nord: { MANUAL_ASSEMBLY: "Masă asamblare 1" },
  meadow: { MANUAL_ASSEMBLY: "Masă asamblare 2" },
  orbit: { MANUAL_ASSEMBLY: "Masă asamblare 2" },
};

const DEFAULT_PROVIDER: Partial<Record<string, string>> = {
  CNC_ROUTING: "CNC 4020",
  PROFILE_FORMING: "CNC Cant Litere",
  METAL_CUTTING: "Debitator metale",
  ELECTRICAL_ASSEMBLY: "Montaj LED / electric",
  VINYL_APPLICATION: "Zonă aplicare folie",
  PAINTING: "Cabină vopsire",
};

function enc(value: string): string {
  return encodeURIComponent(value);
}

async function once(ctx: Ctx, key: string, apply: () => Promise<string | void>): Promise<void> {
  if (ctx.ledger.has(key)) {
    ctx.report.skipped.push(key);
    return;
  }
  const detail = await apply();
  ctx.ledger.mark(key, detail ?? undefined);
  ctx.report.applied.push(key);
  ctx.log(`applied ${key}${detail ? ` (${detail})` : ""}`);
}

async function ensureSkills(ctx: Ctx): Promise<Map<string, string>> {
  const listed = await ctx.c.request("GET", "/api/people/skills");
  const skills = (listed.body?.skills as Array<{ skillId: string; code: string }>) ?? [];
  const byCode = new Map(skills.map((item) => [item.code, item.skillId]));
  for (const skill of DEMO_EXTRA_SKILLS) {
    if (byCode.has(skill.code)) {
      continue;
    }
    await once(ctx, `skill:${skill.code}`, async () => {
      const created = await requireOk(
        await ctx.c.request("POST", "/api/people/skills", skill),
        `skill:${skill.code}`,
      );
      const id = (created.skill as { skillId: string }).skillId;
      byCode.set(skill.code, id);
      return id;
    });
  }
  return byCode;
}

type ProviderAdmin = {
  workcenters: Array<{ id: string; label: string }>;
  machines: Array<{ id: string; label: string }>;
};

async function readProviders(ctx: Ctx): Promise<ProviderAdmin> {
  const admin = await ctx.c.request("GET", "/api/workcenters");
  return {
    workcenters: (admin.body?.workcenters as ProviderAdmin["workcenters"]) ?? [],
    machines: (admin.body?.machines as ProviderAdmin["machines"]) ?? [],
  };
}

/** Creates missing resources only; never changes the lifecycle of an existing one. */
async function ensureResources(ctx: Ctx): Promise<void> {
  let admin = await readProviders(ctx);
  const workcenterIds = new Map<string, string>();
  for (const wc of DEMO_WORKCENTERS) {
    const existing = admin.workcenters.find((item) => item.label === wc.label);
    if (existing) {
      workcenterIds.set(wc.key, existing.id);
      ctx.ledger.setId(`workcenter:${wc.key}`, existing.id);
      continue;
    }
    await once(ctx, `workcenter:${wc.key}`, async () => {
      const created = await requireOk(
        await ctx.c.request("POST", "/api/workcenters", {
          label: wc.label,
          lifecycle: "ACTIVE",
          capabilityIds: wc.capabilityIds,
        }),
        `workcenter:${wc.label}`,
      );
      const id = (created.workcenter as { id: string }).id;
      workcenterIds.set(wc.key, id);
      ctx.ledger.setId(`workcenter:${wc.key}`, id);
      return id;
    });
  }
  admin = await readProviders(ctx);
  for (const machine of DEMO_MACHINES) {
    const existing = admin.machines.find((item) => item.label === machine.label);
    if (existing) {
      ctx.ledger.setId(`machine:${machine.key}`, existing.id);
      continue;
    }
    const workcenterId = workcenterIds.get(machine.workcenterKey) ?? ctx.ledger.id(`workcenter:${machine.workcenterKey}`);
    if (!workcenterId) {
      ctx.report.refusals.push(`machine:${machine.key}:workcenter_missing`);
      continue;
    }
    await once(ctx, `machine:${machine.key}`, async () => {
      const created = await requireOk(
        await ctx.c.request("POST", "/api/machines", {
          label: machine.label,
          workcenterId,
          lifecycle: "ACTIVE",
          capabilityIds: machine.capabilityIds,
        }),
        `machine:${machine.label}`,
      );
      const id = (created.machine as { id: string }).id;
      ctx.ledger.setId(`machine:${machine.key}`, id);
      return id;
    });
  }
}

type PeoplePayload = {
  people: Array<{ personId: string; displayName: string }>;
  registry?: { people?: Array<{ personId: string; operatorPinConfigured?: boolean }> };
};

async function ensurePeople(ctx: Ctx, skillIds: Map<string, string>): Promise<Map<DemoPersonKey, string>> {
  const ids = new Map<DemoPersonKey, string>();
  let listed = (await ctx.c.request("GET", "/api/people")).body as PeoplePayload;
  for (const person of DEMO_PEOPLE) {
    const known = ctx.ledger.id(`person:${person.key}`);
    let existing =
      listed.people.find((item) => item.personId === known) ??
      listed.people.find((item) => item.displayName === person.displayName);
    if (!existing && ctx.ledger.has(`person:${person.key}`)) {
      // Created earlier and since removed or renamed by the Owner: do not recreate.
      ctx.report.skipped.push(`person:${person.key}:not_recreated`);
      continue;
    }
    if (!existing) {
      await once(ctx, `person:${person.key}`, async () => {
        const created = await requireOk(
          await ctx.c.request("POST", "/api/people", {
            displayName: person.displayName,
            roleLabel: person.roleLabel,
          }),
          `person:${person.displayName}`,
        );
        existing = created.person as { personId: string; displayName: string };
        return existing.personId;
      });
    } else if (!ctx.ledger.has(`person:${person.key}`)) {
      ctx.ledger.mark(`person:${person.key}`, `recovered:${existing.personId}`);
      ctx.report.applied.push(`person:${person.key}:recovered`);
    }
    if (!existing) {
      continue;
    }
    ids.set(person.key, existing.personId);
    ctx.ledger.setId(`person:${person.key}`, existing.personId);
    for (const code of person.skillCodes) {
      const skillId = skillIds.get(code);
      if (!skillId) {
        ctx.report.refusals.push(`person:${person.key}:skill_unknown:${code}`);
        continue;
      }
      await once(ctx, `person:${person.key}:skill:${code}`, async () => {
        const assigned = await ctx.c.request(
          "POST",
          `/api/people/${enc(existing!.personId)}/skills`,
          { skillId },
        );
        if (!assigned.ok && assigned.status !== 409) {
          throw new Error(`skill_assign:${person.key}:${code}:${assigned.body?.error ?? assigned.status}`);
        }
        return assigned.ok ? "assigned" : "already_assigned";
      });
    }
    listed = (await ctx.c.request("GET", "/api/people")).body as PeoplePayload;
    const pinConfigured = listed.registry?.people?.find(
      (item) => item.personId === existing!.personId,
    )?.operatorPinConfigured;
    if (!pinConfigured) {
      await once(ctx, `person:${person.key}:pin`, async () => {
        await requireOk(
          await ctx.c.request("PUT", `/api/people/${enc(existing!.personId)}/operator-pin`, {
            pin: ctx.secrets.operatorPin(person.key),
            confirmPin: ctx.secrets.operatorPin(person.key),
          }),
          `pin:${person.key}`,
        );
      });
    } else if (!ctx.ledger.has(`person:${person.key}:pin`)) {
      ctx.ledger.mark(`person:${person.key}:pin`, "already_configured");
    }
  }
  return ids;
}

type CustomerRow = { customerId: string; displayName: string } & Record<string, unknown>;

async function ensureCustomers(ctx: Ctx): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const listed = await ctx.c.request("GET", "/api/customers");
  const customers = (listed.body?.customers as CustomerRow[]) ?? [];
  for (const customer of DEMO_CUSTOMERS) {
    const known = ctx.ledger.id(`customer:${customer.key}`);
    let existing =
      customers.find((item) => item.customerId === known) ??
      customers.find((item) => item.displayName === customer.displayName);
    if (!existing && !ctx.ledger.has(`customer:${customer.key}`)) {
      await once(ctx, `customer:${customer.key}`, async () => {
        const profile = Object.fromEntries(
          Object.entries(customer.profile).filter(([, value]) => value !== null),
        );
        const created = await requireOk(
          await ctx.c.request("POST", "/api/customers", { displayName: customer.displayName, ...profile }),
          `customer:${customer.displayName}`,
        );
        existing = created.customer as CustomerRow;
        for (const field of Object.keys(profile)) {
          ctx.ledger.mark(`customer:${customer.key}:field:${field}`, "on_create");
        }
        return existing.customerId;
      });
    }
    if (!existing) {
      ctx.report.skipped.push(`customer:${customer.key}:not_recreated`);
      continue;
    }
    ids.set(customer.key, existing.customerId);
    ctx.ledger.setId(`customer:${customer.key}`, existing.customerId);
    if (!ctx.ledger.has(`customer:${customer.key}`)) {
      ctx.ledger.mark(`customer:${customer.key}`, `recovered:${existing.customerId}`);
    }
    // Fill a field only while it is empty and was never filled by this preparer.
    const patch: Record<string, string> = {};
    for (const [field, value] of Object.entries(customer.profile)) {
      const key = `customer:${customer.key}:field:${field}`;
      if (value === null || ctx.ledger.has(key)) {
        continue;
      }
      if (existing[field] === null || existing[field] === undefined || existing[field] === "") {
        patch[field] = value;
      }
      ctx.ledger.mark(key, existing[field] ? "kept_existing" : "filled");
    }
    if (Object.keys(patch).length > 0) {
      await requireOk(
        await ctx.c.request("PATCH", `/api/customers/${enc(existing.customerId)}`, patch),
        `customer_patch:${customer.key}`,
      );
      ctx.report.applied.push(`customer:${customer.key}:filled:${Object.keys(patch).join(",")}`);
    }
  }
  return ids;
}

async function attachToRequest(
  ctx: Ctx,
  key: string,
  requestId: string,
  file: DemoFileKey,
): Promise<void> {
  await once(ctx, key, async () => {
    const upload = await buildDemoFile(file);
    const created = await ctx.t.upload(`/api/requests/${enc(requestId)}/attachments`, {}, upload);
    if (!created.ok) {
      throw new Error(`${key}:${created.body?.error ?? created.status}`);
    }
    return (created.body?.attachment as { attachmentId?: string } | undefined)?.attachmentId;
  });
}

export async function readPlanTasks(c: SeedHttpClient, planId: string): Promise<DemoTask[]> {
  const response = await c.request("GET", `/api/execution-plans/${enc(planId)}`);
  return ((response.body?.executionPlan as { tasks?: DemoTask[] } | undefined)?.tasks) ?? [];
}

/**
 * Stable task key: plan key, sequence label and process. The sequence is frozen
 * with the plan; scope alone is not unique (an assembly has two letter CNC cuts).
 */
export function demoTaskKey(plan: DemoPlanKey, task: Pick<DemoTask, "processId" | "seqLabel">): string {
  return `${plan}:${task.seqLabel}:${task.processId}`;
}

async function preparePlan(
  ctx: Ctx,
  plan: DemoPlanKey,
  planId: string,
  people: Map<DemoPersonKey, string>,
): Promise<void> {
  const tasks = await readPlanTasks(ctx.c, planId);
  for (const task of tasks) {
    const key = demoTaskKey(plan, task);
    if (task.plannedEffortMinutes == null) {
      await once(ctx, `task:${key}:planned-effort`, async () => {
        const minutes = PLANNED_MINUTES[task.processId] ?? 60;
        await requireOk(
          await ctx.c.request("POST", `/api/execution-tasks/${enc(task.taskId)}/planned-effort`, {
            plannedEffortMinutes: minutes,
          }),
          `planned_effort:${key}`,
        );
        return String(minutes);
      });
    }
    if (task.requiresProvider && !task.assignedProvider) {
      await once(ctx, `task:${key}:provider`, async () => {
        const wanted =
          PROVIDER_PREFERENCE[plan][task.requiredCapabilityId] ??
          DEFAULT_PROVIDER[task.requiredCapabilityId];
        const provider =
          task.eligibleProviders?.find((item) => item.label === wanted) ??
          task.eligibleProviders?.[0];
        if (!provider) {
          ctx.report.refusals.push(`task:${key}:no_eligible_provider`);
          return "no_eligible_provider";
        }
        const assigned = await ctx.c.request("POST", `/api/execution-tasks/${enc(task.taskId)}/provider`, {
          providerId: provider.id,
        });
        if (!assigned.ok) {
          ctx.report.refusals.push(`task:${key}:provider:${assigned.body?.error ?? assigned.status}`);
          return `refused:${assigned.body?.error ?? assigned.status}`;
        }
        return provider.label;
      });
    }
    const personKey = PLANNED_EXECUTOR[plan][task.requiredCapabilityId];
    const personId = personKey ? people.get(personKey) : undefined;
    if (personId && !task.assignedExecutor && task.status === "PLANNED") {
      await once(ctx, `task:${key}:executor`, async () => {
        const assigned = await ctx.c.request("POST", `/api/execution-tasks/${enc(task.taskId)}/executor`, {
          personId,
        });
        if (!assigned.ok) {
          ctx.report.refusals.push(`task:${key}:executor:${assigned.body?.error ?? assigned.status}`);
          return `refused:${assigned.body?.error ?? assigned.status}`;
        }
        return personKey;
      });
    }
  }
}

async function jobIdForPlan(ctx: Ctx, planId: string): Promise<string | null> {
  const jobs = await ctx.c.request("GET", "/api/jobs");
  const rows = ((jobs.body?.overview as { jobs?: Array<{ jobId: string; planId?: string | null }> })?.jobs) ?? [];
  return rows.find((item) => item.planId === planId)?.jobId ?? null;
}

type JobFileSpec = {
  key: string;
  file: DemoFileKey;
  purpose: string;
  note: string;
  supersedes?: string;
  linkTo: Array<{ processId: string; scope?: string }>;
};

async function ensureJobFiles(
  ctx: Ctx,
  plan: DemoPlanKey,
  planId: string,
  specs: readonly JobFileSpec[],
): Promise<void> {
  const jobId = await jobIdForPlan(ctx, planId);
  if (!jobId) {
    ctx.report.refusals.push(`files:${plan}:job_missing`);
    return;
  }
  const tasks = await readPlanTasks(ctx.c, planId);
  for (const spec of specs) {
    const fileKey = `file:${plan}:${spec.key}`;
    await once(ctx, fileKey, async () => {
      const upload = await buildDemoFile(spec.file);
      const supersedes = spec.supersedes ? ctx.ledger.id(`file:${plan}:${spec.supersedes}`) : undefined;
      const created = await ctx.t.upload(
        `/api/jobs/${enc(jobId)}/files`,
        {
          purpose: spec.purpose,
          note: spec.note,
          ...(supersedes ? { supersedesArtifactId: supersedes } : {}),
        },
        upload,
      );
      if (!created.ok) {
        throw new Error(`${fileKey}:${created.body?.error ?? created.status}`);
      }
      const archive = created.body?.archive as { files?: Array<{ artifactId: string; originalFileName?: string; createdAt?: string }> } | undefined;
      const artifactId =
        (created.body?.artifact as { artifactId?: string } | undefined)?.artifactId ??
        archive?.files
          ?.filter((item) => item.originalFileName === upload.name)
          .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))[0]?.artifactId;
      if (!artifactId) {
        throw new Error(`${fileKey}:artifact_id_missing`);
      }
      ctx.ledger.setId(fileKey, artifactId);
      return artifactId;
    });
    const artifactId = ctx.ledger.id(fileKey);
    if (!artifactId) {
      continue;
    }
    for (const link of spec.linkTo) {
      const targets = tasks.filter(
        (task) => task.processId === link.processId && (!link.scope || task.scope.endsWith(link.scope)),
      );
      for (const task of targets) {
        await once(ctx, `${fileKey}:link:${demoTaskKey(plan, task)}`, async () => {
          const linked = await ctx.c.request("POST", `/api/jobs/${enc(jobId)}/file-links`, {
            artifactId,
            taskId: task.taskId,
          });
          if (!linked.ok && linked.status !== 409) {
            ctx.report.refusals.push(`${fileKey}:link:${linked.body?.error ?? linked.status}`);
            return `refused:${linked.body?.error ?? linked.status}`;
          }
        });
      }
    }
  }
}

/** Second quote on the same request: a commercial revision through the canonical routes. */
async function ensureQuoteRevision(
  ctx: Ctx,
  customerId: string,
  requestId: string,
): Promise<void> {
  await once(ctx, "scenario:delta:quote-revision", async () => {
    const existing = await quotesForRequest(ctx.c, requestId);
    if (existing.length >= 2) {
      return "already_two";
    }
    const values = demoLettersValues("DELTA", { faceVinylColor: "Roșu RAL 3020" });
    const previewed = await requireOk(
      await ctx.c.request("POST", `/api/products/${LETTERS}/preview`, { values, requestId }),
      "delta_revision_preview",
    );
    const priced = await requireOk(
      await ctx.c.request("POST", `/api/products/${LETTERS}/confirm`, {
        values,
        reviewId: previewed.reviewId,
        requestId,
        manualProductNetPrice: 650,
      }),
      "delta_revision_confirm",
    );
    const disclosure = priced.rateAcknowledgement as { status?: unknown; bindingHash?: unknown } | null | undefined;
    const frozen = await ctx.c.request("POST", `/api/products/${LETTERS}/quote-snapshots`, {
      values,
      reviewId: previewed.reviewId,
      customerId,
      requestId,
      manualProductNetPrice: 650,
      ...(disclosure?.status === "REQUIRED" && typeof disclosure.bindingHash === "string"
        ? { rateAcknowledgement: { bindingHash: disclosure.bindingHash } }
        : {}),
    });
    if (!frozen.ok) {
      ctx.report.refusals.push(`scenario:delta:quote-revision:${frozen.body?.error ?? frozen.status}`);
      return `refused:${frozen.body?.error ?? frozen.status}`;
    }
    return (frozen.body?.quoteSnapshot as { quoteSnapshotId?: string } | undefined)?.quoteSnapshotId;
  });
}

/**
 * Prepares the N-019 demo atelier through canonical HTTP routes. Repeatable:
 * entities are recognized by stable keys/names, gaps are filled, and steps
 * recorded in the ledger are never re-applied. Never starts or completes work;
 * measured participation comes only from the live demo cycle.
 */
export async function prepareDemoAtelier(input: {
  transport: DemoTransport;
  ledger: DemoLedger;
  /** Local per-root operator PINs; set once per person, never regenerated here. */
  secrets: DemoSecrets;
  log?: (line: string) => void;
  /** "setup": registry only (seller, skills, resources, people, customers), no commercial flow. */
  phase?: "setup" | "all";
}): Promise<DemoPrepareReport> {
  const report: DemoPrepareReport = {
    people: 0,
    customers: 0,
    requests: 0,
    quotes: 0,
    acceptedQuotes: 0,
    jobs: 0,
    releasedPlans: { nord: null, alpha: null, meadow: null, orbit: null },
    applied: [],
    skipped: [],
    refusals: [],
  };
  const ctx: Ctx = {
    secrets: input.secrets,
    t: input.transport,
    c: input.transport.client,
    ledger: input.ledger,
    report,
    log: input.log ?? (() => {}),
  };

  await ensureSeller(ctx.c);
  const skillIds = await ensureSkills(ctx);
  await ensureResources(ctx);
  const people = await ensurePeople(ctx, skillIds);
  const customers = await ensureCustomers(ctx);
  if (input.phase === "setup") {
    return report;
  }
  const cid = (key: string): string => {
    const id = customers.get(key);
    if (!id) {
      throw new Error(`customer_missing:${key}`);
    }
    return id;
  };

  // Nord — full assembly spine, released; plus an early second request.
  const nordRequest = await ensureRequest(
    ctx.c,
    cid("nord"),
    "Semnalistică fațadă magazin — Cluj",
    "Panou ACM casetat + litere volumetrice front-lit pentru fațada magazinului Nord Market Demo din Cluj. Date sintetice N-019.",
  );
  await attachToRequest(ctx, "attachment:nord:brief", nordRequest.requestId, "nordBrief");
  await attachToRequest(ctx, "attachment:nord:photo", nordRequest.requestId, "nordFacadePhoto");
  const nordAssembly = await ensureAssemblyScenarioA(ctx.c, cid("nord"), nordRequest.requestId);
  report.releasedPlans.nord = nordAssembly.planId;
  await ensureRequest(
    ctx.c,
    cid("nord"),
    "Totem exterior parcare — Cluj",
    "A doua cerere Nord Market: totem luminos la intrarea în parcare. Fără ofertă încă.",
  );

  // Alpha — letters accepted and released (finished during the demo cycle) + an open second quote.
  const alphaRequest = await ensureRequest(
    ctx.c,
    cid("alpha"),
    "Litere volumetrice recepție Alpha",
    "Litere volumetrice frontlit pentru recepția Alpha Clima Demo. Date sintetice N-019.",
  );
  const alphaQuote = await freezeQuote(ctx.c, LETTERS, demoLettersValues("ALPHA"), cid("alpha"), alphaRequest.requestId);
  const alphaOrder = await acceptAndOrder(ctx.c, LETTERS, String(alphaQuote.quoteSnapshotId));
  report.releasedPlans.alpha = (await releaseAndPlan(ctx.c, LETTERS, alphaOrder.orderSnapshotId)).planId;
  const alphaSecond = await ensureRequest(
    ctx.c,
    cid("alpha"),
    "Casetă luminoasă depozit Alpha",
    "Casetă ACM pentru depozitul Alpha Clima. Ofertă trimisă, fără răspuns.",
  );
  await freezeQuote(ctx.c, ACM, demoAcmValues("ALPHA DEPOZIT", 3000, 700), cid("alpha"), alphaSecond.requestId);

  // Meadow (incomplete customer) — vinyl face + painted volume, released.
  const meadowRequest = await ensureRequest(
    ctx.c,
    cid("meadow"),
    "Meniu luminos Meadow",
    "Litere luminoase cu față colantată și volum vopsit pentru Meadow Café Demo.",
  );
  const meadowQuote = await freezeQuote(
    ctx.c,
    LETTERS,
    demoLettersValues("MEADOW", { faceVinylColor: "Verde sintetic", volumePaintColor: "RAL 9005" }),
    cid("meadow"),
    meadowRequest.requestId,
  );
  const meadowOrder = await acceptAndOrder(ctx.c, LETTERS, String(meadowQuote.quoteSnapshotId));
  report.releasedPlans.meadow = (await releaseAndPlan(ctx.c, LETTERS, meadowOrder.orderSnapshotId)).planId;

  // Orbit — ACM cassette released (metal cutting, CNC, cassette forming).
  const orbitRequest = await ensureRequest(
    ctx.c,
    cid("orbit"),
    "Semnalizare showroom Orbit",
    "Casetă ACM pentru showroom Orbit Auto Demo.",
  );
  const orbitQuote = await freezeQuote(ctx.c, ACM, demoAcmValues("ORBIT AUTO"), cid("orbit"), orbitRequest.requestId);
  const orbitOrder = await acceptAndOrder(ctx.c, ACM, String(orbitQuote.quoteSnapshotId));
  report.releasedPlans.orbit = (await releaseAndPlan(ctx.c, ACM, orbitOrder.orderSnapshotId)).planId;

  // Urban — accepted, order created, not released (pregătită pentru eliberare).
  const urbanRequest = await ensureRequest(
    ctx.c,
    cid("urban"),
    "Litere volumetrice fațadă Urban",
    "Litere volumetrice pentru fațada Urban Pharma Demo.",
  );
  const urbanQuote = await freezeQuote(ctx.c, LETTERS, demoLettersValues("URBAN"), cid("urban"), urbanRequest.requestId);
  await acceptAndOrder(ctx.c, LETTERS, String(urbanQuote.quoteSnapshotId));

  // Open offers (not accepted).
  const helixRequest = await ensureRequest(ctx.c, cid("helix"), "Litere volumetrice birou Helix", "Litere volumetrice pentru recepția Helix Offices Demo.");
  await freezeQuote(ctx.c, LETTERS, demoLettersValues("HELIX"), cid("helix"), helixRequest.requestId);
  const pineRequest = await ensureRequest(ctx.c, cid("pine"), "Caseta ACM hotel Pine", "Casetă ACM iluminată pentru intrarea Pine Hotels Demo.");
  await freezeQuote(ctx.c, ACM, demoAcmValues("PINE HOTEL"), cid("pine"), pineRequest.requestId);

  // Delta — v1 quote then a revision on the same request.
  const deltaRequest = await ensureRequest(
    ctx.c,
    cid("delta"),
    "Branding recepție — gata de configurare",
    "Clientul a confirmat dimensiunile aproximative (2.4m x 0.6m), font sans-serif, culoare albă. Date sintetice N-019.",
  );
  await freezeQuote(ctx.c, LETTERS, demoLettersValues("DELTA"), cid("delta"), deltaRequest.requestId);
  await ensureQuoteRevision(ctx, cid("delta"), deltaRequest.requestId);

  // Quartz — two requests: one early, one with an ACM offer.
  await ensureRequest(ctx.c, cid("quartz"), "Litere clinice Quartz", "Cerere sintetică Quartz Clinic Demo pentru litere pe coridor.");
  const quartzOffer = await ensureRequest(ctx.c, cid("quartz"), "Caseta Quartz recepție", "A doua cerere Quartz — casetă ACM recepție.");
  await freezeQuote(ctx.c, ACM, demoAcmValues("QUARTZ"), cid("quartz"), quartzOffer.requestId);

  // Early commercial requests.
  await ensureRequest(ctx.c, cid("sign"), "Cerere nouă fără ofertă", "Cerere sintetică Sign Pro Demo, fără ofertă. Necesită preluare comercială.");
  await ensureRequest(ctx.c, cid("pine"), "Panou direcțional parcare Pine", "A doua cerere Pine Hotels: panou direcțional, fără ofertă.");
  await ensureRequest(ctx.c, cid("lumen"), "Logo luminos studio — de clarificat", "Client incomplet (fără date de contact). Produs momentan indecis.");

  // Atelier planning: effort, providers and planned executors (server-checked).
  for (const plan of ["nord", "alpha", "meadow", "orbit"] as const) {
    const planId = report.releasedPlans[plan];
    if (planId) {
      ctx.ledger.setId(`plan:${plan}`, planId);
      await preparePlan(ctx, plan, planId, people);
    } else {
      report.refusals.push(`plan:${plan}:missing`);
    }
  }

  // Files, revisions and associations.
  if (report.releasedPlans.alpha) {
    await ensureJobFiles(ctx, "alpha", report.releasedPlans.alpha, [
      { key: "drawing-v1", file: "alphaDrawingV1", purpose: "WORKING", note: "Desen inițial trimis clientului.", linkTo: [{ processId: "CUT_SHEET_CNC", scope: "FACE" }] },
      {
        key: "drawing-v2",
        file: "alphaDrawingV2",
        purpose: "EXECUTION_READY",
        note: "Revizie aprobată de client; înlocuiește v1 pentru execuție.",
        supersedes: "drawing-v1",
        linkTo: [
          { processId: "CUT_SHEET_CNC" },
          { processId: "FORM_ALUMINIUM_PROFILE" },
          { processId: "BOND_LETTER_BODY" },
        ],
      },
      { key: "contour", file: "alphaContour", purpose: "EXECUTION_READY", note: "Contur CNC pentru față și spate.", linkTo: [{ processId: "CUT_SHEET_CNC" }] },
      {
        key: "led",
        file: "alphaLedInstructions",
        purpose: "TECHNICAL_REFERENCE",
        note: "Instrucțiuni de cablare.",
        linkTo: [{ processId: "PLACE_LED_MODULES" }, { processId: "WIRE_LIGHTING" }, { processId: "INSTALL_OR_CONNECT_PSU" }],
      },
      { key: "mockup", file: "alphaMockup", purpose: "TECHNICAL_REFERENCE", note: "Machetă pentru controlul final.", linkTo: [{ processId: "INSPECT_FINISHED_LETTER" }] },
    ]);
  }
  if (report.releasedPlans.nord) {
    await ensureJobFiles(ctx, "nord", report.releasedPlans.nord, [
      { key: "acm-drawing", file: "nordAcmDrawing", purpose: "EXECUTION_READY", note: "Desen panou ACM.", linkTo: [{ processId: "CUT_SHEET_CNC" }, { processId: "FORM_SHEET_CASSETTE" }] },
    ]);
  }
  if (report.releasedPlans.meadow) {
    await ensureJobFiles(ctx, "meadow", report.releasedPlans.meadow, [
      { key: "ral", file: "meadowRalSpec", purpose: "TECHNICAL_REFERENCE", note: "Culori folie și vopsea.", linkTo: [{ processId: "APPLY_SURFACE_FINISH" }, { processId: "PAINT_RAL" }] },
    ]);
  }
  if (report.releasedPlans.orbit) {
    await ensureJobFiles(ctx, "orbit", report.releasedPlans.orbit, [
      { key: "cassette", file: "orbitCassetteDrawing", purpose: "EXECUTION_READY", note: "Desen casetă.", linkTo: [{ processId: "CUT_SHEET_CNC" }, { processId: "FORM_SHEET_CASSETTE" }] },
    ]);
  }

  const counts = async (path: string, pick: (body: Record<string, unknown> | null) => unknown[]): Promise<unknown[]> =>
    pick((await ctx.c.request("GET", path)).body);
  report.people = (await counts("/api/people", (b) => (b?.people as unknown[]) ?? [])).length;
  report.customers = (await counts("/api/customers", (b) => (b?.customers as unknown[]) ?? [])).length;
  report.requests = (await counts("/api/requests", (b) => ((b?.overview as { requests?: unknown[] })?.requests) ?? [])).length;
  const quotes = (await counts("/api/quotes", (b) => ((b?.overview as { quotes?: unknown[] })?.quotes) ?? [])) as Array<Record<string, unknown>>;
  report.quotes = quotes.length;
  report.acceptedQuotes = quotes.filter((item) => item.orderSnapshotId).length;
  report.jobs = (await counts("/api/jobs", (b) => ((b?.overview as { jobs?: unknown[] })?.jobs) ?? [])).length;
  return report;
}
