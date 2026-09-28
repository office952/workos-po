import {
  OWNER_REVIEW_MACHINES,
  OWNER_REVIEW_OPERATOR_PIN,
  OWNER_REVIEW_PEOPLE,
  OWNER_REVIEW_WORKCENTERS,
} from "./ownerReviewIdentity.js";

export type SeedHttpResponse = {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
};

export type SeedHttpClient = {
  request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<SeedHttpResponse>;
};

export type OwnerReviewSeedReport = {
  customers: number;
  requests: number;
  quotesFrozen: number;
  quotesAccepted: number;
  jobsAcceptedUnreleased: number;
  jobsReleased: number;
  assemblies: number;
  executionPlans: number;
  workcenters: number;
  machines: number;
  people: number;
  tasksPlanned: number;
  tasksBlocked: number;
  tasksInProgress: number;
  tasksCompleted: number;
  scenarioA: {
    customer: string;
    requestTitle: string;
    assemblyId: string | null;
    planId: string | null;
  };
};

const LETTERS = "PRD-LETTERS-FRONTLIT-PLEXI-AL06";
const ACM = "PRD-ACM-CASSETTE-NONE";

function lettersValues(inscription: string): Record<string, unknown> {
  return {
    "root.inscription": inscription,
    "face.finish": "none",
    "face.confirmedAreaMm2": 250000,
    "volume.depthMm": "60",
    "volume.finish": "none",
    "volume.confirmedPerimeterMm": 12500,
  };
}

function acmValues(inscription: string): Record<string, unknown> {
  return {
    "root.inscription": inscription,
    "face.widthMm": 1000,
    "face.heightMm": 500,
    "face.cassetteDepthMm": 40,
  };
}

async function requireOk(
  response: SeedHttpResponse,
  label: string,
): Promise<Record<string, unknown>> {
  if (!response.ok || !response.body) {
    throw new Error(
      `${label}:${response.body?.error ?? response.status}`,
    );
  }
  return response.body;
}

async function ensureCustomer(
  client: SeedHttpClient,
  displayName: string,
): Promise<{ customerId: string; displayName: string }> {
  const listed = await client.request("GET", "/api/customers");
  const customers = (listed.body?.customers as Array<{ customerId: string; displayName: string }>) ?? [];
  const existing = customers.find((item) => item.displayName === displayName);
  if (existing) {
    return existing;
  }
  const created = await requireOk(
    await client.request("POST", "/api/customers", { displayName }),
    `customer:${displayName}`,
  );
  return created.customer as { customerId: string; displayName: string };
}

async function ensureRequest(
  client: SeedHttpClient,
  customerId: string,
  title: string,
  description: string,
): Promise<{ requestId: string; title: string }> {
  const listed = await client.request("GET", "/api/requests");
  const overview = listed.body?.overview as
    | { requests?: Array<{ requestId: string; customerId: string; title: string }> }
    | undefined;
  const requests = overview?.requests ?? [];
  const existing = requests.find(
    (item) => item.customerId === customerId && item.title === title,
  );
  if (existing) {
    return existing;
  }
  const created = await requireOk(
    await client.request("POST", "/api/requests", {
      customerId,
      title,
      description,
    }),
    `request:${title}`,
  );
  const request =
    (created.request as { requestId: string; title: string } | undefined) ??
    ((created.detail as { request?: { requestId: string; title: string } } | undefined)
      ?.request);
  if (!request?.requestId) {
    throw new Error(`request_shape:${title}`);
  }
  return request;
}

async function ensureSeller(client: SeedHttpClient): Promise<void> {
  const current = await client.request("GET", "/api/seller");
  if (current.body?.configured && current.body?.seller) {
    return;
  }
  await requireOk(
    await client.request("PATCH", "/api/seller", {
      legalName: "WorkOS Test SRL",
      brand: "WorkOS Test",
      fiscalId: "RO99999999",
      tradeRegister: "J40/9999/2024",
      address: "Strada Sintetică 1",
      locality: "București",
      iban: "RO49AAAA1B31007593840000",
      bank: "Banca Sintetică",
    }),
    "seller",
  );
}

