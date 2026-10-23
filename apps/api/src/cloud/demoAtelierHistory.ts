import { readdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { buildDemoFile, type DemoFileKey } from "./demoAtelierFiles.js";
import type { DemoTransport } from "./demoAtelierHttp.js";
import {
  demoAcmValues,
  demoLettersValues,
  type DemoPersonKey,
} from "./demoAtelierIdentity.js";
import type { DemoLedger } from "./demoAtelierLedger.js";
import type { DemoSecrets } from "./demoAtelierSecrets.js";
import { readPlanTasks, type DemoTask } from "./demoAtelierSeed.js";
import {
  ACM,
  LETTERS,
  acceptAndOrder,
  ensureRequest,
  freezeQuote,
  releaseAndPlan,
  requireOk,
} from "./ownerReviewSeed.js";

/**
 * N-019 synthetic history H1 (Owner GO "Ceas simulat", 2026-10-23).
 *
 * Historical jobs for existing demo customers are written by the unchanged
 * engine through its HTTP routes, in-process, while a simulated clock (see
 * installSimulatedClock) supplies "now". Every hash, ID, dependency,
 * eligibility and exclusivity check is the engine's own. The clock exists
 * only inside the history script process; the normal runtime never sees it.
 * All data produced here is synthetic.
 */

export const DEMO_HISTORY_ID = "H1";
/** Onboarding moment the init/prepare setup window is shifted to (2026-09-28 09:00 EEST). */
export const DEMO_HISTORY_ONBOARDING_AT = "2026-09-28T06:00:00.000Z";

/** Romania local time (EEST, UTC+3) — valid for the H1 dates, all before 2026-10-25. */
export function eest(text: string): number {
  const [date, time] = text.split(" ");
  const [year, month, day] = date!.split("-").map(Number);
  const [hour, minute] = time!.split(":").map(Number);
  return Date.UTC(year!, month! - 1, day!, hour! - 3, minute!);
}

export type HistoryJobKey = "alphaShowroom" | "quartzEntrance" | "helixLogo" | "pineRestaurant" | "signReception" | "orbitDirectional";

type HistoryFile = {
  key: string;
  file: DemoFileKey;
  purpose: string;
  note: string;
  at: string;
  supersedes?: string;
  linkTo: Array<{ processId: string; scope?: string }>;
};

export type HistoryJob = {
  key: HistoryJobKey;
  customerKey: string;
  title: string;
  description: string;
  product: typeof LETTERS | typeof ACM;
  values: Record<string, unknown>;
  requestAt: string;
  quoteAt: string;
  acceptAt?: string;
  releaseAt?: string;
  files?: HistoryFile[];
};

export type HistoryBlock = {
  job: HistoryJobKey;
  seq: string;
  processId: string;
  primary: DemoPersonKey;
  start: string;
  end: string;
  finish: "complete" | "qualityPass" | "leave";
  machine?: boolean;
  helpers?: Array<{ who: DemoPersonKey; from: string; to: string }>;
  pauses?: Array<{ from: string; to: string }>;
  file?: string;
  note: string;
};

const CNC = "CUT_SHEET_CNC";
const PROFILE = "FORM_ALUMINIUM_PROFILE";

export const HISTORY_JOBS: readonly HistoryJob[] = [
  {
    key: "alphaShowroom",
    customerKey: "alpha",
    title: "Litere volumetrice showroom Alpha — Brașov",
    description: "Istoric sintetic N-019 H1: litere frontlit pentru showroom-ul Alpha Clima.",
    product: LETTERS,
    values: demoLettersValues("ALPHA SHOWROOM"),
    requestAt: "2026-10-01 10:00",
    quoteAt: "2026-10-01 15:30",
    acceptAt: "2026-10-05 09:30",
    releaseAt: "2026-10-05 11:00",
    files: [
      { key: "drawing-v1", file: "alphaDrawingV1", purpose: "WORKING", note: "Desen inițial (istoric sintetic).", at: "2026-10-05 11:30", linkTo: [{ processId: CNC, scope: "FACE" }] },
      { key: "drawing-v2", file: "alphaDrawingV2", purpose: "EXECUTION_READY", note: "Revizie aprobată; înlocuiește v1.", at: "2026-10-05 16:00", supersedes: "drawing-v1", linkTo: [{ processId: CNC }, { processId: PROFILE }, { processId: "BOND_LETTER_BODY" }] },
      { key: "contour", file: "alphaContour", purpose: "EXECUTION_READY", note: "Contur CNC.", at: "2026-10-05 16:05", linkTo: [{ processId: CNC }] },
    ],
  },
  {
    key: "quartzEntrance",
    customerKey: "quartz",
    title: "Casetă luminoasă intrare Quartz",
    description: "Istoric sintetic N-019 H1: casetă ACM la intrarea clinicii Quartz.",
    product: ACM,
    values: demoAcmValues("QUARTZ INTRARE", 2000, 600),
    requestAt: "2026-10-02 09:15",
    quoteAt: "2026-10-02 14:00",
    acceptAt: "2026-10-07 10:00",
    releaseAt: "2026-10-07 11:30",
  },
  {
    key: "helixLogo",
    customerKey: "helix",
    title: "Logo recepție Helix — față colantată, volum vopsit",
    description: "Istoric sintetic N-019 H1: litere cu folie pe față și volum vopsit RAL.",
    product: LETTERS,
    values: demoLettersValues("HELIX LOGO", { faceVinylColor: "Albastru închis", volumePaintColor: "RAL 7016" }),
    requestAt: "2026-10-06 11:00",
    quoteAt: "2026-10-07 09:30",
    acceptAt: "2026-10-09 15:00",
    releaseAt: "2026-10-12 09:00",
    files: [
      { key: "colors", file: "helixColorSpec", purpose: "TECHNICAL_REFERENCE", note: "Culori folie și vopsea.", at: "2026-10-12 09:30", linkTo: [{ processId: "APPLY_SURFACE_FINISH" }, { processId: "PAINT_RAL" }] },
    ],
  },
  {
    key: "pineRestaurant",
    customerKey: "pine",
    title: "Litere restaurant Pine",
    description: "Istoric sintetic N-019 H1: litere frontlit pentru restaurantul hotelului.",
    product: LETTERS,
    values: demoLettersValues("PINE"),
    requestAt: "2026-10-12 10:00",
    quoteAt: "2026-10-13 12:00",
    acceptAt: "2026-10-15 10:30",
    releaseAt: "2026-10-16 09:00",
    files: [
      { key: "contour", file: "pineContour", purpose: "EXECUTION_READY", note: "Contur CNC.", at: "2026-10-16 09:20", linkTo: [{ processId: CNC }] },
    ],
  },
  {
    key: "signReception",
    customerKey: "sign",
    title: "Panou recepție Sign Pro",
    description: "Istoric sintetic N-019 H1: casetă ACM pentru recepție; eliberată, neîncepută.",
    product: ACM,
    values: demoAcmValues("SIGN PRO", 1800, 500),
    requestAt: "2026-10-14 13:00",
    quoteAt: "2026-10-15 10:00",
    acceptAt: "2026-10-21 11:00",
    releaseAt: "2026-10-22 14:00",
  },
  {
    key: "orbitDirectional",
    customerKey: "orbit",
    title: "Panou direcțional parcare Orbit",
    description: "Istoric sintetic N-019 H1: ofertă trimisă, neacceptată.",
    product: ACM,
    values: demoAcmValues("ORBIT P", 1200, 400),
    requestAt: "2026-10-08 09:00",
    quoteAt: "2026-10-09 11:00",
  },
];

/** Operation blocks in local time. Lunch 12:00–12:30; a shift ends at 16:30. */
export const HISTORY_BLOCKS: readonly HistoryBlock[] = [
  // Alpha showroom — Tue 6 and Wed 7 Oct, finished.
  { job: "alphaShowroom", seq: "01", processId: CNC, primary: "cnc1", start: "2026-10-06 08:00", end: "2026-10-06 10:30", finish: "complete", machine: true, helpers: [{ who: "cnc2", from: "2026-10-06 08:20", to: "2026-10-06 09:40" }], pauses: [{ from: "2026-10-06 09:15", to: "2026-10-06 09:35" }], note: "Ion cu Ana; pauza lui Ion, Ana continuă" },
  { job: "alphaShowroom", seq: "07", processId: PROFILE, primary: "cant", start: "2026-10-06 08:10", end: "2026-10-06 14:40", finish: "complete", machine: true, file: "history:H1:file:alphaShowroom:drawing-v2", helpers: [{ who: "weldAlu", from: "2026-10-06 10:00", to: "2026-10-06 11:50" }], pauses: [{ from: "2026-10-06 12:00", to: "2026-10-06 12:30" }], note: "Radu cu Dan pe CNC Cant Litere" },
  { job: "alphaShowroom", seq: "02", processId: CNC, primary: "cnc1", start: "2026-10-06 10:40", end: "2026-10-06 12:50", finish: "complete", machine: true, file: "history:H1:file:alphaShowroom:contour", pauses: [{ from: "2026-10-06 12:00", to: "2026-10-06 12:30" }], note: "Ion debitează fața" },
  { job: "alphaShowroom", seq: "03", processId: "PLACE_LED_MODULES", primary: "electric", start: "2026-10-06 10:45", end: "2026-10-06 12:00", finish: "complete", note: "Module LED" },
  { job: "alphaShowroom", seq: "04", processId: "WIRE_LIGHTING", primary: "electric", start: "2026-10-06 12:30", end: "2026-10-06 13:40", finish: "complete", note: "Cablare" },
  { job: "alphaShowroom", seq: "05", processId: "INSTALL_OR_CONNECT_PSU", primary: "electric", start: "2026-10-06 13:50", end: "2026-10-06 14:35", finish: "complete", note: "Sursă" },
  { job: "alphaShowroom", seq: "06", processId: "TEST_LIGHTING_IGNITION", primary: "electric", start: "2026-10-06 14:45", end: "2026-10-06 15:10", finish: "complete", note: "Probă aprindere" },
  { job: "alphaShowroom", seq: "08", processId: "BOND_LETTER_BODY", primary: "assembly1", start: "2026-10-06 14:50", end: "2026-10-07 10:20", finish: "complete", helpers: [{ who: "assembly2", from: "2026-10-07 08:00", to: "2026-10-07 09:30" }], pauses: [{ from: "2026-10-06 16:30", to: "2026-10-07 08:00" }], note: "Lipire peste noapte; Vlad ajută dimineața" },
  { job: "alphaShowroom", seq: "09", processId: "CLOSE_LETTER_BODY", primary: "assembly1", start: "2026-10-07 10:30", end: "2026-10-07 12:00", finish: "complete", note: "Închidere corp" },
  { job: "alphaShowroom", seq: "10", processId: "TEST_ILLUMINATION_UNIFORMITY", primary: "quality", start: "2026-10-07 12:40", end: "2026-10-07 13:15", finish: "qualityPass", note: "Paul: uniformitate" },
  { job: "alphaShowroom", seq: "11", processId: "INSPECT_FINISHED_LETTER", primary: "quality", start: "2026-10-07 13:20", end: "2026-10-07 14:05", finish: "qualityPass", note: "Paul: control final" },
  { job: "alphaShowroom", seq: "12", processId: "PACK_PRODUCT", primary: "assembly2", start: "2026-10-07 14:15", end: "2026-10-07 15:00", finish: "complete", note: "Ambalare" },
  // Quartz entrance — Fri 9 Oct, finished.
  { job: "quartzEntrance", seq: "01", processId: "CUT_METAL_STOCK", primary: "weldSteel", start: "2026-10-09 08:00", end: "2026-10-09 09:10", finish: "complete", machine: true, note: "Sorin debitează cadrul" },
  { job: "quartzEntrance", seq: "02", processId: CNC, primary: "cnc2", start: "2026-10-09 08:15", end: "2026-10-09 10:05", finish: "complete", machine: true, note: "Ana debitează ACM" },
  { job: "quartzEntrance", seq: "03", processId: "FORM_SHEET_CASSETTE", primary: "assembly2", start: "2026-10-09 10:20", end: "2026-10-09 13:30", finish: "complete", helpers: [{ who: "assembly1", from: "2026-10-09 10:30", to: "2026-10-09 11:45" }], pauses: [{ from: "2026-10-09 12:00", to: "2026-10-09 12:30" }], note: "Vlad cu Maria formează caseta" },
  { job: "quartzEntrance", seq: "04", processId: "ATTACH_INTERNAL_FRAME", primary: "assembly2", start: "2026-10-09 13:40", end: "2026-10-09 15:20", finish: "complete", note: "Prindere cadru" },
  { job: "quartzEntrance", seq: "05", processId: "PACK_PRODUCT", primary: "assembly1", start: "2026-10-09 15:30", end: "2026-10-09 16:10", finish: "complete", note: "Ambalare" },
  // Helix logo — Tue 13 to Thu 15 Oct, finished.
  { job: "helixLogo", seq: "01", processId: CNC, primary: "cnc2", start: "2026-10-13 08:00", end: "2026-10-13 09:50", finish: "complete", machine: true, note: "Ana debitează spatele" },
  { job: "helixLogo", seq: "02", processId: CNC, primary: "cnc1", start: "2026-10-13 10:00", end: "2026-10-13 11:50", finish: "complete", machine: true, helpers: [{ who: "cnc2", from: "2026-10-13 10:00", to: "2026-10-13 10:45" }], note: "Ion cu Ana pe față" },
  { job: "helixLogo", seq: "08", processId: PROFILE, primary: "weldAlu", start: "2026-10-13 08:00", end: "2026-10-13 12:00", finish: "complete", machine: true, helpers: [{ who: "cant", from: "2026-10-13 09:00", to: "2026-10-13 11:00" }], note: "Dan cu Radu pe cant" },
  { job: "helixLogo", seq: "04", processId: "PLACE_LED_MODULES", primary: "electric", start: "2026-10-13 10:00", end: "2026-10-13 11:30", finish: "complete", note: "Module LED" },
  { job: "helixLogo", seq: "05", processId: "WIRE_LIGHTING", primary: "electric", start: "2026-10-13 11:40", end: "2026-10-13 13:10", finish: "complete", pauses: [{ from: "2026-10-13 12:00", to: "2026-10-13 12:30" }], note: "Cablare cu pauză de prânz" },
  { job: "helixLogo", seq: "06", processId: "INSTALL_OR_CONNECT_PSU", primary: "electric", start: "2026-10-13 13:20", end: "2026-10-13 14:00", finish: "complete", note: "Sursă" },
  { job: "helixLogo", seq: "07", processId: "TEST_LIGHTING_IGNITION", primary: "electric", start: "2026-10-13 14:10", end: "2026-10-13 14:30", finish: "complete", note: "Probă aprindere" },
  { job: "helixLogo", seq: "03", processId: "APPLY_SURFACE_FINISH", primary: "finish", start: "2026-10-13 12:30", end: "2026-10-13 14:30", finish: "complete", file: "history:H1:file:helixLogo:colors", note: "Irina aplică folia" },
  { job: "helixLogo", seq: "09", processId: "BOND_LETTER_BODY", primary: "assembly2", start: "2026-10-13 14:40", end: "2026-10-14 09:00", finish: "complete", pauses: [{ from: "2026-10-13 16:30", to: "2026-10-14 08:00" }], note: "Lipire peste noapte" },
  { job: "helixLogo", seq: "10", processId: "CLOSE_LETTER_BODY", primary: "assembly2", start: "2026-10-14 09:10", end: "2026-10-14 10:40", finish: "complete", helpers: [{ who: "assembly1", from: "2026-10-14 09:10", to: "2026-10-14 10:00" }], note: "Vlad cu Maria închid corpul" },
  { job: "helixLogo", seq: "11", processId: "PAINT_RAL", primary: "finish", start: "2026-10-14 11:00", end: "2026-10-14 14:20", finish: "complete", pauses: [{ from: "2026-10-14 12:00", to: "2026-10-14 12:30" }], note: "Irina vopsește volumul" },
  { job: "helixLogo", seq: "12", processId: "TEST_ILLUMINATION_UNIFORMITY", primary: "quality", start: "2026-10-15 08:30", end: "2026-10-15 09:00", finish: "qualityPass", note: "Paul: uniformitate, după uscare" },
  { job: "helixLogo", seq: "13", processId: "INSPECT_FINISHED_LETTER", primary: "quality", start: "2026-10-15 09:10", end: "2026-10-15 09:50", finish: "qualityPass", note: "Paul: control final" },
  { job: "helixLogo", seq: "14", processId: "PACK_PRODUCT", primary: "assembly2", start: "2026-10-15 10:00", end: "2026-10-15 10:50", finish: "complete", note: "Ambalare" },
  // Pine restaurant — Mon 19 to Thu 22 Oct, in execution.
  { job: "pineRestaurant", seq: "01", processId: CNC, primary: "cnc1", start: "2026-10-19 08:00", end: "2026-10-19 10:10", finish: "complete", machine: true, file: "history:H1:file:pineRestaurant:contour", helpers: [{ who: "cnc2", from: "2026-10-19 08:00", to: "2026-10-19 08:50" }], note: "Ion cu Ana pe spate" },
  { job: "pineRestaurant", seq: "07", processId: PROFILE, primary: "cant", start: "2026-10-19 08:00", end: "2026-10-19 15:00", finish: "complete", machine: true, pauses: [{ from: "2026-10-19 12:00", to: "2026-10-19 12:30" }], note: "Radu, cu pauză de prânz" },
  { job: "pineRestaurant", seq: "02", processId: CNC, primary: "cnc1", start: "2026-10-19 10:20", end: "2026-10-19 12:00", finish: "complete", machine: true, note: "Ion pe față" },
  { job: "pineRestaurant", seq: "03", processId: "PLACE_LED_MODULES", primary: "electric", start: "2026-10-19 10:30", end: "2026-10-19 12:00", finish: "complete", note: "Module LED" },
  { job: "pineRestaurant", seq: "04", processId: "WIRE_LIGHTING", primary: "electric", start: "2026-10-20 08:00", end: "2026-10-20 09:10", finish: "complete", note: "Cablare" },
  { job: "pineRestaurant", seq: "05", processId: "INSTALL_OR_CONNECT_PSU", primary: "electric", start: "2026-10-20 09:20", end: "2026-10-20 10:00", finish: "complete", note: "Sursă" },
  { job: "pineRestaurant", seq: "06", processId: "TEST_LIGHTING_IGNITION", primary: "electric", start: "2026-10-20 10:10", end: "2026-10-20 10:30", finish: "complete", note: "Probă aprindere" },
  { job: "pineRestaurant", seq: "08", processId: "BOND_LETTER_BODY", primary: "assembly1", start: "2026-10-20 08:00", end: "2026-10-20 10:30", finish: "complete", helpers: [{ who: "assembly2", from: "2026-10-20 08:30", to: "2026-10-20 09:30" }], note: "Maria cu Vlad" },
  { job: "pineRestaurant", seq: "09", processId: "CLOSE_LETTER_BODY", primary: "assembly1", start: "2026-10-22 08:00", end: "2026-10-22 09:30", finish: "leave", note: "Maria începe închiderea; operația rămâne în lucru" },
];

export type HistoryEvent = {
  id: string;
  at: number;
  kind:
    | "request"
    | "quote"
    | "accept"
    | "release"
    | "upload"
    | "start"
    | "leave"
    | "complete"
    | "qualityPass"
    | "machineStart"
    | "machineStop"
    | "useFile";
  job: HistoryJobKey;
  seq?: string;
  processId?: string;
  who?: DemoPersonKey;
  file?: string;
  note: string;
};

const MINUTE = 60_000;

/** Expands jobs and operation blocks into one ordered event list. */
export function buildHistoryEvents(
  jobs: readonly HistoryJob[] = HISTORY_JOBS,
  blocks: readonly HistoryBlock[] = HISTORY_BLOCKS,
): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  const push = (event: HistoryEvent) => events.push(event);
  for (const job of jobs) {
    push({ id: `${job.key}:request`, at: eest(job.requestAt), kind: "request", job: job.key, note: job.title });
    push({ id: `${job.key}:quote`, at: eest(job.quoteAt), kind: "quote", job: job.key, note: "Ofertă" });
    if (job.acceptAt) push({ id: `${job.key}:accept`, at: eest(job.acceptAt), kind: "accept", job: job.key, note: "Acceptare și comandă" });
    if (job.releaseAt) push({ id: `${job.key}:release`, at: eest(job.releaseAt), kind: "release", job: job.key, note: "Eliberare, plan și planificare" });
    for (const file of job.files ?? []) {
      push({ id: `${job.key}:file:${file.key}`, at: eest(file.at), kind: "upload", job: job.key, file: file.key, note: file.note });
    }
  }
  for (const block of blocks) {
    const base = `${block.job}:${block.seq}`;
    const op = { job: block.job, seq: block.seq, processId: block.processId };
    const start = eest(block.start);
    const end = eest(block.end);
    push({ id: `${base}:start`, at: start, kind: "start", who: block.primary, ...op, note: block.note });
    if (block.file) push({ id: `${base}:file`, at: start + MINUTE, kind: "useFile", who: block.primary, file: block.file, ...op, note: "Folosește fișierul" });
    if (block.machine) push({ id: `${base}:run`, at: start + 3 * MINUTE, kind: "machineStart", who: block.primary, ...op, note: "Utilaj pornit" });
    for (const [index, helper] of (block.helpers ?? []).entries()) {
      const from = eest(helper.from);
      const to = Math.min(eest(helper.to), end - MINUTE);
      push({ id: `${base}:helper${index}:join`, at: Math.max(from, start + 30_000), kind: "start", who: helper.who, ...op, note: "Se alătură" });
      push({ id: `${base}:helper${index}:leave`, at: to, kind: "leave", who: helper.who, ...op, note: "Pleacă; operația continuă" });
    }
    for (const [index, pause] of (block.pauses ?? []).entries()) {
      const from = eest(pause.from);
      const to = eest(pause.to);
      const covered = (block.helpers ?? []).some((helper) => eest(helper.from) <= from && eest(helper.to) >= to);
      if (block.machine && !covered) push({ id: `${base}:pause${index}:runStop`, at: from - 2 * MINUTE, kind: "machineStop", who: block.primary, ...op, note: "Utilaj oprit la pauză" });
      push({ id: `${base}:pause${index}:leave`, at: from, kind: "leave", who: block.primary, ...op, note: "Pauză" });
      push({ id: `${base}:pause${index}:back`, at: to, kind: "start", who: block.primary, ...op, note: "Reintrare" });
      if (block.machine && !covered) push({ id: `${base}:pause${index}:runStart`, at: to + 3 * MINUTE, kind: "machineStart", who: block.primary, ...op, note: "Utilaj repornit" });
    }
    if (block.machine) push({ id: `${base}:runStop`, at: end - 3 * MINUTE, kind: "machineStop", who: block.primary, ...op, note: "Utilaj oprit" });
    push({ id: `${base}:${block.finish}`, at: end, kind: block.finish, who: block.primary, ...op, note: block.finish === "leave" ? "Ieșire la final de tură" : "Încheiere" });
  }
  return events
    .map((event, order) => ({ event, order }))
    .sort((left, right) => left.event.at - right.event.at || left.order - right.order)
    .map((item) => item.event);
}

