import type { DemoPersonKey } from "./demoAtelierIdentity.js";
import type { DemoSecrets } from "./demoAtelierSecrets.js";
import type { DemoTransport } from "./demoAtelierHttp.js";
import type { DemoLedger } from "./demoAtelierLedger.js";
import { readPlanTasks, type DemoPlanKey, type DemoTask } from "./demoAtelierSeed.js";
import type { SeedHttpClient } from "./ownerReviewSeed.js";

/**
 * Live demonstration cycle C1.
 *
 * Measured participation can only come from the server clock: every session
 * start/end is stamped by the API when the operator command arrives. The cycle
 * therefore issues each command at its real minute offset from the cycle
 * start. Nothing edits timestamps, the system clock, the database, or the
 * declared-duration field. The cycle opens sessions only together with a
 * scheduled exit, and its last steps close every session it opened.
 */

export type DemoCycleAction =
  | "start"
  | "leave"
  | "complete"
  | "qualityPass"
  | "machineStart"
  | "machineStop"
  | "useFile";

export type DemoCycleStep = {
  id: string;
  atMinute: number;
  who: DemoPersonKey;
  action: DemoCycleAction;
  plan: DemoPlanKey;
  seq: string;
  processId: string;
  /** Ledger file key for useFile. */
  file?: string;
  note: string;
};

export const DEMO_CYCLE_ID = "C1";

const s = (
  id: string,
  atMinute: number,
  who: DemoPersonKey,
  action: DemoCycleAction,
  plan: DemoPlanKey,
  seq: string,
  processId: string,
  note: string,
  file?: string,
): DemoCycleStep => ({ id, atMinute, who, action, plan, seq, processId, note, ...(file ? { file } : {}) });

const CNC = "CUT_SHEET_CNC";
const PROFILE = "FORM_ALUMINIUM_PROFILE";

/**
 * C1 timeline (minutes from cycle start). Lanes respect dependencies, one open
 * session per person, and one active run per machine (CNC 4020, CNC Cant
 * Litere, Debitator metale). Alpha finishes; Nord, Meadow and Orbit stay in
 * different execution stages; Urban stays accepted and unreleased.
 */