async function quotesForRequest(
  client: SeedHttpClient,
  requestId: string,
): Promise<Array<Record<string, unknown>>> {
  const listed = await client.request("GET", "/api/quotes");
  const quotes =
    ((listed.body?.overview as { quotes?: Array<Record<string, unknown>> })?.quotes) ??
    [];
  return quotes.filter((item) => item.requestId === requestId);
}

async function freezeQuote(
  client: SeedHttpClient,
  productCode: string,
  values: Record<string, unknown>,
  customerId: string,
  requestId: string,
): Promise<Record<string, unknown>> {
  const existing = await quotesForRequest(client, requestId);
  if (existing.length > 0) {
    return existing[0]!;
  }
  const previewed = await requireOk(
    await client.request("POST", `/api/products/${productCode}/preview`, {
      values,
      requestId,
    }),
    `preview:${productCode}`,
  );
  const frozen = await requireOk(
    await client.request("POST", `/api/products/${productCode}/quote-snapshots`, {
      values,
      reviewId: previewed.reviewId,
      customerId,
      requestId,
    }),
    `quote:${productCode}`,
  );
  return frozen.quoteSnapshot as Record<string, unknown>;
}

async function acceptAndOrder(
  client: SeedHttpClient,
  productCode: string,
  quoteSnapshotId: string,
): Promise<{ orderSnapshotId: string }> {
  const acceptance = await client.request(
    "POST",
    `/api/products/${productCode}/quote-snapshots/${quoteSnapshotId}/acceptance`,
  );
  if (!acceptance.ok && acceptance.status !== 409) {
    throw new Error(`accept:${acceptance.body?.error ?? acceptance.status}`);
  }
  const order = await client.request(
    "POST",
    `/api/products/${productCode}/quote-snapshots/${quoteSnapshotId}/order`,
  );
  if (!order.ok && order.status !== 409) {
    throw new Error(`order:${order.body?.error ?? order.status}`);
  }
  const orderSnapshot =
    (order.body?.orderSnapshot as { orderSnapshotId?: string } | undefined) ??
    (acceptance.body?.orderSnapshot as { orderSnapshotId?: string } | undefined);
  if (!orderSnapshot?.orderSnapshotId) {
    throw new Error("order_missing");
  }
  return { orderSnapshotId: orderSnapshot.orderSnapshotId };
}

async function releaseAndPlan(
  client: SeedHttpClient,
  productCode: string,
  orderSnapshotId: string,
): Promise<{ planId: string; tasks: Array<Record<string, unknown>> }> {
  const release = await client.request(
    "POST",
    `/api/products/${productCode}/orders/${orderSnapshotId}/production-release`,
  );
  if (!release.ok && release.status !== 409) {
    throw new Error(`release:${release.body?.error ?? release.status}`);
  }
  let snapshotId =
    (release.body?.snapshot as { snapshotId?: string } | undefined)?.snapshotId ?? null;
  if (!snapshotId) {
    const existing = await client.request(
      "GET",
      `/api/products/${productCode}/orders/${orderSnapshotId}/production-release`,
    );
    snapshotId =
      (existing.body?.snapshot as { snapshotId?: string } | undefined)?.snapshotId ?? null;
  }
  if (!snapshotId) {
    throw new Error("release_snapshot_missing");
  }
  const plan = await client.request(
    "POST",
    `/api/products/${productCode}/accepted-production-snapshots/${snapshotId}/execution-plan`,
  );
  if (!plan.ok && plan.status !== 409) {
    throw new Error(`plan:${plan.body?.error ?? plan.status}`);
  }
  const executionPlan = plan.body?.executionPlan as
    | { plan?: { planId?: string }; planId?: string; tasks?: Array<Record<string, unknown>> }
    | undefined;
  const planId = executionPlan?.plan?.planId ?? executionPlan?.planId;
  if (!planId) {
    throw new Error("plan_id_missing");
  }
  const refreshed = await client.request(
    "GET",
    `/api/execution-plans/${encodeURIComponent(planId)}`,
  );
  const live = refreshed.body?.executionPlan as
    | { tasks?: Array<Record<string, unknown>> }
    | undefined;
  return { planId, tasks: live?.tasks ?? executionPlan?.tasks ?? [] };
}

