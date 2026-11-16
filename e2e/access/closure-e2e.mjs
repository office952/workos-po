// V1 Organization Access · acceptance closure E2E (Owner GO, points A and B) on a SYNTHETIC runtime.
// A: an invited Atelier account identifies an operator by PIN, starts, documents and completes a real
//    released operation under the existing execution rules, and never sees money.
// B: one account in organizations A (Atelier) and B (Producție): switching updates role, navigation,
//    clears organization-bound state and the operator identity, and refuses the other side's resources.
// Usage: node closure-e2e.mjs --base URL --root <synthetic root> --orgb-email E --orgb-secret-file F
//        --evidence DIR --chrome EXE --profiles DIR --context-out FILE
// Passwords, PINs and tokens stay in memory; the link field and PIN are never captured.
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createHarness, sleep } from "./cdp-harness.mjs";

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const BASE = arg("base"); const ROOT = arg("root");
const identity = JSON.parse(readFileSync(`${ROOT}/.reference-identity.json`, "utf8"));
const pins = JSON.parse(readFileSync(`${ROOT}/demo-atelier-secrets.json`, "utf8")).operatorPins;
const orgB = { email: arg("orgb-email"), password: readFileSync(arg("orgb-secret-file"), "utf8").trim() };
const h = createHarness({ base: BASE, evidence: arg("evidence"), chrome: arg("chrome"), profiles: arg("profiles") });
const { check } = h;
const MONEY = /\b\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?\s?(?:EUR|RON|lei|€)\b/i;
const MONEY_KEYS = /"(?:unitPrice|totalPrice|price|priceNet|priceGross|grossTotal|netTotal|subtotal|vatAmount|internalCost|costTotal|unitCost|margin|clientPrice|iban|bank)"\s*:\s*(?!null)/i;
const navLabels = (page) => page.eval(`[...document.querySelectorAll('.app-shell__modules .app-shell__module-label, .app-shell__switcher-sheet .app-shell__module-label')].map(e=>e.textContent.trim())`);
const context = {};

