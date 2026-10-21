/**
 * People etalon — deterministic synthetic job history for the job sheet "Oameni" section.
 *
 * Test infrastructure only. Every event goes through the canonical HTTP routes
 * (or, for the one legacy untracked start, the canonical runtime method) while the
 * caller controls the clock. Nothing here computes production truth for the product:
 * the expectations below are an independent reading of the raw intervals, used to
 * check the engine's projection.
 */
import { ensureOwnerReviewProvisioned } from "../../src/cloud/ownerReviewReset.js";
import { OWNER_REVIEW_OPERATOR_PIN } from "../../src/cloud/ownerReviewIdentity.js";
import { OPERATOR_SESSION_COOKIE } from "../../src/operator/store.js";
import { cloudCookie, openCloudFixture, type CloudFixture } from "../cloud-harness.js";

type Json = Record<string, any>;

export type PersonKey = "andrei" | "elena" | "mihai" | "ioana" | "radu" | "cristina";
export type StateKey = "A" | "B" | "C" | "D";

/** Fictional people, qualified through the canonical capability → skill foundation. */
export const PEOPLE: Record<PersonKey, { name: string; skills: string[] }> = {
  andrei: { name: "Andrei Pop", skills: ["SK_CNC_OPERATOR", "SK_METAL_CUTTING_OPERATOR"] },
  elena: { name: "Elena Dinu", skills: ["SK_LETTER_CANT_OPERATOR", "SK_LETTER_MODELING", "SK_ASSEMBLY"] },
  mihai: { name: "Mihai Stan", skills: ["SK_ELECTRICIAN"] },
  ioana: { name: "Ioana Matei", skills: ["SK_ELECTRICIAN", "SK_ASSEMBLY"] },
  radu: { name: "Radu Ionescu", skills: ["SK_ASSEMBLY"] },
  cristina: { name: "Cristina Vlad", skills: ["SK_ASSEMBLY", "SK_CNC_OPERATOR"] },
};

/** One exclusive machine per provider-bound capability, so claims bind it automatically. */
const RESOURCES = [
  { workcenter: "Zonă CNC", capability: "CNC_ROUTING", machine: "Router CNC 3015" },
  { workcenter: "Zonă debitare metal", capability: "METAL_CUTTING", machine: "Fierăstrău profile metal" },
  { workcenter: "Zonă profile litere", capability: "PROFILE_FORMING", machine: "Mașină profil aluminiu" },
  { workcenter: "Zonă ansamblare", capability: "MANUAL_ASSEMBLY", machine: "Banc ansamblare" },
] as const;

type Action =
  | { enter: string; who: PersonKey }
  | { leave: string; who: PersonKey }
  | { complete: string; who: PersonKey }
  | { quality: string; who: PersonKey; note: string }
  | { runStart: string; who: PersonKey }
  | { runStop: string; who: PersonKey }
  | { issue: string; who: PersonKey; reason: string; text: string }
  | { observation: string; who: PersonKey; text: string }
  | { uploadJob: string; purpose: string; note?: string; supersedes?: string; linkTo: string[] }
  | { uploadTask: string; on: string; who: PersonKey; supersedes?: string }
  | { use: string; on: string; who: PersonKey }
  | { untrackedStart: string; executor: PersonKey };

type Step = { day: 1 | 2 | 3; at: string; action: Action; only?: "tracked" | "partial" };

/**
 * ACM cassette 2400×600 mm with front-lit letters. Seq labels are the canonical plan's.
 * Times are Europe/Bucharest wall-clock on the job's own three days.
 */