export const DEMO_CYCLE_C1: readonly DemoCycleStep[] = [
  // CNC 4020 — Alpha back: two operators, Ion pauses and re-enters, Ana continues.
  s("a01-ion-start", 0, "cnc1", "start", "alpha", "01", CNC, "Ion pornește debitarea spatelui"),
  s("a01-cnc-run", 1, "cnc1", "machineStart", "alpha", "01", CNC, "CNC 4020 pornit"),
  s("a01-ana-join", 8, "cnc2", "start", "alpha", "01", CNC, "Ana se alătură"),
  s("a01-ion-pause", 30, "cnc1", "leave", "alpha", "01", CNC, "Ion iese în pauză; Ana continuă"),
  s("a01-ion-back", 42, "cnc1", "start", "alpha", "01", CNC, "Ion revine"),
  s("a01-cnc-stop", 52, "cnc1", "machineStop", "alpha", "01", CNC, "CNC 4020 oprit"),
  s("a01-ana-leave", 53, "cnc2", "leave", "alpha", "01", CNC, "Ana pleacă"),
  s("a01-ion-done", 55, "cnc1", "complete", "alpha", "01", CNC, "Ion încheie spatele"),
  // CNC Cant Litere — Alpha volume: Radu with Dan joining for part of it.
  s("a07-radu-start", 3, "cant", "start", "alpha", "07", PROFILE, "Radu pornește formarea cantului"),
  s("a07-radu-file", 4, "cant", "useFile", "alpha", "07", PROFILE, "Radu folosește desenul v2", "file:alpha:drawing-v2"),
  s("a07-cant-run", 5, "cant", "machineStart", "alpha", "07", PROFILE, "CNC Cant Litere pornit"),
  s("a07-dan-join", 30, "weldAlu", "start", "alpha", "07", PROFILE, "Dan se alătură la cant"),
  s("a07-dan-leave", 75, "weldAlu", "leave", "alpha", "07", PROFILE, "Dan pleacă"),
  s("a07-cant-stop", 88, "cant", "machineStop", "alpha", "07", PROFILE, "CNC Cant Litere oprit"),
  s("a07-radu-done", 90, "cant", "complete", "alpha", "07", PROFILE, "Radu încheie cantul"),
  // Debitator metale — Orbit, then Nord.
  s("o01-sorin-start", 2, "weldSteel", "start", "orbit", "01", "CUT_METAL_STOCK", "Sorin debitează semifabricatul Orbit"),
  s("o01-run", 3, "weldSteel", "machineStart", "orbit", "01", "CUT_METAL_STOCK", "Debitator pornit"),
  s("o01-stop", 40, "weldSteel", "machineStop", "orbit", "01", "CUT_METAL_STOCK", "Debitator oprit"),
  s("o01-done", 42, "weldSteel", "complete", "orbit", "01", "CUT_METAL_STOCK", "Sorin încheie Orbit"),
  s("n11-sorin-start", 50, "weldSteel", "start", "nord", "11", "CUT_METAL_STOCK", "Sorin debitează cadrul Nord"),
  s("n11-run", 51, "weldSteel", "machineStart", "nord", "11", "CUT_METAL_STOCK", "Debitator pornit"),
  s("n11-stop", 88, "weldSteel", "machineStop", "nord", "11", "CUT_METAL_STOCK", "Debitator oprit"),
  s("n11-done", 90, "weldSteel", "complete", "nord", "11", "CUT_METAL_STOCK", "Sorin încheie cadrul Nord"),
  // CNC 4020 — Alpha face.
  s("a02-ion-start", 58, "cnc1", "start", "alpha", "02", CNC, "Ion pornește fața"),
  s("a02-ion-file", 59, "cnc1", "useFile", "alpha", "02", CNC, "Ion folosește conturul DXF", "file:alpha:contour"),
  s("a02-cnc-run", 60, "cnc1", "machineStart", "alpha", "02", CNC, "CNC 4020 pornit"),
  s("a02-cnc-stop", 98, "cnc1", "machineStop", "alpha", "02", CNC, "CNC 4020 oprit"),
  s("a02-ion-done", 100, "cnc1", "complete", "alpha", "02", CNC, "Ion încheie fața"),
  // Electrical chain — Alpha.
  s("a03-elena-start", 60, "electric", "start", "alpha", "03", "PLACE_LED_MODULES", "Elena montează modulele LED"),
  s("a03-elena-done", 95, "electric", "complete", "alpha", "03", "PLACE_LED_MODULES", "Module LED montate"),
  s("a04-elena-start", 98, "electric", "start", "alpha", "04", "WIRE_LIGHTING", "Elena cablează"),
  s("a04-elena-done", 128, "electric", "complete", "alpha", "04", "WIRE_LIGHTING", "Cablare încheiată"),
  s("a05-elena-start", 130, "electric", "start", "alpha", "05", "INSTALL_OR_CONNECT_PSU", "Elena pregătește sursa"),
  s("a05-elena-done", 150, "electric", "complete", "alpha", "05", "INSTALL_OR_CONNECT_PSU", "Sursă pregătită"),
  s("a06-elena-start", 152, "electric", "start", "alpha", "06", "TEST_LIGHTING_IGNITION", "Elena face proba de aprindere"),
  s("a06-elena-done", 165, "electric", "complete", "alpha", "06", "TEST_LIGHTING_IGNITION", "Probă aprindere încheiată"),
  // CNC Cant Litere — Meadow volume: Dan, with Radu joining.
  s("m08-dan-start", 95, "weldAlu", "start", "meadow", "08", PROFILE, "Dan pornește cantul Meadow"),
  s("m08-cant-run", 96, "weldAlu", "machineStart", "meadow", "08", PROFILE, "CNC Cant Litere pornit"),
  s("m08-radu-join", 100, "cant", "start", "meadow", "08", PROFILE, "Radu se alătură"),
  s("m08-radu-leave", 130, "cant", "leave", "meadow", "08", PROFILE, "Radu pleacă"),
  s("m08-cant-stop", 150, "weldAlu", "machineStop", "meadow", "08", PROFILE, "CNC Cant Litere oprit"),
  s("m08-dan-done", 152, "weldAlu", "complete", "meadow", "08", PROFILE, "Dan încheie cantul Meadow"),
  // Alpha body bond: Maria with Vlad for part of it.
  s("a08-maria-start", 102, "assembly1", "start", "alpha", "08", "BOND_LETTER_BODY", "Maria lipește fața de volum"),
  s("a08-vlad-join", 110, "assembly2", "start", "alpha", "08", "BOND_LETTER_BODY", "Vlad se alătură"),
  s("a08-vlad-leave", 140, "assembly2", "leave", "alpha", "08", "BOND_LETTER_BODY", "Vlad pleacă"),
  s("a08-maria-done", 155, "assembly1", "complete", "alpha", "08", "BOND_LETTER_BODY", "Lipire încheiată"),
  // CNC 4020 — Meadow face, then Nord panel and Nord letters.
  s("m02-ana-start", 103, "cnc2", "start", "meadow", "02", CNC, "Ana debitează fața Meadow"),
  s("m02-cnc-run", 104, "cnc2", "machineStart", "meadow", "02", CNC, "CNC 4020 pornit"),
  s("m02-cnc-stop", 140, "cnc2", "machineStop", "meadow", "02", CNC, "CNC 4020 oprit"),
  s("m02-ana-done", 142, "cnc2", "complete", "meadow", "02", CNC, "Fața Meadow debitată"),
  s("n12-ion-start", 145, "cnc1", "start", "nord", "12", CNC, "Ion debitează panoul ACM Nord"),
  s("n12-cnc-run", 146, "cnc1", "machineStart", "nord", "12", CNC, "CNC 4020 pornit"),
  s("n12-cnc-stop", 180, "cnc1", "machineStop", "nord", "12", CNC, "CNC 4020 oprit"),
  s("n12-ion-done", 182, "cnc1", "complete", "nord", "12", CNC, "Panou ACM debitat"),
  s("n01-ion-start", 185, "cnc1", "start", "nord", "01", CNC, "Ion debitează literele Nord"),
  s("n01-cnc-run", 186, "cnc1", "machineStart", "nord", "01", CNC, "CNC 4020 pornit"),
  s("n01-cnc-stop", 222, "cnc1", "machineStop", "nord", "01", CNC, "CNC 4020 oprit"),
  s("n01-ion-done", 226, "cnc1", "complete", "nord", "01", CNC, "Litere Nord debitate"),
  // Finishing — Meadow face vinyl.
  s("m03-irina-start", 145, "finish", "start", "meadow", "03", "APPLY_SURFACE_FINISH", "Irina aplică folia pe fața Meadow"),
  s("m03-irina-done", 190, "finish", "complete", "meadow", "03", "APPLY_SURFACE_FINISH", "Folie aplicată"),
  // CNC Cant Litere — Nord volume, left in progress at end of shift.
  s("n07-radu-start", 160, "cant", "start", "nord", "07", PROFILE, "Radu pornește cantul Nord"),
  s("n07-cant-run", 161, "cant", "machineStart", "nord", "07", PROFILE, "CNC Cant Litere pornit"),
  s("n07-cant-stop", 228, "cant", "machineStop", "nord", "07", PROFILE, "CNC Cant Litere oprit"),
  s("n07-radu-leave", 230, "cant", "leave", "nord", "07", PROFILE, "Radu pleacă la final de tură; operația rămâne în lucru"),
  // Alpha close body.
  s("a09-maria-start", 168, "assembly1", "start", "alpha", "09", "CLOSE_LETTER_BODY", "Maria închide corpul"),
  s("a09-maria-done", 200, "assembly1", "complete", "alpha", "09", "CLOSE_LETTER_BODY", "Corp închis"),
  // Quality control by the designated person only.
  s("a10-paul-start", 202, "quality", "start", "alpha", "10", "TEST_ILLUMINATION_UNIFORMITY", "Paul verifică uniformitatea"),
  s("a10-paul-pass", 214, "quality", "qualityPass", "alpha", "10", "TEST_ILLUMINATION_UNIFORMITY", "Uniformitate conformă"),
  s("a11-paul-start", 216, "quality", "start", "alpha", "11", "INSPECT_FINISHED_LETTER", "Paul face controlul final"),
  s("a11-paul-pass", 232, "quality", "qualityPass", "alpha", "11", "INSPECT_FINISHED_LETTER", "Control final conform"),
  // Nord cassette: Maria with Vlad, both leave at end of shift.
  s("n13-maria-start", 203, "assembly1", "start", "nord", "13", "FORM_SHEET_CASSETTE", "Maria formează caseta Nord"),
  s("n13-vlad-join", 210, "assembly2", "start", "nord", "13", "FORM_SHEET_CASSETTE", "Vlad se alătură"),
  s("n13-vlad-leave", 225, "assembly2", "leave", "nord", "13", "FORM_SHEET_CASSETTE", "Vlad pleacă la ambalare"),
  s("n13-maria-leave", 235, "assembly1", "leave", "nord", "13", "FORM_SHEET_CASSETTE", "Maria pleacă la final de tură; operația rămâne în lucru"),
  // Alpha packaging closes the job.
  s("a12-vlad-start", 234, "assembly2", "start", "alpha", "12", "PACK_PRODUCT", "Vlad ambalează Alpha"),
  s("a12-vlad-done", 250, "assembly2", "complete", "alpha", "12", "PACK_PRODUCT", "Alpha ambalat; lucrare finalizată"),
];