type Interval = { owner: string; from: number; to: number; id: string };

/**
 * Static checks before anything is written: one open interval per person,
 * one active run per machine operation, events strictly between the onboarding
 * moment and the cutoff (the first pre-existing request), and working days.
 */
export function validateHistory(events: readonly HistoryEvent[], cutoffMs: number): string[] {
  const problems: string[] = [];
  const onboarding = Date.parse(DEMO_HISTORY_ONBOARDING_AT);
  for (const event of events) {
    if (event.at <= onboarding + 10 * MINUTE || event.at >= cutoffMs) {
      problems.push(`out_of_window:${event.id}`);
    }
    const day = new Date(event.at + 3 * 60 * MINUTE).getUTCDay();
    if (day === 0 || day === 6) problems.push(`weekend:${event.id}`);
  }
  const open = new Map<string, number>();
  const sessions: Interval[] = [];
  for (const event of events) {
    if (!event.who || !event.seq) continue;
    const key = `${event.who}`;
    if (event.kind === "start") {
      if (open.has(key)) problems.push(`person_overlap:${event.id}`);
      open.set(key, event.at);
    } else if (event.kind === "leave" || event.kind === "complete" || event.kind === "qualityPass") {
      const from = open.get(key);
      if (from === undefined) {
        if (event.kind === "leave") problems.push(`leave_without_session:${event.id}`);
        continue;
      }
      sessions.push({ owner: key, from, to: event.at, id: event.id });
      open.delete(key);
      if (event.at - from < MINUTE) problems.push(`subminute_session:${event.id}`);
    }
  }
  for (const [who] of open) problems.push(`session_left_open:${who}`);
  void sessions;
  return problems;
}