const STORY: Step[] = [
  { day: 1, at: "07:15", action: { uploadJob: "panou-acm-2400x600.dxf", purpose: "EXECUTION_READY", note: "Desfășurată casetă ACM", linkTo: ["12"] } },
  { day: 1, at: "07:18", action: { uploadJob: "litere-fata-v1.dxf", purpose: "EXECUTION_READY", linkTo: ["01", "02"] } },
  { day: 1, at: "07:20", action: { uploadJob: "schema-cablaj-v1.pdf", purpose: "TECHNICAL_REFERENCE", linkTo: ["04"] } },
  { day: 1, at: "07:30", action: { enter: "12", who: "andrei" } },
  { day: 1, at: "07:32", action: { use: "panou-acm-2400x600.dxf", on: "12", who: "andrei" } },
  { day: 1, at: "07:35", action: { enter: "07", who: "elena" } },
  { day: 1, at: "07:40", action: { runStart: "12", who: "andrei" } },
  { day: 1, at: "07:50", action: { runStart: "07", who: "elena" } },
  { day: 1, at: "08:35", action: { runStop: "12", who: "andrei" } },
  { day: 1, at: "08:50", action: { complete: "12", who: "andrei" } },
  { day: 1, at: "08:55", action: { enter: "11", who: "andrei" } },
  { day: 1, at: "09:00", action: { enter: "13", who: "radu" } },
  { day: 1, at: "09:05", action: { runStart: "11", who: "andrei" } },
  { day: 1, at: "09:20", action: { enter: "13", who: "cristina" } },
  { day: 1, at: "09:40", action: { runStop: "07", who: "elena" } },
  { day: 1, at: "09:50", action: { runStop: "11", who: "andrei" } },
  { day: 1, at: "10:05", action: { complete: "07", who: "elena" } },
  { day: 1, at: "10:10", action: { complete: "11", who: "andrei" } },
  { day: 1, at: "10:30", action: { leave: "13", who: "cristina" } },
  { day: 1, at: "10:35", action: { uploadJob: "litere-fata-v2.dxf", purpose: "EXECUTION_READY", note: "Contur corectat la litera R", supersedes: "litere-fata-v1.dxf", linkTo: ["01", "02"] } },
  { day: 1, at: "10:40", action: { enter: "01", who: "cristina" } },
  { day: 1, at: "10:42", action: { use: "litere-fata-v2.dxf", on: "01", who: "cristina" } },
  { day: 1, at: "10:50", action: { runStart: "01", who: "cristina" } },
  { day: 1, at: "11:15", action: { complete: "13", who: "radu" } },
  { day: 1, at: "11:30", action: { enter: "14", who: "radu" } },
  { day: 1, at: "11:40", action: { enter: "14", who: "elena" } },
  { day: 1, at: "11:45", action: { runStop: "01", who: "cristina" } },
  { day: 1, at: "12:00", action: { complete: "01", who: "cristina" } },
  { day: 1, at: "12:05", action: { enter: "02", who: "andrei" } },
  { day: 1, at: "12:07", action: { use: "litere-fata-v2.dxf", on: "02", who: "andrei" } },
  { day: 1, at: "12:10", action: { runStart: "02", who: "andrei" } },
  { day: 1, at: "12:20", action: { issue: "14", who: "radu", reason: "MATERIAL", text: "Lipsesc colțarii de aluminiu pentru cadrul intern; așteptăm din depozit." } },
  { day: 1, at: "12:22", action: { leave: "14", who: "elena" } },
  { day: 1, at: "12:25", action: { leave: "14", who: "radu" } },
  { day: 1, at: "13:10", action: { enter: "14", who: "radu" } },
  { day: 1, at: "13:12", action: { observation: "14", who: "radu", text: "Colțarii au sosit din depozit; reluăm prinderea cadrului." } },
  { day: 1, at: "13:20", action: { enter: "14", who: "elena" } },
  { day: 1, at: "13:20", action: { runStop: "02", who: "andrei" } },
  { day: 1, at: "13:35", action: { complete: "02", who: "andrei" } },
  { day: 1, at: "13:45", action: { enter: "03", who: "mihai" } },
  { day: 1, at: "14:00", action: { enter: "03", who: "ioana" } },
  { day: 1, at: "14:30", action: { leave: "14", who: "elena" } },
  { day: 1, at: "14:40", action: { enter: "08", who: "elena" } },
  { day: 1, at: "15:40", action: { complete: "14", who: "radu" } },
  { day: 1, at: "16:00", action: { leave: "03", who: "mihai" } },
  { day: 1, at: "16:30", action: { leave: "03", who: "ioana" } },
  { day: 1, at: "16:45", action: { leave: "08", who: "elena" } },
  { day: 1, at: "22:30", action: { enter: "08", who: "cristina" } },
  { day: 2, at: "01:15", action: { leave: "08", who: "cristina" } },
  { day: 2, at: "07:30", action: { enter: "03", who: "mihai" } },
  { day: 2, at: "07:35", action: { enter: "03", who: "ioana" } },
  { day: 2, at: "07:40", action: { enter: "08", who: "elena" } },
  { day: 2, at: "09:05", action: { leave: "03", who: "ioana" } },
  { day: 2, at: "09:10", action: { complete: "03", who: "mihai" } },
  { day: 2, at: "09:20", action: { enter: "04", who: "ioana" } },
  { day: 2, at: "09:25", action: { enter: "04", who: "mihai" } },
  { day: 2, at: "10:00", action: { observation: "04", who: "mihai", text: "Traseu de cablu modificat la litera R; schema actualizată." } },
  { day: 2, at: "10:05", action: { uploadTask: "schema-cablaj-v2.pdf", on: "04", who: "mihai", supersedes: "schema-cablaj-v1.pdf" } },
  { day: 2, at: "10:10", action: { use: "schema-cablaj-v2.pdf", on: "04", who: "ioana" } },
  { day: 2, at: "11:50", action: { complete: "08", who: "elena" } },
  { day: 2, at: "12:00", action: { leave: "04", who: "mihai" } },
  { day: 2, at: "12:10", action: { complete: "04", who: "ioana" } },
  { day: 2, at: "12:40", action: { enter: "05", who: "mihai" } },
  { day: 2, at: "13:30", action: { complete: "05", who: "mihai" } },
  { day: 2, at: "13:45", action: { enter: "06", who: "ioana" } },
  { day: 2, at: "13:50", action: { enter: "06", who: "mihai" } },
  { day: 2, at: "14:05", action: { issue: "06", who: "ioana", reason: "OTHER", text: "Modul LED defect în litera O; înlocuit din stoc." } },
  { day: 2, at: "14:20", action: { leave: "06", who: "ioana" } },
  { day: 2, at: "14:40", action: { complete: "06", who: "mihai" } },
  { day: 2, at: "14:50", action: { enter: "09", who: "elena" } },
  { day: 2, at: "15:00", action: { enter: "09", who: "radu" } },
  { day: 2, at: "16:30", action: { leave: "09", who: "radu" } },
  { day: 2, at: "17:00", action: { leave: "09", who: "elena" } },
  { day: 3, at: "07:30", action: { enter: "09", who: "elena" } },
  { day: 3, at: "07:35", action: { enter: "09", who: "radu" } },
  { day: 3, at: "07:45", action: { enter: "09", who: "cristina" } },
  { day: 3, at: "08:40", action: { leave: "09", who: "cristina" } },
  { day: 3, at: "09:20", action: { leave: "09", who: "radu" } },
  { day: 3, at: "09:30", action: { complete: "09", who: "elena" } },
  { day: 3, at: "09:40", action: { enter: "10", who: "ioana" } },
  { day: 3, at: "10:30", action: { quality: "10", who: "ioana", note: "Iluminare uniformă pe toate literele." } },
  { day: 3, at: "10:40", action: { enter: "15", who: "radu" }, only: "tracked" },
  { day: 3, at: "10:40", action: { untrackedStart: "15", executor: "radu" }, only: "partial" },
  { day: 3, at: "10:45", action: { enter: "15", who: "cristina" } },
  { day: 3, at: "11:00", action: { enter: "15", who: "elena" } },
  { day: 3, at: "11:20", action: { enter: "15", who: "radu" }, only: "partial" },
  { day: 3, at: "12:00", action: { leave: "15", who: "elena" } },
  { day: 3, at: "12:30", action: { leave: "15", who: "cristina" } },
  { day: 3, at: "13:10", action: { complete: "15", who: "radu" } },
  { day: 3, at: "13:20", action: { enter: "16", who: "ioana" } },
  { day: 3, at: "14:05", action: { quality: "16", who: "ioana", note: "Control final conform; fără defecte vizibile." } },
  { day: 3, at: "14:15", action: { enter: "17", who: "radu" } },
  { day: 3, at: "14:20", action: { enter: "17", who: "cristina" } },
  { day: 3, at: "15:20", action: { leave: "17", who: "cristina" } },
  { day: 3, at: "15:30", action: { complete: "17", who: "radu" } },
];