export type DemoCycleStepResult = { doneAt: string; ok: boolean; status: number; error?: string };

export type DemoCycleState = {
  cycleId: string;
  startedAt: string;
  plannedEndAt: string;
  status: "RUNNING" | "COMPLETED" | "STOPPED";
  steps: Record<string, DemoCycleStepResult>;
  closeout?: { at: string; closedSessions: string[]; stoppedRuns: string[] };
};

export function orderedCycle(steps: readonly DemoCycleStep[] = DEMO_CYCLE_C1): DemoCycleStep[] {
  return [...steps].sort((left, right) => left.atMinute - right.atMinute || steps.indexOf(left) - steps.indexOf(right));
}

export function newCycleState(now: Date, steps: readonly DemoCycleStep[] = DEMO_CYCLE_C1): DemoCycleState {
  const last = Math.max(...steps.map((step) => step.atMinute));
  return {
    cycleId: DEMO_CYCLE_ID,
    startedAt: now.toISOString(),
    plannedEndAt: new Date(now.getTime() + last * 60_000).toISOString(),
    status: "RUNNING",
    steps: {},
  };
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

type ResolvedTask = { planId: string; task: DemoTask };

async function resolveTask(
  client: SeedHttpClient,
  ledger: DemoLedger,
  step: DemoCycleStep,
): Promise<ResolvedTask> {
  const planId = ledger.id(`plan:${step.plan}`);
  if (!planId) {
    throw new Error(`plan_unknown:${step.plan}`);
  }
  const task = (await readPlanTasks(client, planId)).find((item) => item.seqLabel === step.seq);
  if (!task || task.processId !== step.processId) {
    throw new Error(`task_shape_changed:${step.plan}:${step.seq}:${step.processId}`);
  }
  return { planId, task };
}

function completionBody(task: DemoTask): Record<string, unknown> {
  const measurable = task.measurableQuantity as { value?: number } | null | undefined;
  return task.requiresCompletedQuantity && typeof measurable?.value === "number"
    ? { completedQuantity: measurable.value }
    : {};
}

/** Executes one step through the operator routes; returns the server verdict. */
export async function executeCycleStep(
  transport: DemoTransport,
  ledger: DemoLedger,
  step: DemoCycleStep,
  secrets: DemoSecrets,
): Promise<DemoCycleStepResult> {
  const personId = ledger.id(`person:${step.who}`);
  if (!personId) {
    return { doneAt: new Date().toISOString(), ok: false, status: 0, error: `person_unknown:${step.who}` };
  }
  const { task } = await resolveTask(transport.client, ledger, step);
  const operator = await transport.operator(personId, secrets.operatorPin(step.who));
  const base = `/api/execution-tasks/${enc(task.taskId)}`;
  let response;
  switch (step.action) {
    case "start":
      response = await operator.request("POST", `${base}/start`);
      break;
    case "leave":
      response = await operator.request("POST", `${base}/leave`);
      break;
    case "complete":
      response = await operator.request("POST", `${base}/complete`, completionBody(task));
      break;
    case "qualityPass":
      response = await operator.request("POST", `${base}/quality-pass`, { note: step.note });
      break;
    case "machineStart":
      response = await operator.request("POST", `${base}/machine-runs/start`);
      break;
    case "machineStop": {
      const runId = task.activeMachineRun?.machineRunId;
      if (!runId) {
        return { doneAt: new Date().toISOString(), ok: false, status: 0, error: "no_active_machine_run" };
      }
      response = await operator.request("POST", `/api/execution-machine-runs/${enc(runId)}/stop`);
      break;
    }
    case "useFile": {
      const artifactId = step.file ? ledger.id(step.file) : undefined;
      if (!artifactId) {
        return { doneAt: new Date().toISOString(), ok: false, status: 0, error: `file_unknown:${step.file}` };
      }
      response = await operator.request("POST", `${base}/artifact-use`, { artifactId });
      break;
    }
    default: {
      const exhaustive: never = step.action;
      return exhaustive;
    }
  }
  return {
    doneAt: new Date().toISOString(),
    ok: response.ok,
    status: response.status,
    ...(response.ok ? {} : { error: String(response.body?.error ?? response.status) }),
  };
}

/**
 * Runs the pending steps of a cycle at their real offsets. Steps already in
 * the state are skipped, so an interrupted runner resumes without repeating
 * commands. `sleep` is injectable only so tests can validate the order.
 */
export async function runDemoCycle(input: {
  transport: () => Promise<DemoTransport>;
  ledger: DemoLedger;
  secrets: DemoSecrets;
  state: DemoCycleState;
  save: (state: DemoCycleState) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  log?: (line: string) => void;
  steps?: readonly DemoCycleStep[];
}): Promise<DemoCycleState> {
  const log = input.log ?? (() => {});
  const state = input.state;
  const startedAt = Date.parse(state.startedAt);
  for (const step of orderedCycle(input.steps)) {
    if (state.steps[step.id]) {
      continue;
    }
    if (state.status !== "RUNNING") {
      break;
    }
    const dueAt = startedAt + step.atMinute * 60_000;
    const wait = dueAt - input.now().getTime();
    if (wait > 0) {
      await input.sleep(wait);
    }
    let result: DemoCycleStepResult;
    try {
      result = await executeCycleStep(await input.transport(), input.ledger, step, input.secrets);
    } catch (error) {
      result = {
        doneAt: new Date().toISOString(),
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    state.steps[step.id] = result;
    input.save(state);
    log(`${result.ok ? "OK  " : "FAIL"} +${step.atMinute}m ${step.id} ${step.note}${result.error ? ` -> ${result.error}` : ""}`);
  }
  if (state.status === "RUNNING") {
    state.status = "COMPLETED";
    input.save(state);
  }
  return state;
}

/**
 * Closes everything the demo may have left open: each demo person's active
 * session is left and each active machine run on the demo plans is stopped.
 * The exit is stamped now; an earlier forgotten exit cannot be backdated
 * (session correction is a separate future contract).
 */
export async function closeOutDemoCycle(input: {
  transport: DemoTransport;
  ledger: DemoLedger;
  secrets: DemoSecrets;
  people: readonly DemoPersonKey[];
}): Promise<{ closedSessions: string[]; stoppedRuns: string[]; errors: string[] }> {
  const closedSessions: string[] = [];
  const stoppedRuns: string[] = [];
  const errors: string[] = [];
  for (const plan of ["alpha", "nord", "meadow", "orbit"] as const) {
    const planId = input.ledger.id(`plan:${plan}`);
    if (!planId) {
      continue;
    }
    for (const task of await readPlanTasks(input.transport.client, planId)) {
      const runId = task.activeMachineRun?.machineRunId;
      const active = (task.participants ?? []).filter((item) => item.active);
      if (!runId && active.length === 0) {
        continue;
      }
      if (runId) {
        const starter = (task.activeMachineRun as { startedByOperatorId?: string } | null)?.startedByOperatorId;
        const key = input.people.find((person) => input.ledger.id(`person:${person}`) === starter);
        if (key && starter) {
          const operator = await input.transport.operator(starter, input.secrets.operatorPin(key));
          const stopped = await operator.request("POST", `/api/execution-machine-runs/${enc(runId)}/stop`);
          (stopped.ok ? stoppedRuns : errors).push(`${plan}:${task.seqLabel}:run:${stopped.ok ? "stopped" : stopped.body?.error ?? stopped.status}`);
        }
      }
      for (const participant of active) {
        const key = input.people.find((person) => input.ledger.id(`person:${person}`) === participant.personId);
        if (!key) {
          continue;
        }
        const operator = await input.transport.operator(participant.personId, input.secrets.operatorPin(key));
        const left = await operator.request("POST", `/api/execution-tasks/${enc(task.taskId)}/leave`);
        (left.ok ? closedSessions : errors).push(`${plan}:${task.seqLabel}:${key}:${left.ok ? "left" : left.body?.error ?? left.status}`);
      }
    }
  }
  return { closedSessions, stoppedRuns, errors };
}