type Clock = { set(ms: number): void };

/**
 * Process-local simulated clock: replaces the global Date constructor of this
 * process only. Monotonic; refuses to move backwards or past the real time.
 */
export function installSimulatedClock(startMs: number): Clock & { restore(): void; realNow(): number } {
  const RealDate = Date;
  const realNow = () => RealDate.now();
  let simulated = startMs;
  class SimulatedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        simulated += 1;
        super(simulated);
      } else {
        // @ts-expect-error forwarding constructor overloads
        super(...args);
      }
    }
    static override now(): number {
      simulated += 1;
      return simulated;
    }
  }
  globalThis.Date = SimulatedDate as DateConstructor;
  return {
    set(ms: number) {
      // Same-minute events: keep the few milliseconds the previous request consumed.
      if (ms < simulated - 60_000) throw new Error(`simulated_clock_backwards:${new RealDate(ms).toISOString()}`);
      if (ms >= realNow()) throw new Error(`simulated_clock_future:${new RealDate(ms).toISOString()}`);
      simulated = Math.max(ms, simulated);
    },
    restore() {
      globalThis.Date = RealDate;
    },
    realNow,
  };
}

const DEFAULT_EXECUTOR: Partial<Record<string, DemoPersonKey>> = {
  CNC_ROUTING: "cnc1",
  PROFILE_FORMING: "cant",
  METAL_CUTTING: "weldSteel",
  ELECTRICAL_ASSEMBLY: "electric",
  MANUAL_ASSEMBLY: "assembly1",
  QUALITY_CONTROL: "quality",
  PACKAGING: "assembly2",
  VINYL_APPLICATION: "finish",
  PAINTING: "finish",
};