/** Four reproducible cuts of the same history, on separate days so no person or machine is double-booked. */
export const STATES: Record<StateKey, { title: string; customer: string; inscription: string;
  dayOffsets: [number, number, number]; cut: { day: 1 | 2 | 3; at: string } | null; variant: "tracked" | "partial" }> = {
  C: { title: "Etalon Oameni C — finalizată, evidență completă", customer: "Farmacia Lumina Demo SRL", inscription: "LUMINA",
    dayOffsets: [-16, -15, -14], cut: null, variant: "tracked" },
  D: { title: "Etalon Oameni D — finalizată, evidență parțială", customer: "Cofetăria Orizont Demo SRL", inscription: "ORIZONT",
    dayOffsets: [-9, -8, -7], cut: null, variant: "partial" },
  B: { title: "Etalon Oameni B — în lucru, nimeni activ", customer: "Optica Clar Demo SRL", inscription: "CLAR",
    dayOffsets: [-6, -5, -4], cut: { day: 2, at: "18:00" }, variant: "tracked" },
  A: { title: "Etalon Oameni A — în lucru, oameni activi", customer: "Brutăria Spic Demo SRL", inscription: "SPIC",
    dayOffsets: [-2, -1, 0], cut: { day: 3, at: "08:30" }, variant: "tracked" },
};
export const STATE_ORDER: StateKey[] = ["C", "D", "B", "A"];