async function ensureWorkcenter(
  client: SeedHttpClient,
  label: string,
  capabilityIds: string[],
): Promise<{ id: string; label: string }> {
  const admin = await client.request("GET", "/api/workcenters");
  const workcenters =
    (admin.body?.workcenters as Array<{
      id: string;
      label: string;
      lifecycle: string;
      capabilityIds?: string[];
    }>) ?? [];
  let existing = workcenters.find((item) => item.label === label);
  if (!existing) {
    const created = await requireOk(
      await client.request("POST", "/api/workcenters", {
        label,
        lifecycle: "ACTIVE",
        capabilityIds,
      }),
      `workcenter:${label}`,
    );
    existing = created.workcenter as { id: string; label: string; lifecycle: string };
  } else if (existing.lifecycle !== "ACTIVE") {
    const activated = await requireOk(
      await client.request("PATCH", `/api/workcenters/${encodeURIComponent(existing.id)}`, {
        lifecycle: "ACTIVE",
      }),
      `workcenter_activate:${label}`,
    );
    existing = activated.workcenter as { id: string; label: string; lifecycle: string };
  }
  return { id: existing.id, label: existing.label };
}

async function ensureMachine(
  client: SeedHttpClient,
  label: string,
  workcenterId: string,
  capabilityIds: string[],
): Promise<{ id: string; label: string }> {
  const admin = await client.request("GET", "/api/workcenters");
  const machines =
    (admin.body?.machines as Array<{
      id: string;
      label: string;
      lifecycle: string;
      capabilityIds?: string[];
    }>) ?? [];
  let existing = machines.find((item) => item.label === label);
  if (!existing) {
    const created = await requireOk(
      await client.request("POST", "/api/machines", {
        label,
        workcenterId,
        lifecycle: "ACTIVE",
        capabilityIds,
      }),
      `machine:${label}`,
    );
    existing = created.machine as { id: string; label: string; lifecycle: string };
  } else if (existing.lifecycle !== "ACTIVE") {
    const activated = await requireOk(
      await client.request("PATCH", `/api/machines/${encodeURIComponent(existing.id)}`, {
        lifecycle: "ACTIVE",
      }),
      `machine_activate:${label}`,
    );
    existing = activated.machine as { id: string; label: string; lifecycle: string };
  }
  return { id: existing.id, label: existing.label };
}

async function ensurePerson(
  client: SeedHttpClient,
  displayName: string,
  skillCode: string,
): Promise<{ personId: string; displayName: string }> {
  const listed = await client.request("GET", "/api/people");
  const people =
    (listed.body?.people as Array<{ personId: string; displayName: string }>) ?? [];
  let person = people.find((item) => item.displayName === displayName);
  if (!person) {
    const created = await requireOk(
      await client.request("POST", "/api/people", { displayName }),
      `person:${displayName}`,
    );
    person = created.person as { personId: string; displayName: string };
  }
  const skillsBody = await client.request("GET", "/api/people/skills");
  const skills =
    (skillsBody.body?.skills as Array<{ skillId: string; code: string }>) ?? [];
  const skill = skills.find((item) => item.code === skillCode);
  if (skill) {
    await client.request("POST", `/api/people/${encodeURIComponent(person.personId)}/skills`, {
      skillId: skill.skillId,
    });
  }
  await client.request(
    "PUT",
    `/api/people/${encodeURIComponent(person.personId)}/operator-pin`,
    { pin: OWNER_REVIEW_OPERATOR_PIN, confirmPin: OWNER_REVIEW_OPERATOR_PIN },
  );
  return person;
}