const DEFAULT_PROVIDER: Partial<Record<string, string>> = {
  CNC_ROUTING: "CNC 4020",
  PROFILE_FORMING: "CNC Cant Litere",
  METAL_CUTTING: "Debitator metale",
  ELECTRICAL_ASSEMBLY: "Montaj LED / electric",
  VINYL_APPLICATION: "Zonă aplicare folie",
  PAINTING: "Cabină vopsire",
  MANUAL_ASSEMBLY: "Masă asamblare 2",
};

const PLANNED_MINUTES: Record<string, number> = {
  CUT_SHEET_CNC: 120,
  FORM_ALUMINIUM_PROFILE: 360,
  APPLY_SURFACE_FINISH: 120,
  PLACE_LED_MODULES: 90,
  WIRE_LIGHTING: 75,
  INSTALL_OR_CONNECT_PSU: 45,
  TEST_LIGHTING_IGNITION: 25,
  BOND_LETTER_BODY: 150,
  CLOSE_LETTER_BODY: 90,
  TEST_ILLUMINATION_UNIFORMITY: 30,
  INSPECT_FINISHED_LETTER: 45,
  PACK_PRODUCT: 45,
  CUT_METAL_STOCK: 60,
  FORM_SHEET_CASSETTE: 180,
  ATTACH_INTERNAL_FRAME: 100,
  PAINT_RAL: 180,
};