function addDays(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Europe/Bucharest wall clock → ISO instant (handles the October DST change). */
export function localIso(date: string, hm: string): string {
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Bucharest", timeZoneName: "shortOffset" })
    .formatToParts(new Date(date + "T12:00:00Z")).find(p => p.type === "timeZoneName")!.value; // e.g. GMT+3
  const hours = Number(offset.replace("GMT", "") || 0);
  return new Date(Date.parse(`${date}T${hm}:00Z`) - hours * 3_600_000).toISOString();
}

function stepIso(state: StateKey, anchor: string, day: 1 | 2 | 3, at: string): string {
  return localIso(addDays(anchor, STATES[state].dayOffsets[day - 1]), at);
}

export function stateSteps(state: StateKey, anchor: string) {
  const { cut, variant } = STATES[state];
  const cutAt = cut ? stepIso(state, anchor, cut.day, cut.at) : null;
  return STORY
    .filter(step => !step.only || step.only === variant)
    .map(step => ({ ...step, iso: stepIso(state, anchor, step.day, step.at) }))
    .filter(step => !cutAt || step.iso <= cutAt)
    .sort((a, b) => a.iso.localeCompare(b.iso));
}

export function stateAsOf(state: StateKey, anchor: string): string {
  const { cut } = STATES[state];
  return cut ? stepIso(state, anchor, cut.day, cut.at) : stepIso(state, anchor, 3, "18:00");
}

export type RawSession = { person: PersonKey; seq: string; startedAt: string; endedAt: string | null; endKind: "LEFT" | "COMPLETED" | null };
export type RawRun = { seq: string; machine: string; startedAt: string; completedAt: string | null };

/** Independent reading of the raw intervals a state's steps produce. */
export function rawHistory(state: StateKey, anchor: string) {
  const sessions: RawSession[] = [];
  const runs: RawRun[] = [];
  const started = new Map<string, string>();
  const completed = new Map<string, string>();
  const machineOf = (seq: string) => (["01", "02", "12"].includes(seq) ? RESOURCES[0] : seq === "11" ? RESOURCES[1] : RESOURCES[2]).machine;
  for (const step of stateSteps(state, anchor)) {
    const a = step.action;
    if ("enter" in a) { sessions.push({ person: a.who, seq: a.enter, startedAt: step.iso, endedAt: null, endKind: null }); if (!started.has(a.enter)) started.set(a.enter, step.iso); }
    if ("untrackedStart" in a) started.set(a.untrackedStart, step.iso);
    if ("leave" in a) Object.assign(sessions.find(s => s.person === a.who && s.seq === a.leave && !s.endedAt)!, { endedAt: step.iso, endKind: "LEFT" });
    const done = "complete" in a ? a.complete : "quality" in a ? a.quality : null;
    if (done) { completed.set(done, step.iso); for (const s of sessions) if (s.seq === done && !s.endedAt) Object.assign(s, { endedAt: step.iso, endKind: "COMPLETED" }); }
    if ("runStart" in a) runs.push({ seq: a.runStart, machine: machineOf(a.runStart), startedAt: step.iso, completedAt: null });
    if ("runStop" in a) runs.find(r => r.seq === a.runStop && !r.completedAt)!.completedAt = step.iso;
  }
  return { sessions, runs, started, completed };
}

const ms = (from: string, to: string) => Date.parse(to) - Date.parse(from);

export function unionMs(intervals: { startedAt: string; endedAt: string | null }[], asOf: string): number {
  const sorted = intervals.map(i => [Date.parse(i.startedAt), Date.parse(i.endedAt ?? asOf)] as const).sort((a, b) => a[0] - b[0]);
  let total = 0, end = -Infinity;
  for (const [s, e] of sorted) { if (e > end) { total += e - Math.max(s, end); end = e; } }
  return total;
}

/** Expected totals from raw intervals (never from rounded labels). */
export function expectedTotals(state: StateKey, anchor: string, taskCount: number) {
  const asOf = stateAsOf(state, anchor);
  const { sessions, runs, started, completed } = rawHistory(state, anchor);
  const duration = (s: RawSession) => ms(s.startedAt, s.endedAt ?? asOf);
  const people = (Object.keys(PEOPLE) as PersonKey[]).map(key => {
    const own = sessions.filter(s => s.person === key);
    return { key, name: PEOPLE[key].name, sessions: own.length, milliseconds: own.reduce((n, s) => n + duration(s), 0),
      active: own.filter(s => !s.endedAt).map(s => s.seq) };
  }).filter(p => p.sessions > 0);
  const bySeq = new Map<string, number>();
  for (const s of sessions) bySeq.set(s.seq, (bySeq.get(s.seq) ?? 0) + duration(s));
  const firstStart = [...started.values()].sort()[0]!;
  const finished = completed.size === taskCount;
  const lastEnd = [...completed.values()].sort().at(-1)!;
  return {
    asOf, finished, sessions, runs,
    totalMs: sessions.reduce((n, s) => n + duration(s), 0),
    activeMs: unionMs(sessions, asOf),
    elapsedMs: ms(firstStart, finished ? lastEnd : asOf),
    machineMs: runs.filter(r => r.completedAt).reduce((n, r) => n + ms(r.startedAt, r.completedAt!), 0),
    people, bySeq,
  };
}

/** Physical constraints the history must respect, checked on raw intervals. */
export function physicalViolations(state: StateKey, anchor: string): string[] {
  const asOf = stateAsOf(state, anchor);
  const { sessions, runs } = rawHistory(state, anchor);
  const overlaps = <T>(items: T[], key: (t: T) => string, span: (t: T) => [number, number], label: string) => {
    const out: string[] = [];
    const groups = new Map<string, T[]>();
    for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
    for (const [k, list] of groups) {
      const sorted = list.map(span).sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < sorted.length; i++) if (sorted[i]![0] < sorted[i - 1]![1]) out.push(`${label}:${k}`);
    }
    return out;
  };
  return [
    ...overlaps(sessions, s => s.person, s => [Date.parse(s.startedAt), Date.parse(s.endedAt ?? asOf)], "person"),
    ...overlaps(runs, r => r.machine, r => [Date.parse(r.startedAt), Date.parse(r.completedAt ?? asOf)], "machine"),
  ];
}