async function acceptAsNew(page, link) {
  await page.goto(link.replace(/^https?:\/\/[^/]+/, BASE), 2500);
  const password = `${randomBytes(12).toString("base64url")}7a`; // policy: letters + a digit
  await page.type("#acct-new-password", password);
  await page.type("#acct-confirm-password", password);
  await page.click("Acceptă invitația");
  await sleep(3500);
  return password;
}
async function invite(page, email, role) {
  const r = await h.fetchJson(page, "/api/admin/access/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role }) });
  if (r.status !== 201) throw new Error(`invite ${role} ${r.status}`);
  return r.body.inviteUrl;
}
async function identify(page, personName, pin) {
  await page.goto("/atelier", 3000);
  const value = await page.eval(`([...document.querySelectorAll('#operator-person option')].find(o => o.textContent.includes(${JSON.stringify(personName)}))||{}).value ?? null`);
  if (!value) return false;
  await page.type("#operator-person", value);
  await page.type("#operator-pin", pin);
  await page.click("Identifică operatorul");
  return page.waitFor(`document.body.innerText.includes('pot fi pornite')`, 15000);
}
async function switchOrganization(page, organizationId) {
  await page.eval(`([...document.querySelectorAll('button')].find(b => /cont/i.test(b.textContent) && b.closest('.account-area'))||{click(){}}).click()`);
  await sleep(500);
  const ok = await page.type("#active-organization", organizationId);
  await sleep(3500);
  return ok;
}

const owner = await h.launch(9371, "c-owner");
const worker = await h.launch(9372, "c-worker");
const dual = await h.launch(9373, "c-dual");
try {
  await owner.page.goto("/", 1500);
  check("A0 owner signs in (synthetic organization A)", (await h.loginInPage(owner.page, identity.users.owner.email, identity.password)) === 200);

  // ── A · Atelier end to end ───────────────────────────────────────────────
  await worker.page.viewport(1440);
  await acceptAsNew(worker.page, await invite(owner.page, "atelier.flux@workos.test", "workshop"));
  const workerSession = await h.fetchJson(worker.page, "/api/cloud/session");
  check("A1 invited user accepted and is signed in as Atelier", workerSession.body?.organization?.role === "workshop" || workerSession.body?.membership?.role === "workshop" || /Atelier/.test(JSON.stringify(workerSession.body?.organization ?? workerSession.body)), workerSession.body?.organization?.roleLabel ?? null);
  await worker.page.goto("/", 2500);
  check("A2 Atelier navigation is Lucrări + Atelier", JSON.stringify(await navLabels(worker.page)) === JSON.stringify(["Lucrări", "Atelier"]));
  check("A3 operator identified by PIN in Atelier", await identify(worker.page, "Ion CNC Demo", pins.cnc1));
  const inboxText = await worker.page.text();
  check("A4 Atelier inbox shows no money", !MONEY.test(inboxText));
  await worker.page.shot("closure_atelier_inbox_1440_light", { route: "/atelier", state: "operator identified, released work", viewport: "1440x900", theme: "Lumină" });

  const href = await worker.page.eval(`([...document.querySelectorAll('main a')].find(a => a.textContent.includes('Deschide operația') && a.textContent.includes('Debitare foaie CNC'))||{}).getAttribute?.('href') ?? null`);
  check("A5 a released, startable operation is listed", Boolean(href));
  const url = new URL(href, BASE);
  context.planId = url.searchParams.get("plan"); context.taskId = url.searchParams.get("task"); context.jobId = url.searchParams.get("job");
  await worker.page.goto(href, 3500);
  const before = await h.fetchJson(worker.page, `/api/execution-plans/${encodeURIComponent(context.planId)}`);
  const taskBefore = (before.body?.tasks ?? before.body?.executionPlan?.tasks ?? []).find((t) => t.taskId === context.taskId);
  check("A6 selected operation is PLANNED before work", taskBefore?.status === "PLANNED", taskBefore?.status);
  // Completing before starting is refused by the existing rules (nothing simplified).
  const early = await h.fetchJson(worker.page, `/api/execution-tasks/${encodeURIComponent(context.taskId)}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check("A7 completion before start is refused by the execution rules", early.status >= 400 && early.status < 500, early.status);

  check("A8 operator starts the operation", await worker.page.click("Pornește operația"));
  check("A9 operation is in progress", await worker.page.waitFor(`document.body.innerText.includes('Finalizează operația')`, 15000));
  // Record an action: an observation in the operation dossier.
  await worker.page.click("Adaugă observație");
  await sleep(600);
  const obsField = await worker.page.eval(`(document.querySelector('[id$="-observation"]')||{}).id ?? null`);
  await worker.page.type(`[id="${obsField}"]`, "Foaie verificată înainte de debitare (E2E sintetic).");
  await sleep(300);
  await worker.page.click("Salvează observația");
  check("A10 operator records an observation on the operation", await worker.page.waitFor(`document.body.innerText.includes('Observația a fost adăugată')`, 10000));
  // Completion with the quantities the existing form asks for.
  const fields = await worker.page.eval(`[...document.querySelectorAll('main input[id^="actual-"]')].filter(e=>e.offsetParent).map(e => e.id)`);
  const planned = await worker.page.eval(`(() => { const m = document.body.innerText.match(/Suprafață\\s+([0-9.,]+)\\s*m2/); return m ? m[1].replace(',', '.') : '1'; })()`);
  for (const id of fields) await worker.page.type(`[id="${id}"]`, planned.replace(".", ","));
  await sleep(300);
  await worker.page.shot("closure_atelier_operation_in_progress_1440_light", { route: "/atelier?task=…", state: "operation in progress, completion form", viewport: "1440x900", theme: "Lumină" });
  check("A11 operation workspace shows no money", !MONEY.test(await worker.page.text()));
  await worker.page.click("Finalizează operația");
  await sleep(1200);
  // A confirmation dialog, when the existing flow asks for one.
  await worker.page.eval(`(() => { const d = document.querySelector('dialog[open], [role=dialog]'); if (!d) return false; const b = [...d.querySelectorAll('button')].find(x => /Finalizează|Confirmă/.test(x.textContent)); if (b) b.click(); return Boolean(b); })()`);
  await sleep(3000);
  const after = await h.fetchJson(worker.page, `/api/execution-plans/${encodeURIComponent(context.planId)}`);
  const taskAfter = (after.body?.tasks ?? after.body?.executionPlan?.tasks ?? []).find((t) => t.taskId === context.taskId);
  check("A12 server records the operation as COMPLETED", taskAfter?.status === "COMPLETED", { status: taskAfter?.status, visible: (await worker.page.text()).slice(0, 0) });
  check("A13 work session attributed to the identified operator", JSON.stringify(taskAfter?.workSessions ?? []).includes("Ion CNC Demo") || JSON.stringify(taskAfter ?? {}).includes("dabcdb9a"), (taskAfter?.workSessions ?? []).length);
  const dossier = await h.fetchJson(worker.page, `/api/execution-tasks/${encodeURIComponent(context.taskId)}/dossier`);
  check("A14 observation persisted in the operation dossier", JSON.stringify(dossier.body ?? {}).includes("Foaie verificată înainte de debitare"), dossier.status);
  check("A15 execution answers carry no price/cost/bank values", !MONEY_KEYS.test(JSON.stringify(after.body)) && !MONEY_KEYS.test(JSON.stringify(dossier.body)));
  for (const path of ["/api/quotes", "/api/customers", "/api/seller", "/api/admin/commercial-policy"]) {
    check(`A16 Atelier refused by the server: ${path}`, (await h.fetchJson(worker.page, path)).status === 403);
  }
  await worker.page.goto(`/lucrari/${encodeURIComponent(context.jobId)}`, 3000);
  const sheet = await worker.page.text();
  const trailLinks = await worker.page.eval(`[...document.querySelectorAll('.job-trail a')].map(a => a.getAttribute('href'))`);
  check("A17 job sheet keeps the client name, with no link to Cerere/Ofertă/Client", /Demo SRL/.test(sheet) && trailLinks.every((link) => !/^\/(oferte|cereri|clienti)/.test(link)), trailLinks);
  check("A18 job sheet shows no money and no active source-offer link", !MONEY.test(sheet) && !(await worker.page.eval(`[...document.querySelectorAll('a')].some(a => /^\\/oferte/.test(a.getAttribute('href')||''))`)));
  await worker.page.shot("closure_atelier_job_sheet_1440_light", { route: "/lucrari/:id", state: "job sheet after completion, workshop scope", viewport: "1440x900", theme: "Lumină" });
  await worker.page.goto(`/lucrari/${encodeURIComponent(context.jobId)}?section=date`, 3000);
  check("A19 Date lucrare has no active link to the source offer", !(await worker.page.eval(`[...document.querySelectorAll('a')].some(a => /^\\/oferte/.test(a.getAttribute('href')||''))`)));

  // ── B · one account, two organizations, different roles ──────────────────
  const dualEmail = "dual.e2e@workos.test";
  await dual.page.viewport(1440);
  await acceptAsNew(dual.page, await invite(owner.page, dualEmail, "workshop"));
  const ownerB = await h.launch(9374, "c-ownerb");
  try {
    await ownerB.page.goto("/", 1500);
    check("B0 owner of organization B signs in", (await h.loginInPage(ownerB.page, orgB.email, orgB.password)) === 200);
    const linkB = await invite(ownerB.page, dualEmail, "production");
    await dual.page.goto(linkB.replace(/^https?:\/\/[^/]+/, BASE), 2500);
    check("B1 signed-in user is offered to accept with the current account", /Ești autentificat ca/.test(await dual.page.text()));
    await dual.page.click("Acceptă accesul");
    await sleep(3500);
  } finally { ownerB.proc.kill(); }
  let s = await h.fetchJson(dual.page, "/api/cloud/session");
  const memberships = s.body?.memberships ?? s.body?.organizations ?? [];
  check("B2 the account holds two memberships", memberships.length === 2, memberships.map((m) => m.roleLabel ?? m.role));
  const orgAId = identity.organizationId;
  const orgBId = memberships.find((m) => m.organizationId !== orgAId)?.organizationId;
  await dual.page.goto("/", 2500);
  if (s.body?.organization?.organizationId !== orgAId) await switchOrganization(dual.page, orgAId);
  s = await h.fetchJson(dual.page, "/api/cloud/session");
  check("B3 in organization A the role is Atelier", s.body?.organization?.organizationId === orgAId && /Atelier/.test(s.body?.organization?.roleLabel ?? ""), s.body?.organization?.roleLabel);
  check("B4 operator identified by PIN in organization A", await identify(dual.page, "Maria Ansamblu Demo", pins.assembly1));
  check("B5 operator session exists in A", Boolean((await h.fetchJson(dual.page, "/api/operator-session")).body?.operator));
  await dual.page.goto("/lucrari", 3000);
  const jobsA = await h.fetchJson(dual.page, "/api/jobs");
  const jobAId = jobsA.body?.overview?.jobs?.find((j) => j.planId)?.jobId;
  const listA = await dual.page.text();
  check("B6 organization A work is visible in A", /Demo SRL|ACM|Litere/.test(listA) && Boolean(jobAId));

  check("B7 switch to organization B from the account menu", await switchOrganization(dual.page, orgBId));
  s = await h.fetchJson(dual.page, "/api/cloud/session");
  check("B8 in organization B the role is Producție", s.body?.organization?.organizationId === orgBId && /Producție/.test(s.body?.organization?.roleLabel ?? ""), s.body?.organization?.roleLabel);
  await dual.page.goto("/", 2500);
  const navB = await navLabels(dual.page);
  check("B9 navigation follows the Producție role (no Oferte, has Clienți)", navB.includes("Clienți") && !navB.includes("Oferte"), navB);
  check("B10 operator identity from A is invalidated in B", !(await h.fetchJson(dual.page, "/api/operator-session")).body?.operator);
  await dual.page.goto("/lucrari", 3000);
  const listB = await dual.page.text();
  check("B11 no organization A work is shown in B (cache cleared)", !listA.split("\n").filter((l) => /Demo SRL/.test(l)).some((l) => listB.includes(l)));
  check("B12 an organization A job is refused in B (API 404)", (await h.fetchJson(dual.page, `/api/jobs/${encodeURIComponent(jobAId)}`)).status === 404);
  await dual.page.goto(`/lucrari/${encodeURIComponent(jobAId)}`, 3000);
  check("B13 the organization A job sheet does not open in B", !/Demo SRL/.test(await dual.page.text()));
  await dual.page.shot("closure_cross_org_b_1440_light", { route: "/lucrari/:idFromA", state: "organization B, foreign job refused", viewport: "1440x900", theme: "Lumină" });
  const customersB = await h.fetchJson(dual.page, "/api/customers");
  check("B14 organization A customers are not listed in B", !/Sign Pro Demo SRL|Alpha Clima Demo SRL/.test(JSON.stringify(customersB.body)), customersB.status);

  check("B15 switch back to organization A", await switchOrganization(dual.page, orgAId));
  s = await h.fetchJson(dual.page, "/api/cloud/session");
  check("B16 back in A the role is Atelier again", /Atelier/.test(s.body?.organization?.roleLabel ?? ""), s.body?.organization?.roleLabel);
  check("B17 the operator must identify again after the switch", !(await h.fetchJson(dual.page, "/api/operator-session")).body?.operator);
  await dual.page.goto("/atelier", 3000);
  check("B18 Atelier shows the identification form again", /Identifică operatorul/.test(await dual.page.text()));
  check("B19 Atelier in A still cannot open commercial data", (await h.fetchJson(dual.page, "/api/quotes")).status === 403);
} catch (error) {
  check("UNEXPECTED_ERROR", false, String(error?.stack ?? error).slice(0, 400));
} finally {
  owner.proc.kill(); worker.proc.kill(); dual.proc.kill();
  writeFileSync(arg("context-out"), JSON.stringify(context, null, 2));
  process.exitCode = h.write("closure_e2e_results.json") ? 0 : 1;
}