function enc(value: string): string {
  return encodeURIComponent(value);
}

type RunContext = {
  connect: () => Promise<DemoTransport>;
  ledger: DemoLedger;
  secrets: DemoSecrets;
  log: (line: string) => void;
};

async function taskFor(t: DemoTransport, ledger: DemoLedger, event: HistoryEvent): Promise<DemoTask> {
  const planId = ledger.id(`history:H1:plan:${event.job}`);
  if (!planId) throw new Error(`history_plan_unknown:${event.job}`);
  const task = (await readPlanTasks(t.client, planId)).find((item) => item.seqLabel === event.seq);
  if (!task || task.processId !== event.processId) throw new Error(`history_task_shape:${event.job}:${event.seq}:${event.processId}`);
  return task;
}

async function plan(t: DemoTransport, ledger: DemoLedger, job: HistoryJob, planId: string): Promise<void> {
  const primaries = new Map(HISTORY_BLOCKS.filter((block) => block.job === job.key).map((block) => [block.seq, block.primary]));
  for (const task of await readPlanTasks(t.client, planId)) {
    if (task.plannedEffortMinutes == null) {
      await requireOk(await t.client.request("POST", `/api/execution-tasks/${enc(task.taskId)}/planned-effort`, { plannedEffortMinutes: PLANNED_MINUTES[task.processId] ?? 60 }), `history_effort:${task.seqLabel}`);
    }
    if (task.requiresProvider && !task.assignedProvider) {
      const wanted = DEFAULT_PROVIDER[task.requiredCapabilityId];
      const provider = task.eligibleProviders?.find((item) => item.label === wanted) ?? task.eligibleProviders?.[0];
      if (!provider) throw new Error(`history_no_provider:${job.key}:${task.seqLabel}`);
      await requireOk(await t.client.request("POST", `/api/execution-tasks/${enc(task.taskId)}/provider`, { providerId: provider.id }), `history_provider:${task.seqLabel}`);
    }
    const personKey = primaries.get(task.seqLabel) ?? DEFAULT_EXECUTOR[task.requiredCapabilityId];
    const personId = personKey ? ledger.id(`person:${personKey}`) : undefined;
    if (personId && !task.assignedExecutor) {
      await requireOk(await t.client.request("POST", `/api/execution-tasks/${enc(task.taskId)}/executor`, { personId }), `history_executor:${job.key}:${task.seqLabel}`);
    }
  }
}