async function ensureAssemblyScenarioA(
  client: SeedHttpClient,
  customerId: string,
  requestId: string,
): Promise<{ assemblyId: string; planId: string | null }> {
  void customerId;
  const jobsResponse = await client.request("GET", "/api/jobs");
  const jobs =
    ((jobsResponse.body?.overview as { jobs?: Array<Record<string, unknown>> })?.jobs) ??
    [];
  const existingJob = jobs.find(
    (item) => item.kind === "ASSEMBLY" && item.requestId === requestId,
  );
  if (existingJob?.jobId) {
    const detail = await client.request(
      "GET",
      `/api/jobs/${encodeURIComponent(String(existingJob.jobId))}`,
    );
    const assemblyHref =
      (detail.body?.quote as { href?: string } | undefined)?.href ?? "";
    const fromHref = assemblyHref.match(/assembly=([^&]+)/)?.[1];
    const assemblyId = fromHref
      ? decodeURIComponent(fromHref)
      : String(existingJob.jobId);
    return {
      assemblyId,
      planId: typeof existingJob.planId === "string" ? existingJob.planId : null,
    };
  }

  const created = await requireOk(
    await client.request("POST", "/api/assemblies", { requestId }),
    "assembly_create",
  );
  const assemblyId = (created.assembly as { assemblyId: string }).assemblyId;

  const assemblyGet = await client.request(
    "GET",
    `/api/assemblies/${encodeURIComponent(assemblyId)}`,
  );
  const assembly = assemblyGet.body?.assembly as {
    status?: string;
    quote?: unknown;
    executionPlanId?: string | null;
    members?: Array<{ role: string }>;
  };

  if (!assembly?.quote) {
    const members = assembly?.members ?? [];
    if (!members.some((item) => item.role === "SUPPORT_PANEL")) {
      const acmReview = await requireOk(
        await client.request("POST", `/api/products/${ACM}/preview`, {
          values: acmValues("Nord Market ACM"),
          requestId,
        }),
        "assembly_acm_preview",
      );
      await requireOk(
        await client.request("POST", `/api/assemblies/${encodeURIComponent(assemblyId)}/members`, {
          role: "SUPPORT_PANEL",
          values: acmValues("Nord Market ACM"),
          reviewId: acmReview.reviewId,
        }),
        "assembly_acm_member",
      );
    }
    if (!members.some((item) => item.role === "SIGNAGE_LETTERS")) {
      const lettersReview = await requireOk(
        await client.request("POST", `/api/products/${LETTERS}/preview`, {
          values: lettersValues("NORD"),
          requestId,
        }),
        "assembly_letters_preview",
      );
      await requireOk(
        await client.request("POST", `/api/assemblies/${encodeURIComponent(assemblyId)}/members`, {
          role: "SIGNAGE_LETTERS",
          values: lettersValues("NORD"),
          reviewId: lettersReview.reviewId,
        }),
        "assembly_letters_member",
      );
    }
    const confirm = await client.request(
      "POST",
      `/api/assemblies/${encodeURIComponent(assemblyId)}/confirm`,
    );
    if (!confirm.ok && confirm.status !== 409) {
      throw new Error(`assembly_confirm:${confirm.body?.error ?? confirm.status}`);
    }
    const quote = await client.request(
      "POST",
      `/api/assemblies/${encodeURIComponent(assemblyId)}/quote`,
    );
    if (!quote.ok && quote.status !== 409) {
      throw new Error(`assembly_quote:${quote.body?.error ?? quote.status}`);
    }
  }

  const accept = await client.request(
    "POST",
    `/api/assemblies/${encodeURIComponent(assemblyId)}/accept`,
  );
  if (!accept.ok && accept.status !== 409) {
    throw new Error(`assembly_accept:${accept.body?.error ?? accept.status}`);
  }
  const production = await client.request(
    "POST",
    `/api/assemblies/${encodeURIComponent(assemblyId)}/production`,
  );
  if (!production.ok && production.status !== 409) {
    throw new Error(`assembly_production:${production.body?.error ?? production.status}`);
  }
  const plan = await client.request(
    "POST",
    `/api/assemblies/${encodeURIComponent(assemblyId)}/execution-plan`,
  );
  if (!plan.ok && plan.status !== 409) {
    throw new Error(`assembly_plan:${plan.body?.error ?? plan.status}`);
  }
  const refreshed = await client.request(
    "GET",
    `/api/assemblies/${encodeURIComponent(assemblyId)}`,
  );
  const live = refreshed.body?.assembly as { executionPlanId?: string | null };
  return { assemblyId, planId: live?.executionPlanId ?? null };
}