// ---------------------------------------------------------------------------
// Driver: canonical HTTP routes, in-process, clock supplied by the caller.

export type EtalonJob = { state: StateKey; jobId: string; planId: string; title: string; taskIds: Record<string, string> };

export async function seedPeopleEtalon(input: { cloudRoot: string; anchor: string; clock: (iso: string) => void }) {
  const { cloudRoot, anchor, clock } = input;
  clock(localIso(addDays(anchor, STATES.C.dayOffsets[0] - 1), "16:00"));
  const provisioned = await ensureOwnerReviewProvisioned({ cloudRoot });
  const fx: CloudFixture = openCloudFixture(cloudRoot);
  try {
    // Cloud and operator sessions expire as the controlled clock moves across days,
    // so the owner signs in again and the operator identifies with the PIN, as on the shop floor.
    let owner = "";
    const signIn = async () => {
      const login = await fx.app.request("/api/cloud/login", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: provisioned.identity.email, password: provisioned.identity.password, organizationId: provisioned.organizationId }),
      });
      owner = cloudCookie(login);
    };
    await signIn();
    const personIds = {} as Record<PersonKey, string>;
    const operator = async (key: PersonKey, retried = false): Promise<string> => {
      const response = await fx.app.request("/api/operator-session", { method: "POST",
        headers: { cookie: owner, "content-type": "application/json" },
        body: JSON.stringify({ personId: personIds[key], pin: OWNER_REVIEW_OPERATOR_PIN }) });
      if (response.status === 401 && !retried) { await signIn(); return operator(key, true); }
      const match = (response.headers.get("set-cookie") ?? "").match(new RegExp(`${OPERATOR_SESSION_COOKIE}=([^;]+)`));
      if (!response.ok || !match) throw new Error(`operator_session:${key}:${response.status}`);
      return `${OPERATOR_SESSION_COOKIE}=${match[1]}`;
    };
    const call = async (method: string, path: string, body?: Json | FormData, who?: PersonKey, retried = false): Promise<Json> => {
      const headers: Record<string, string> = { cookie: who ? `${owner}; ${await operator(who)}` : owner };
      if (body && !(body instanceof FormData)) headers["content-type"] = "application/json";
      const response = await fx.app.request(path, { method, headers,
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
      const json = (await response.json().catch(() => ({}))) as Json;
      if (response.status === 401 && !retried) { await signIn(); return call(method, path, body, who, true); }
      if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${json.error ?? ""}`);
      return json;
    };
    await call("PATCH", "/api/seller", { legalName: "WorkOS Test SRL", brand: "WorkOS Test", fiscalId: "RO99999999",
      tradeRegister: "J40/9999/2024", address: "Strada Sintetică 1", locality: "București", iban: "RO49AAAA1B31007593840000", bank: "Banca Sintetică" });
    const skills = ((await call("GET", "/api/people/skills")).skills as Json[]);
    for (const key of Object.keys(PEOPLE) as PersonKey[]) {
      const person = (await call("POST", "/api/people", { displayName: PEOPLE[key].name })).person as Json;
      personIds[key] = person.personId;
      for (const code of PEOPLE[key].skills) {
        await call("POST", `/api/people/${encodeURIComponent(person.personId)}/skills`, { skillId: skills.find(s => s.code === code)!.skillId });
      }
      await call("PUT", `/api/people/${encodeURIComponent(person.personId)}/operator-pin`, { pin: OWNER_REVIEW_OPERATOR_PIN, confirmPin: OWNER_REVIEW_OPERATOR_PIN });
    }
    for (const r of RESOURCES) {
      const wc = (await call("POST", "/api/workcenters", { label: r.workcenter, lifecycle: "ACTIVE", capabilityIds: [r.capability] })).workcenter as Json;
      await call("POST", "/api/machines", { label: r.machine, workcenterId: wc.id, lifecycle: "ACTIVE", capabilityIds: [r.capability] });
    }
    const runtime =fx.registry.getOrOpen(fx.controlPlane.getPlaneByOrganization(provisioned.organizationId)!, fx.controlPlane.cloudRoot);

    const jobs: EtalonJob[] = [];
    for (const state of STATE_ORDER) {
      const spec = STATES[state];
      clock(stepIso(state, anchor, 1, "06:30"));
      const customer = (await call("POST", "/api/customers", { displayName: spec.customer })).customer as Json;
      const created = await call("POST", "/api/requests", { customerId: customer.customerId, title: spec.title,
        description: "Panou ACM casetat 2400×600 mm cu litere luminoase front-lit. Date sintetice pentru etalonul secțiunii Oameni." });
      const requestId = ((created.request ?? created.detail.request) as Json).requestId as string;
      const assemblyId = ((await call("POST", "/api/assemblies", { requestId })).assembly as Json).assemblyId as string;
      const a = `/api/assemblies/${encodeURIComponent(assemblyId)}`;
      const acm = { "root.inscription": spec.inscription, "face.widthMm": 2400, "face.heightMm": 600, "face.cassetteDepthMm": 40 };
      const letters = { "root.inscription": spec.inscription, "face.finish": "none", "face.confirmedAreaMm2": 250000,
        "volume.depthMm": "60", "volume.finish": "none", "volume.confirmedPerimeterMm": 12500 };
      const acmReview = await call("POST", "/api/products/PRD-ACM-CASSETTE-NONE/preview", { values: acm, requestId });
      await call("POST", `${a}/members`, { role: "SUPPORT_PANEL", values: acm, reviewId: acmReview.reviewId, manualProductNetPrice: 500 });
      const lettersReview = await call("POST", "/api/products/PRD-LETTERS-FRONTLIT-PLEXI-AL06/preview", { values: letters, requestId });
      await call("POST", `${a}/members`, { role: "SIGNAGE_LETTERS", values: letters, reviewId: lettersReview.reviewId, manualProductNetPrice: 500 });
      await call("POST", `${a}/confirm`);
      const pending = ((await call("GET", a)).assembly as Json).rateAcknowledgement as Json | null;
      await call("POST", `${a}/quote`, pending?.status === "REQUIRED" ? { rateAcknowledgement: { bindingHash: pending.bindingHash } } : {});
      await call("POST", `${a}/accept`, { quoteSnapshotId: ((await call("GET", a)).assembly as Json).quoteSnapshotId });
      await call("POST", `${a}/production`);
      await call("POST", `${a}/execution-plan`);
      const planId = ((await call("GET", a)).assembly as Json).executionPlanId as string;
      const plan = (await call("GET", `/api/execution-plans/${encodeURIComponent(planId)}`)).executionPlan as Json;
      const taskIds = Object.fromEntries((plan.tasks as Json[]).map(t => [t.seqLabel, t.taskId])) as Record<string, string>;
      const quantity = Object.fromEntries((plan.tasks as Json[]).map(t => [t.seqLabel, t.measurableQuantity?.value as number | undefined]));
      const job = ((await call("GET", "/api/jobs")).overview.jobs as Json[]).find(j => j.planId === planId)!;
      jobs.push({ state, jobId: job.jobId, planId, title: spec.title, taskIds });

      const artifacts = new Map<string, string>();
      const runIds = new Map<string, string>();
      for (const step of stateSteps(state, anchor)) {
        clock(step.iso);
        const act = step.action;
        const task = (seq: string) => `/api/execution-tasks/${encodeURIComponent(taskIds[seq]!)}`;
        if ("enter" in act) await call("POST", `${task(act.enter)}/start`, undefined, act.who);
        else if ("leave" in act) await call("POST", `${task(act.leave)}/leave`, undefined, act.who);
        else if ("complete" in act) await call("POST", `${task(act.complete)}/complete`,
          quantity[act.complete] !== undefined ? { completedQuantity: quantity[act.complete] } : {}, act.who);
        else if ("quality" in act) await call("POST", `${task(act.quality)}/quality-pass`, { note: act.note }, act.who);
        else if ("runStart" in act) {
          const result = await call("POST", `${task(act.runStart)}/machine-runs/start`, undefined, act.who);
          const updated = ((result.executionPlan as Json).tasks as Json[]).find(t => t.taskId === taskIds[act.runStart]!)!;
          runIds.set(act.runStart, (updated.activeMachineRun as Json).machineRunId);
        } else if ("runStop" in act) await call("POST", `/api/execution-machine-runs/${encodeURIComponent(runIds.get(act.runStop)!)}/stop`, undefined, act.who);
        else if ("issue" in act) await call("POST", `${task(act.issue)}/issues`, { text: act.text, reason: act.reason }, act.who);
        else if ("observation" in act) await call("POST", `${task(act.observation)}/observations`, { text: act.text }, act.who);
        else if ("uploadJob" in act) {
          const form = new FormData();
          form.set("file", new File([`Fișier sintetic ${act.uploadJob}`], act.uploadJob, { type: act.uploadJob.endsWith(".pdf") ? "application/pdf" : "application/dxf" }));
          form.set("purpose", act.purpose);
          if (act.note) form.set("note", act.note);
          if (act.supersedes) form.set("supersedesArtifactId", artifacts.get(act.supersedes)!);
          const archive = (await call("POST", `/api/jobs/${encodeURIComponent(job.jobId)}/files`, form)).archive as Json;
          const file = (archive.files as Json[]).find(f => f.originalFileName === act.uploadJob && !artifacts.has(act.uploadJob) && ![...artifacts.values()].includes(f.artifactId))!;
          artifacts.set(act.uploadJob, file.artifactId);
          for (const seq of act.linkTo) await call("POST", `${task(seq)}/artifact-links`, { artifactId: file.artifactId });
        } else if ("uploadTask" in act) {
          const form = new FormData();
          form.set("file", new File([`Fișier sintetic ${act.uploadTask}`], act.uploadTask, { type: "application/pdf" }));
          form.set("purpose", "TECHNICAL_REFERENCE");
          if (act.supersedes) form.set("supersedesArtifactId", artifacts.get(act.supersedes)!);
          const dossier = (await call("POST", `${task(act.on)}/artifacts`, form, act.who)).dossier as Json;
          const file = (dossier.files as Json[]).find(f => f.originalFileName === act.uploadTask)!;
          artifacts.set(act.uploadTask, file.artifactId);
        } else if ("use" in act) await call("POST", `${task(act.on)}/artifact-use`, { artifactId: artifacts.get(act.use)! }, act.who);
        else if ("untrackedStart" in act) {
          await call("POST", `${task(act.untrackedStart)}/executor`, { personId: personIds[act.executor] });
          const started = runtime.startExecutionTask(taskIds[act.untrackedStart]!);
          if (!started.ok) throw new Error(`untracked_start:${started.error}`);
        }
      }
    }
    return { organizationId: provisioned.organizationId, personIds, jobs,
      readRecord: async (jobId: string) => (await call("GET", `/api/jobs/${encodeURIComponent(jobId)}/record`)).record as Json,
      close: () => fx.close() };
  } catch (error) {
    fx.close();
    throw error;
  }
}