async function jobIdForPlan(t: DemoTransport, planId: string): Promise<string> {
  const jobs = ((await t.client.request("GET", "/api/jobs")).body?.overview as { jobs?: Array<{ jobId: string; planId?: string | null }> })?.jobs ?? [];
  const jobId = jobs.find((item) => item.planId === planId)?.jobId;
  if (!jobId) throw new Error(`history_job_missing:${planId}`);
  return jobId;
}

async function executeEvent(ctx: RunContext, event: HistoryEvent): Promise<string> {
  const t = await ctx.connect();
  const job = HISTORY_JOBS.find((item) => item.key === event.job)!;
  const customerId = ctx.ledger.id(`customer:${job.customerKey}`);
  if (!customerId) throw new Error(`history_customer_unknown:${job.customerKey}`);
  switch (event.kind) {
    case "request": {
      const request = await ensureRequest(t.client, customerId, job.title, job.description);
      ctx.ledger.setId(`history:H1:request:${job.key}`, request.requestId);
      return request.requestId;
    }
    case "quote": {
      const requestId = ctx.ledger.id(`history:H1:request:${job.key}`)!;
      const quote = await freezeQuote(t.client, job.product, job.values, customerId, requestId);
      ctx.ledger.setId(`history:H1:quote:${job.key}`, String(quote.quoteSnapshotId));
      return String(quote.quoteSnapshotId);
    }
    case "accept": {
      const order = await acceptAndOrder(t.client, job.product, ctx.ledger.id(`history:H1:quote:${job.key}`)!);
      ctx.ledger.setId(`history:H1:order:${job.key}`, order.orderSnapshotId);
      return order.orderSnapshotId;
    }
    case "release": {
      const released = await releaseAndPlan(t.client, job.product, ctx.ledger.id(`history:H1:order:${job.key}`)!);
      ctx.ledger.setId(`history:H1:plan:${job.key}`, released.planId);
      await plan(t, ctx.ledger, job, released.planId);
      return released.planId;
    }
    case "upload": {
      const spec = job.files!.find((item) => item.key === event.file)!;
      const planId = ctx.ledger.id(`history:H1:plan:${job.key}`)!;
      const jobId = await jobIdForPlan(t, planId);
      const upload = await buildDemoFile(spec.file);
      const supersedes = spec.supersedes ? ctx.ledger.id(`history:H1:file:${job.key}:${spec.supersedes}`) : undefined;
      const created = await t.upload(`/api/jobs/${enc(jobId)}/files`, { purpose: spec.purpose, note: `${spec.note} [istoric sintetic N-019]`, ...(supersedes ? { supersedesArtifactId: supersedes } : {}) }, upload);
      if (!created.ok) throw new Error(`history_upload:${created.body?.error ?? created.status}`);
      const files = (created.body?.archive as { files?: Array<{ artifactId: string; originalFileName: string; uploadedAt: string }> } | undefined)?.files ?? [];
      const artifactId = files.filter((item) => item.originalFileName === upload.name).sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt))[0]?.artifactId;
      if (!artifactId) throw new Error("history_upload_artifact_missing");
      ctx.ledger.setId(`history:H1:file:${job.key}:${spec.key}`, artifactId);
      for (const task of await readPlanTasks(t.client, planId)) {
        if (spec.linkTo.some((link) => link.processId === task.processId && (!link.scope || task.scope.endsWith(link.scope)))) {
          await requireOk(await t.client.request("POST", `/api/jobs/${enc(jobId)}/file-links`, { artifactId, taskId: task.taskId }), `history_link:${task.seqLabel}`);
        }
      }
      return artifactId;
    }
    default: {
      const task = await taskFor(t, ctx.ledger, event);
      const personId = ctx.ledger.id(`person:${event.who}`);
      if (!personId) throw new Error(`history_person_unknown:${event.who}`);
      const operator = await t.operator(personId, ctx.secrets.operatorPin(event.who!));
      const base = `/api/execution-tasks/${enc(task.taskId)}`;
      let response;
      if (event.kind === "start") response = await operator.request("POST", `${base}/start`);
      else if (event.kind === "leave") response = await operator.request("POST", `${base}/leave`);
      else if (event.kind === "qualityPass") response = await operator.request("POST", `${base}/quality-pass`, { note: event.note });
      else if (event.kind === "machineStart") response = await operator.request("POST", `${base}/machine-runs/start`);
      else if (event.kind === "complete") {
        const measurable = task.measurableQuantity as { value?: number } | null | undefined;
        response = await operator.request("POST", `${base}/complete`, task.requiresCompletedQuantity && typeof measurable?.value === "number" ? { completedQuantity: measurable.value } : {});
      } else if (event.kind === "machineStop") {
        const runId = task.activeMachineRun?.machineRunId;
        if (!runId) throw new Error(`history_no_active_run:${event.id}`);
        response = await operator.request("POST", `/api/execution-machine-runs/${enc(runId)}/stop`);
      } else {
        const artifactId = event.file ? ctx.ledger.id(event.file) : undefined;
        if (!artifactId) throw new Error(`history_file_unknown:${event.file}`);
        response = await operator.request("POST", `${base}/artifact-use`, { artifactId });
      }
      if (!response.ok) throw new Error(`history_refused:${event.id}:${response.status}:${response.body?.error ?? ""}`);
      return String(response.status);
    }
  }
}