type TaskRow = {
  taskId: string;
  status?: string;
  canAssign?: boolean;
  canStart?: boolean;
  canClaimStart?: boolean;
  requiresProvider?: boolean;
  assignedProvider?: { id: string } | null;
  plannedEffortMinutes?: number | null;
  requiredCapabilityId?: string | null;
  eligibleProviders?: Array<{ id: string }>;
};

async function loadPlanTasks(
  client: SeedHttpClient,
  planId: string,
): Promise<TaskRow[]> {
  const refreshed = await client.request(
    "GET",
    `/api/execution-plans/${encodeURIComponent(planId)}`,
  );
  return (
    ((refreshed.body?.executionPlan as { tasks?: TaskRow[] } | undefined)?.tasks) ?? []
  );
}

async function applyExecutionStates(
  client: SeedHttpClient,
  planId: string,
  cncMachineId: string,
  operatorPersonId: string,
  operatorClient: SeedHttpClient,
): Promise<{
  planned: number;
  blocked: number;
  inProgress: number;
  completed: number;
}> {
  const tasks = await loadPlanTasks(client, planId);
  const providerTasks = tasks.filter(
    (task) =>
      task.requiresProvider !== false &&
      (task.canAssign === true ||
        task.requiredCapabilityId === "CNC_ROUTING" ||
        (task.eligibleProviders?.length ?? 0) > 0),
  );
  const assignable = (
    providerTasks.length > 0 ? providerTasks : tasks.filter((task) => task.canAssign)
  ).slice();

  // Scenario I — leave at least one provider-required task unassigned (blocked).
  const blockedCandidate = assignable.find(
    (task) => !task.assignedProvider && task.requiresProvider !== false,
  );
  let blocked = 0;
  if (blockedCandidate) {
    blocked = 1;
  }

  const workable = assignable.filter((task) => task.taskId !== blockedCandidate?.taskId);
  let planned = 0;
  let inProgress = 0;
  let completed = 0;

  for (const [index, task] of workable.entries()) {
    if (!task.assignedProvider) {
      const providerId =
        task.eligibleProviders?.find((item) => item.id === cncMachineId)?.id ??
        task.eligibleProviders?.[0]?.id ??
        cncMachineId;
      await client.request("POST", `/api/execution-tasks/${encodeURIComponent(task.taskId)}/provider`, {
        providerId,
      });
    }
    if (task.plannedEffortMinutes == null) {
      await client.request(
        "POST",
        `/api/execution-tasks/${encodeURIComponent(task.taskId)}/planned-effort`,
        { plannedEffortMinutes: 60 + index * 15 },
      );
      planned += 1;
    }
  }

  const afterAssign = await loadPlanTasks(client, planId);
  const startable = afterAssign.filter(
    (task) =>
      task.taskId !== blockedCandidate?.taskId &&
      task.assignedProvider &&
      (task.canStart === true || task.canClaimStart === true || task.status === "PLANNED"),
  );

  // Scenario H/J — start one task as operator.
  const toStart = startable[0];
  if (toStart) {
    await client.request("POST", `/api/execution-tasks/${encodeURIComponent(toStart.taskId)}/executor`, {
      personId: operatorPersonId,
    });
    const started = await operatorClient.request(
      "POST",
      `/api/execution-tasks/${encodeURIComponent(toStart.taskId)}/start`,
    );
    if (started.ok) {
      inProgress += 1;
    }
  }

  // Scenario K — complete a different started task when possible.
  const toComplete = startable[1] ?? startable[0];
  if (toComplete && toComplete.taskId !== toStart?.taskId) {
    await client.request(
      "POST",
      `/api/execution-tasks/${encodeURIComponent(toComplete.taskId)}/executor`,
      { personId: operatorPersonId },
    );
    await operatorClient.request(
      "POST",
      `/api/execution-tasks/${encodeURIComponent(toComplete.taskId)}/start`,
    );
    const done = await operatorClient.request(
      "POST",
      `/api/execution-tasks/${encodeURIComponent(toComplete.taskId)}/complete`,
      { actualDurationMinutes: 55 },
    );
    if (done.ok) {
      completed += 1;
      inProgress = Math.max(0, inProgress);
    }
  } else if (toComplete && toStart && toComplete.taskId === toStart.taskId) {
    // Only one startable task: leave it in progress (J). Completion optional.
  }

  // Re-count from live plan.
  const finalTasks = await loadPlanTasks(client, planId);
  const inProgressCount = finalTasks.filter((task) => task.status === "IN_PROGRESS").length;
  const completedCount = finalTasks.filter((task) => task.status === "COMPLETED").length;
  const blockedCount = finalTasks.filter(
    (task) =>
      task.requiresProvider !== false &&
      !task.assignedProvider &&
      task.status !== "COMPLETED" &&
      task.status !== "IN_PROGRESS",
  ).length;

  return {
    planned: planned || finalTasks.filter((task) => task.plannedEffortMinutes != null).length,
    blocked: blockedCount || blocked,
    inProgress: inProgressCount || inProgress,
    completed: completedCount || completed,
  };
}

/**
 * Seeds the Owner-review connected dataset through canonical HTTP APIs.
 * Idempotent by stable display names / request titles.
 */
export async function seedOwnerReviewDataset(input: {
  client: SeedHttpClient;
  /** Operator-authenticated client for start/complete (People PIN session). */
  createOperatorClient: (personId: string, pin: string) => Promise<SeedHttpClient>;
}): Promise<OwnerReviewSeedReport> {
  const { client, createOperatorClient } = input;
  await ensureSeller(client);

  const customers = {
    nord: await ensureCustomer(client, "Nord Market Demo SRL"),
    alpha: await ensureCustomer(client, "Alpha Clima Demo SRL"),
    urban: await ensureCustomer(client, "Urban Pharma Demo SRL"),
    sign: await ensureCustomer(client, "Sign Pro Demo SRL"),
    delta: await ensureCustomer(client, "Delta Retail Demo SRL"),
    helix: await ensureCustomer(client, "Helix Offices Demo SRL"),
    pine: await ensureCustomer(client, "Pine Hotels Demo SRL"),
    orbit: await ensureCustomer(client, "Orbit Auto Demo SRL"),
    meadow: await ensureCustomer(client, "Meadow Café Demo SRL"),
    quartz: await ensureCustomer(client, "Quartz Clinic Demo SRL"),
  };

  // Scenario A — full assembly spine
  const nordRequest = await ensureRequest(
    client,
    customers.nord.customerId,
    "Semnalistică fațadă magazin — Cluj",
    "Panou ACM casetat + litere volumetrice front-lit pentru fațada magazinului Nord Market Demo din Cluj. Date sintetice Owner review.",
  );

  // Scenario B — early commercial
  await ensureRequest(
    client,
    customers.sign.customerId,
    "Cerere nouă fără ofertă",
    "Cerere sintetică Sign Pro Demo, fără ofertă. Necesită preluare comercială.",
  );

  // Scenario C — ready for configuration
  await ensureRequest(
    client,
    customers.delta.customerId,
    "Branding recepție — gata de configurare",
    "Clientul a confirmat dimensiunile aproximative (2.4m x 0.6m), font preferat sans-serif, culoare albă. Artwork va fi încărcat. Pregătit pentru Catalog/Configurator.",
  );

  // Scenario D — quote draft (frozen, not accepted)
  const helixRequest = await ensureRequest(
    client,
    customers.helix.customerId,
    "Litere volumetrice birou Helix",
    "Litere volumetrice pentru recepția Helix Offices Demo.",
  );
  await freezeQuote(
    client,
    LETTERS,
    lettersValues("HELIX"),
    customers.helix.customerId,
    helixRequest.requestId,
  );

  // Scenario E — second frozen quote awaiting response
  const pineRequest = await ensureRequest(
    client,
    customers.pine.customerId,
    "Caseta ACM hotel Pine",
    "Caseta ACM iluminată pentru intrarea Pine Hotels Demo.",
  );
  await freezeQuote(
    client,
    ACM,
    acmValues("PINE HOTEL"),
    customers.pine.customerId,
    pineRequest.requestId,
  );

  // Scenario F — accepted / job not released
  const urbanRequest = await ensureRequest(
    client,
    customers.urban.customerId,
    "Litere volumetrice fațadă Urban",
    "Litere volumetrice pentru fațada Urban Pharma Demo.",
  );
  const urbanQuote = await freezeQuote(
    client,
    LETTERS,
    lettersValues("URBAN"),
    customers.urban.customerId,
    urbanRequest.requestId,
  );
  await acceptAndOrder(
    client,
    LETTERS,
    String(urbanQuote.quoteSnapshotId),
  );

  // Scenario G — released / planning (+ later H/I/J/K on this or assembly plan)
  const alphaRequest = await ensureRequest(
    client,
    customers.alpha.customerId,
    "Litere volumetrice recepție Alpha",
    "Litere volumetrice frontlit pentru recepție Alpha Clima Demo.",
  );
  const alphaQuote = await freezeQuote(
    client,
    LETTERS,
    lettersValues("ALPHA"),
    customers.alpha.customerId,
    alphaRequest.requestId,
  );
  const alphaOrder = await acceptAndOrder(
    client,
    LETTERS,
    String(alphaQuote.quoteSnapshotId),
  );
  const alphaPlan = await releaseAndPlan(
    client,
    LETTERS,
    alphaOrder.orderSnapshotId,
  );

  // Extra density requests
  await ensureRequest(
    client,
    customers.orbit.customerId,
    "Semnalizare showroom Orbit",
    "Cerere sintetică Orbit Auto Demo pentru showroom.",
  );
  await ensureRequest(
    client,
    customers.meadow.customerId,
    "Meniu luminos Meadow",
    "Cerere sintetică Meadow Café Demo — meniu luminos interior.",
  );
  await ensureRequest(
    client,
    customers.quartz.customerId,
    "Litere clinice Quartz",
    "Cerere sintetică Quartz Clinic Demo pentru litere pe coridor.",
  );
  const quartzQuoteRequest = await ensureRequest(
    client,
    customers.quartz.customerId,
    "Caseta Quartz recepție",
    "A doua cerere Quartz — casetă ACM recepție.",
  );
  await freezeQuote(
    client,
    ACM,
    acmValues("QUARTZ"),
    customers.quartz.customerId,
    quartzQuoteRequest.requestId,
  );

  const cncWc = await ensureWorkcenter(client, OWNER_REVIEW_WORKCENTERS.cnc, ["CNC_ROUTING"]);
  const assemblyWc = await ensureWorkcenter(client, OWNER_REVIEW_WORKCENTERS.assembly, [
    "MANUAL_ASSEMBLY",
  ]);
  const ledWc = await ensureWorkcenter(client, OWNER_REVIEW_WORKCENTERS.led, [
    "ELECTRICAL_ASSEMBLY",
  ]);
  const cncMachine = await ensureMachine(
    client,
    OWNER_REVIEW_MACHINES.cnc,
    cncWc.id,
    ["CNC_ROUTING"],
  );
  await ensureMachine(client, OWNER_REVIEW_MACHINES.assemblyBench, assemblyWc.id, [
    "MANUAL_ASSEMBLY",
  ]);
  await ensureMachine(client, OWNER_REVIEW_MACHINES.ledBench, ledWc.id, [
    "ELECTRICAL_ASSEMBLY",
  ]);

  const cncPerson = await ensurePerson(
    client,
    OWNER_REVIEW_PEOPLE.cncOperator,
    "SK_CNC_OPERATOR",
  );
  await ensurePerson(client, OWNER_REVIEW_PEOPLE.assemblyOperator, "SK_ASSEMBLY");

  const assembly = await ensureAssemblyScenarioA(
    client,
    customers.nord.customerId,
    nordRequest.requestId,
  );

  const operatorClient = await createOperatorClient(
    cncPerson.personId,
    OWNER_REVIEW_OPERATOR_PIN,
  );

  let taskStats = { planned: 0, blocked: 0, inProgress: 0, completed: 0 };
  const planForExecution = assembly.planId ?? alphaPlan.planId;
  if (planForExecution) {
    taskStats = await applyExecutionStates(
      client,
      planForExecution,
      cncMachine.id,
      cncPerson.personId,
      operatorClient,
    );
  }
  // Also seed planning density on alpha plan if distinct.
  if (alphaPlan.planId && alphaPlan.planId !== planForExecution) {
    const alphaStats = await applyExecutionStates(
      client,
      alphaPlan.planId,
      cncMachine.id,
      cncPerson.personId,
      operatorClient,
    );
    taskStats = {
      planned: taskStats.planned + alphaStats.planned,
      blocked: taskStats.blocked + alphaStats.blocked,
      inProgress: Math.max(taskStats.inProgress, alphaStats.inProgress),
      completed: taskStats.completed + alphaStats.completed,
    };
  }

  const customerList = await client.request("GET", "/api/customers");
  const requestList = await client.request("GET", "/api/requests");
  const quoteList = await client.request("GET", "/api/quotes");
  const jobList = await client.request("GET", "/api/jobs");
  const peopleList = await client.request("GET", "/api/people");
  const wcList = await client.request("GET", "/api/workcenters");

  const quotes =
    ((quoteList.body?.overview as { quotes?: Array<Record<string, unknown>> })?.quotes) ??
    [];
  const jobs =
    ((jobList.body?.overview as { jobs?: Array<Record<string, unknown>> })?.jobs) ?? [];

  return {
    customers: ((customerList.body?.customers as unknown[]) ?? []).length,
    requests:
      ((requestList.body?.overview as { requests?: unknown[] })?.requests ?? []).length,
    quotesFrozen: quotes.length,
    quotesAccepted: quotes.filter((item) => item.orderSnapshotId).length,
    jobsAcceptedUnreleased: jobs.filter(
      (item) => item.kind !== "ASSEMBLY" && !item.planId,
    ).length,
    jobsReleased: jobs.filter((item) => item.planId).length,
    assemblies: assembly.assemblyId ? 1 : 0,
    executionPlans: [assembly.planId, alphaPlan.planId].filter(Boolean).length,
    workcenters: ((wcList.body?.workcenters as unknown[]) ?? []).length,
    machines: ((wcList.body?.machines as unknown[]) ?? []).length,
    people: ((peopleList.body?.people as unknown[]) ?? []).length,
    tasksPlanned: taskStats.planned,
    tasksBlocked: taskStats.blocked,
    tasksInProgress: taskStats.inProgress,
    tasksCompleted: taskStats.completed,
    scenarioA: {
      customer: customers.nord.displayName,
      requestTitle: nordRequest.title,
      assemblyId: assembly.assemblyId,
      planId: assembly.planId,
    },
  };
}