/**
 * Runs H1 at simulated times. Each event is recorded in the ledger as soon as
 * the engine accepts it; a rerun skips recorded events. Any engine refusal
 * stops the run: nothing is forced or worked around.
 */
export async function runHistory(input: RunContext & { clock: Clock; events?: readonly HistoryEvent[] }): Promise<{ executed: number; skipped: number }> {
  let executed = 0;
  let skipped = 0;
  for (const event of input.events ?? buildHistoryEvents()) {
    const key = `history:H1:event:${event.id}`;
    if (input.ledger.has(key)) {
      skipped += 1;
      continue;
    }
    input.clock.set(event.at);
    const detail = await executeEvent(input, event);
    input.ledger.mark(key, detail);
    executed += 1;
    input.log(`${new Date(event.at).toISOString()} ${event.id} — ${event.note}`);
  }
  return { executed, skipped };
}

export function demoPlaneSqlitePath(root: string): string {
  const planes = readdirSync(join(root, "organizations"), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (planes.length !== 1) throw new Error(`history_expected_one_plane:${planes.length}`);
  return join(root, "organizations", planes[0]!.name, "product-system.sqlite");
}

/** Read-only: the first pre-existing commercial request. Every history event must precede it. */
export function readHistoryCutoff(root: string): number {
  const db = new Database(demoPlaneSqlitePath(root), { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare("SELECT MIN(created_at) AS first FROM commercial_requests").get() as { first: string | null };
    if (!row.first) throw new Error("history_no_existing_requests");
    return Date.parse(row.first);
  } finally {
    db.close();
  }
}

/** Read-only: the init/prepare setup window (plane binding → first pre-existing request). */
export function readSetupWindow(root: string): { from: string; to: string } {
  const db = new Database(demoPlaneSqlitePath(root), { readonly: true, fileMustExist: true });
  try {
    const bound = db.prepare("SELECT bound_at FROM operational_plane_identity").get() as { bound_at: string };
    return { from: bound.bound_at, to: new Date(readHistoryCutoff(root)).toISOString() };
  } finally {
    db.close();
  }
}

/**
 * Read-only guard: the latest registry creation (customers, people, skill
 * assignments, machines, workcenters) when it is not before the first history
 * event, otherwise null. H1 must never predate the entities it uses.
 */
export function setupAfterHistory(root: string, firstEventMs: number): string | null {
  const db = new Database(demoPlaneSqlitePath(root), { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare(`
      SELECT MAX(at) AS latest FROM (
        SELECT created_at AS at FROM customers
        UNION ALL SELECT created_at FROM people
        UNION ALL SELECT assigned_at FROM person_skill_assignments
        UNION ALL SELECT created_at FROM organization_machines
        UNION ALL SELECT created_at FROM organization_workcenters
      )`).get() as { latest: string | null };
    return row.latest && Date.parse(row.latest) >= firstEventMs ? row.latest : null;
  } finally {
    db.close();
  }
}

/** H1 is applied once per root; a recorded application refuses every later run. */
export function assertHistoryNotApplied(ledger: DemoLedger): void {
  if (ledger.has(`history:${DEMO_HISTORY_ID}`)) {
    throw new Error("demo_history_already_applied");
  }
}
