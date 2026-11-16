// Pilot Readiness E2E V1 · journey steps. Each step uses only the supported UI (and reads the API to
// confirm what the server recorded). Bootstrap of the first owner is the only CLI step (scripts/pilot-e2e.mjs).

const ownerA = (ctx) => ctx.secrets.accounts.ownerA;

async function asOwner(ctx, label = "owner") {
  const ui = await ctx.suite.actor(label);
  const a = ownerA(ctx);
  if ((await ui.login(a.email, a.password)) !== 200) throw new Error("owner login failed");
  return ui;
}

/** Owner — products offered for new work (versioned selection). */
async function products(ctx) {
  const ui = await asOwner(ctx, "owner-products");
  try {
    await ui.go("/admin/products");
    await ui.page.eval(`(() => { const set = (id, v) => { const r = [...document.querySelectorAll('input[type=radio]')].filter((i) => i.id.startsWith('offer-' + id) || i.name === 'offer-' + id); const pick = r[v === 'on' ? 0 : 1]; if (pick) pick.click(); }; set('PRD-LETTERS-FRONTLIT-PLEXI-AL06', 'on'); set('PRD-ACM-CASSETTE-NONE', 'on'); set('PRD-LOGO-FRONTLIT-PLEXI-AL06', 'on'); })()`);
    await ui.settle();
    await ui.click("Revizuiește și salvează");
    await ui.click(/^Salvează versiunea/);
    const enabled = await ui.api("/api/admin/product-enablement");
    ctx.check("ORG-1 product selection saved as organization version 1 (3 products offered)", enabled.status === 200 && (await ui.has(/Versiunea 1|versiunea 1/)), enabled.status);
    await ui.shot("SETUP_OWNER_products_selection-v1", { step: "ORG-1", role: "Proprietar", state: "produse oferite: versiunea 1 confirmată de organizație" }, { full: true });
  } catch (e) { await ui.dump("products"); throw e; } finally { ui.close(); }
}

/** Owner — commercial policy (markup, VAT) as organization version 1. */
async function commercialPolicy(ctx) {
  const ui = await asOwner(ctx, "owner-commercial");
  try {
    await ui.go("/admin/commercial");
    await ui.fill("Adaos implicit", "25");
    await ui.fill("TVA", "19");
    await ui.click("Revizuiește și salvează");
    await ui.click(/^Salvează versiunea/);
    const policy = await ui.api("/api/admin/commercial-policy");
    ctx.check("ORG-2 commercial policy saved (markup 25 %, VAT 19 %)", policy.status === 200 && /25/.test(JSON.stringify(policy.body)) && /19/.test(JSON.stringify(policy.body)), policy.status);
    await ui.shot("SETUP_OWNER_commercial-policy-v1", { step: "ORG-2", role: "Proprietar", state: "valori comerciale: versiunea 1" }, { full: true });
  } catch (e) { await ui.dump("commercial"); throw e; } finally { ui.close(); }
}

/** Owner — confirm two production costs (the rest stays «De verificat», acknowledged at quote freeze). */
async function costs(ctx) {
  const ui = await asOwner(ctx, "owner-costs");
  try {
    await ui.go("/admin/resources");
    for (const [name, value] of [["Plexiglas 3 mm opal", "17"], ["Debitare CNC față", "3,2"]]) {
      await ui.click(name);
      await ui.page.eval(`(() => { const i = [...document.querySelectorAll('input')].find((e) => e.offsetParent && /Cost/.test(document.querySelector('label[for="' + e.id + '"]')?.textContent ?? '')); if (i) i.focus(); })()`);
      const label = await ui.page.eval(`([...document.querySelectorAll('label')].find((l) => l.offsetParent && /^Cost/.test(l.textContent.trim()))?.textContent ?? '').trim()`);
      await ui.fill(label, value);
      await ui.click("Salvează", { exact: true });
      await ui.settle(900);
    }
    // Hourly workshop labour rate (used by the engine for the actual internal cost of recorded hours).
    if (await ui.canClick("Creează tariful inițial")) {
      await ui.fill("Tarif manoperă atelier", "22");
      await ui.click("Creează tariful inițial");
      await ui.settle(900);
    }
    const confirmed = await ui.page.eval(`(document.body.innerText.match(/· Confirmat/g) || []).length`);
    ctx.check("ORG-3 two production costs confirmed and a workshop labour rate set", confirmed >= 2 && !(await ui.has(/Manoperă atelier\s*TARIF LIPSĂ/i)), { confirmed });
    await ui.shot("SETUP_OWNER_costs-confirmed", { step: "ORG-3", role: "Proprietar", state: "costuri de producție: două tarife confirmate, restul «De verificat»" }, { full: true });
  } catch (e) { await ui.dump("costs"); throw e; } finally { ui.close(); }
}

const ZONES = [
  { zone: "Zonă CNC", zoneCap: null, machine: "CNC 3020 Pilot", machineCap: "CNC" },
  { zone: "Zonă formare profil", zoneCap: null, machine: "Formatoare profil Pilot", machineCap: "profil" },
  { zone: "Masă asamblare", zoneCap: "asamblare", machine: null, machineCap: null },
];

/** Owner — work centres and machines with capabilities (manual operations need no machine). */
async function workcenters(ctx) {
  const ui = await asOwner(ctx, "owner-zones");
  try {
    await ui.go("/admin/workcenters");
    for (const z of ZONES) {
      await ui.click("Zonă nouă");
      await ui.fill("Nume", z.zone, { scope: ui.dialog });
      await ui.click("Adaugă zona", { scope: ui.dialog });
      await ui.waitText(new RegExp(z.zone));
      if (z.zoneCap) {
        await ui.fill("Capabilitate", z.zoneCap);
        await ui.clickNear("Capabilitate", "Atribuie capabilitatea");
      }
      if (await ui.canClick("Activează zona")) await ui.click("Activează zona");
      if (z.machine) {
        await ui.click("Utilaj nou");
        await ui.fill("Nume utilaj", z.machine, { scope: ui.dialog });
        await ui.click("Adaugă utilajul", { scope: ui.dialog });
        await ui.waitText(new RegExp(z.machine));
        await ui.fill("Capabilitate utilaj", z.machineCap);
        await ui.clickNear("Capabilitate utilaj", "Atribuie capabilitatea");
        if (await ui.canClick("Activează utilajul")) await ui.click("Activează utilajul");
      }
    }
    const reg = await ui.api("/api/workcenters");
    const text = JSON.stringify(reg.body ?? {});
    ctx.check("ORG-4 three zones and two machines with capabilities", ZONES.every((z) => text.includes(z.zone)) && text.includes("CNC_ROUTING") && text.includes("PROFILE_FORMING") && text.includes("MANUAL_ASSEMBLY"), reg.status);
    await ui.shot("SETUP_OWNER_workcenters", { step: "ORG-4", role: "Proprietar", state: "zone, utilaje și capabilități" }, { full: true });
  } catch (e) { await ui.dump("workcenters"); throw e; } finally { ui.close(); }
}

export const PEOPLE = [
  { key: "cnc", name: "Ana Pilot CNC", role: "Operator CNC", skill: "CNC" },
  { key: "cant", name: "Bogdan Pilot Profil", role: "Operator formare profil", skill: "cant" },
  // The foundation skill label is spelled «Ansamblare» in the product data (recorded as an observation).
  { key: "assembly", name: "Carmen Pilot Montaj", role: "Asamblare, control calitate, ambalare", skill: "nsamblare" },
  { key: "electric", name: "Dan Pilot Electric", role: "Electrician", skill: "Electrician" },
];

/** Owner — operational people, a skill each, and a PIN each (PINs generated locally, never shown). */
async function people(ctx) {
  const ui = await asOwner(ctx, "owner-people");
  ctx.secrets.operatorPins = ctx.secrets.operatorPins ?? {};
  try {
    await ui.go("/admin/people");
    for (const person of PEOPLE) {
      const exists = (await ui.api("/api/people")).body?.registry?.people?.find((x) => x.displayName === person.name);
      if (exists) {
        await ui.click(person.name);
      } else {
        await ui.click("Persoană nouă");
        await ui.fill("Nume", person.name, { scope: ui.dialog });
        await ui.fill("Rol", person.role, { scope: ui.dialog });
        await ui.click("Adaugă persoana", { scope: ui.dialog });
        await ui.waitText(new RegExp(person.name));
      }
      const current = (await ui.api("/api/people")).body?.registry?.people?.find((x) => x.displayName === person.name);
      if (!(current?.skills ?? []).length) {
        await ui.fill("Calificare", person.skill);
        await ui.click("Atribuie calificarea");
      }
      if (!current?.operatorPinConfigured || !ctx.secrets.operatorPins[person.key]) {
        const pin = ctx.newPin();
        ctx.secrets.operatorPins[person.key] = pin;
        ctx.saveSecrets();
        await ui.fill("PIN", pin);
        await ui.fill("Confirmă PIN", pin);
        await ui.click(current?.operatorPinConfigured ? "Schimbă PIN" : "Configurează PIN");
        await ui.settle(800);
      }
    }
    const reg = await ui.api("/api/people");
    const list = reg.body?.registry?.people ?? [];
    ctx.check("ORG-5 four people with skills and PIN", PEOPLE.every((p) => list.some((x) => x.displayName === p.name && x.operatorPinConfigured)), list.length);
    await ui.shot("SETUP_OWNER_people", { step: "ORG-5", role: "Proprietar", state: "oameni operaționali cu calificări și PIN (PIN-urile nu sunt afișate)" }, { full: true });
  } catch (e) { await ui.dump("people"); throw e; } finally { ui.close(); }
}

export const TEAM = [
  { key: "commercialA", email: "comercial@pilot-demo.test", role: "Comercial" },
  { key: "productionA", email: "productie@pilot-demo.test", role: "Producție" },
  { key: "workshopA", email: "atelier@pilot-demo.test", role: "Atelier" },
  { key: "dual", email: "doua.firme@pilot-demo.test", role: "Atelier" },
];

/** Owner invites the team in the UI; each invitee accepts in a fresh browser and sets a password. */
async function invitations(ctx) {
  const owner = await asOwner(ctx, "owner-access");
  try {
    for (const member of TEAM) {
      await owner.go("/admin/access");
      await owner.click("Invită utilizator");
      await owner.fill("Email", member.email, { scope: owner.dialog });
      await owner.check(member.role);
      await owner.click("Trimite invitația", { scope: owner.dialog });
      await owner.page.waitFor(`Boolean(document.querySelector('#acc-once-link'))`, 15000);
      const link = await owner.page.eval(`document.querySelector('#acc-once-link').value`);
      ctx.remember(link); ctx.remember(decodeURIComponent(link.split("#t=")[1] ?? ""));
      await owner.page.eval(`document.querySelector('#acc-once-link').style.webkitTextSecurity = 'disc'`);
      if (member.key === "commercialA") await owner.shot("SETUP_OWNER_invitation-link-once", { step: "ORG-6", role: "Proprietar", state: "invitație creată; linkul afișat o singură dată (mascat)" });
      const invitee = await ctx.suite.actor(`invitee-${member.key}`);
      try {
        await invitee.go(link.slice(link.indexOf("/invitatie")));
        await invitee.waitText(/Ai fost invitat/);
        const password = ctx.newPassword();
        ctx.secrets.accounts[member.key] = { email: member.email, password, role: member.role };
        ctx.saveSecrets();
        await invitee.fill("Parola ta", password);
        await invitee.fill("Confirmă parola", password);
        await invitee.click("Acceptă invitația");
        await invitee.page.waitFor(`location.pathname === '/' && !/Ai fost invitat/.test(document.body.innerText)`, 20000);
        const session = await invitee.api("/api/cloud/session");
        ctx.check(`ORG-6 ${member.role} (${member.key}) accepted the invitation and is signed in`, session.body?.organization?.roleLabel === member.role, session.body?.organization?.roleLabel);
      } finally { invitee.close(); }
    }
    await owner.go("/admin/access");
    await owner.shot("SETUP_OWNER_access-team", { step: "ORG-6", role: "Proprietar", state: "echipa: Proprietar, Comercial, Producție, Atelier" }, { full: true });
  } catch (e) { await owner.dump("invitations"); throw e; } finally { owner.close(); }
}

const quoteApi = (quoteUrl) => {
  const [, , , productCode, id] = quoteUrl.split("/");
  return `/api/products/${productCode}/quote-snapshots/${id}`;
};

/** Proprietar — PDF of the frozen quote, acceptance (D5: owner only), order and job. */
async function accept(ctx) {
  const ui = await asOwner(ctx, "owner-accept");
  try {
    const api = quoteApi(ctx.state.ids.quoteUrl);
    const pdf = await ui.page.eval(`fetch(${JSON.stringify(`${api}/document`)}, { credentials: 'include' }).then(async (r) => ({ status: r.status, type: r.headers.get('content-type'), size: (await r.arrayBuffer()).byteLength }))`);
    ctx.check("COM-5 quote PDF is generated for the frozen quote", pdf.status === 200 && /pdf/.test(pdf.type ?? "") && pdf.size > 1000, pdf);
    const before = await ui.api(api);
    ctx.state.ids.quoteFrozenTotal = JSON.stringify(before.body?.quoteSnapshot?.totals ?? before.body?.quoteSnapshot?.commercial ?? before.body).length;
    await ui.go(ctx.state.ids.quoteUrl);
    await ui.click("Confirmă comanda");
    await ui.waitText(/Da, confirm comanda/, 10000);
    await ui.shot("COM_OWNER_accept-confirmation", { step: "COM-6", role: "Proprietar", state: "confirmarea acceptării ofertei" });
    await ui.click("Da, confirm comanda");
    await ui.waitText(/Deschide fișa lucrării|Fișa lucrării/, 20000);
    await ui.click(/Fișa lucrării|Deschide fișa lucrării/);
    await ui.page.waitFor(`/^\\/lucrari\\//.test(location.pathname)`, 20000);
    const jobId = decodeURIComponent((await ui.page.eval("location.pathname")).split("/")[2]);
    const job = await ui.api(`/api/jobs/${encodeURIComponent(jobId)}`);
    ctx.check("COM-6 acceptance created the order and the job (server)", job.status === 200 && job.body?.job?.jobId === jobId, { status: job.status, stage: job.body?.job?.stage });
    await ui.shot("JOB_OWNER_job-created", { step: "COM-6", role: "Proprietar", state: "lucrare creată din oferta acceptată, neeliberată" }, { full: true });
    ctx.state.ids.jobId = jobId;
    return { jobId };
  } catch (e) { await ui.dump("accept"); throw e; } finally { ui.close(); }
}

/** Accepted documents stay frozen: a later commercial-policy version does not rewrite the quote. */
async function immutability(ctx) {
  const ui = await asOwner(ctx, "owner-immutability");
  try {
    const api = quoteApi(ctx.state.ids.quoteUrl);
    const before = JSON.stringify((await ui.api(api)).body);
    await ui.go("/admin/commercial");
    await ui.fill("Adaos implicit", "40");
    await ui.click("Revizuiește și salvează");
    await ui.click(/^Salvează versiunea/);
    const after = JSON.stringify((await ui.api(api)).body);
    ctx.check("COM-7 a new commercial policy version (v2) does not change the accepted, frozen quote", before === after, { identical: before === after });
  } catch (e) { await ui.dump("immutability"); throw e; } finally { ui.close(); }
}

/** Producție — sees the job, technical data, releases it; no access to offers or financial data. */
async function release(ctx) {
  const ui = await asAccount(ctx, "productionA", "production-release");
  const workshop = await asAccount(ctx, "workshopA", "workshop-refused");
  try {
    const jobPath = `/lucrari/${encodeURIComponent(ctx.state.ids.jobId)}`;
    const refused = await workshop.api(`/api/jobs/${encodeURIComponent(ctx.state.ids.jobId)}/production`, { method: "POST" });
    ctx.check("REL-1 Atelier cannot release (server 403)", refused.status === 403, refused.status);
    for (const path of ["/api/quotes", "/api/admin/commercial-policy", quoteApi(ctx.state.ids.quoteUrl)]) {
      ctx.check(`REL-2 Producție refused commercial data: ${path.split("/").slice(0, 4).join("/")}`, (await ui.api(path)).status === 403);
    }
    await ui.go(jobPath);
    ctx.check("REL-3 Producție sees «Trimite în producție» on the eligible job", await ui.canClick("Trimite în producție"));
    await ui.shot("REL_PRODUCTION_job-release-available", { step: "REL-3", role: "Producție", state: "lucrare eligibilă, acțiunea disponibilă" });
    await ui.click("Trimite în producție");
    await ui.waitText(/Deschide lucrarea în Atelier/, 25000);
    const job = await ui.api(`/api/jobs/${encodeURIComponent(ctx.state.ids.jobId)}`);
    const planId = job.body?.execution?.planId;
    const plan = await ui.api(`/api/execution-plans/${encodeURIComponent(planId)}`);
    const tasks = plan.body?.executionPlan?.tasks ?? plan.body?.tasks ?? [];
    ctx.check("REL-4 release created the execution plan and its operations (server)", Boolean(planId) && tasks.length > 0, { tasks: tasks.length });
    const again = await ui.api(`/api/jobs/${encodeURIComponent(ctx.state.ids.jobId)}/production`, { method: "POST" });
    ctx.check("REL-5 a second release is idempotent (no second plan)", again.status === 200 && again.body?.created === false, again.body?.created);
    await ui.go(`${jobPath}?sectiune=operatii`);
    await ui.shot("REL_PRODUCTION_plan-operations", { step: "REL-4", role: "Producție", state: "plan creat, operațiile lucrării" }, { full: true });
    ctx.state.ids.planId = planId;
    return { planId, tasks: tasks.length };
  } catch (e) { await ui.dump("release"); throw e; } finally { ui.close(); workshop.close(); }
}

const PERSON_FOR_CAPABILITY = {
  CNC_ROUTING: "cnc",
  PROFILE_FORMING: "cant",
  MANUAL_ASSEMBLY: "assembly",
  PACKAGING: "assembly",
  QUALITY_CONTROL: "assembly",
  ELECTRICAL_ASSEMBLY: "electric",
};

async function identify(ui, ctx, personKey) {
  await ui.go("/atelier");
  if (await ui.canClick("Ieși din atelier")) { await ui.click("Ieși din atelier"); await ui.go("/atelier"); }
  const person = PEOPLE.find((p) => p.key === personKey);
  await ui.fill("Persoană", person.name);
  await ui.fill("PIN", ctx.secrets.operatorPins[personKey]);
  await ui.click("Identifică operatorul");
  await ui.waitText(/pot fi pornite|în lucru de tine/, 15000);
}

const tasksOf = async (ui, planId) => {
  const plan = await ui.api(`/api/execution-plans/${encodeURIComponent(planId)}`);
  return plan.body?.executionPlan?.tasks ?? plan.body?.tasks ?? [];
};

/** Atelier — operators identified by PIN execute every operation under the server's rules. */
async function atelier(ctx) {
  const ui = await asAccount(ctx, "workshopA", "workshop-execute");
  const { jobId, planId } = ctx.state.ids;
  let documented = false;
  let qcPassed = 0;
  let completed = 0;
  try {
    for (let round = 0; round < 40; round += 1) {
      const tasks = await tasksOf(ui, planId);
      if (tasks.every((t) => t.status === "COMPLETED")) break;
      // The server decides what can start: pick the first task the inbox of its capable person offers.
      let progressed = false;
      for (const personKey of [...new Set(tasks.filter((t) => t.status !== "COMPLETED").map((t) => PERSON_FOR_CAPABILITY[t.requiredCapabilityId]).filter(Boolean))]) {
        await identify(ui, ctx, personKey);
        const href = await ui.page.eval(`([...document.querySelectorAll('main a')].find((a) => a.textContent.includes('Deschide operația') && decodeURIComponent(a.getAttribute('href') || '').includes(${JSON.stringify(jobId)})) || {}).getAttribute?.('href') ?? null`);
        if (!href) continue;
        const taskId = new URL(href, "http://x").searchParams.get("task");
        await ui.go(href);
        if (await ui.canClick("Pornește operația")) {
          await ui.click("Pornește operația");
          await ui.page.waitFor(`/Finalizează operația|Acceptă|Notă de control/.test(document.body.innerText)`, 15000);
        }
        const status = (await tasksOf(ui, planId)).find((t) => t.taskId === taskId)?.status;
        ctx.check(`EXE start ${taskId.split(":").slice(-2).join(":")} by ${personKey} → IN_PROGRESS (server)`, status === "IN_PROGRESS" || status === "COMPLETED", status);
        if (!documented) {
          await ui.click("Adaugă observație");
          await ui.fill("Observație", "Material verificat la pornire (pilot sintetic).");
          await ui.click("Salvează observația");
          await ui.waitText(/Observația a fost adăugată/, 10000);
          await ui.click("Semnalează problemă");
          await ui.fill("Motiv", "Material");
          await ui.fill("Descriere", "Folie de protecție zgâriată pe o placă (sintetic).");
          await ui.click("Semnalează", { exact: true });
          await ui.settle(1200);
          await ui.shot("EXE_WORKSHOP_operation-in-progress-documented", { step: "EXE-2", role: "Atelier", state: "operație în curs, observație și problemă semnalată" }, { full: true });
          documented = true;
        }
        if (await ui.has(/Notă de control|Acceptă/) && (await ui.canClick("Acceptă"))) {
          await ui.fill("Notă de control", "Conform la verificare vizuală.");
          await ui.click("Acceptă", { exact: true });
          await ui.settle(1200);
          qcPassed += 1;
          if (qcPassed === 1) await ui.shot("EXE_WORKSHOP_qc-accepted", { step: "EXE-4", role: "Atelier", state: "control calitate acceptat" }, { full: true });
        } else {
          // Quantities the existing form asks for, set to the planned values shown next to each field.
          const fields = await ui.page.eval(`[...document.querySelectorAll('main input[id^="actual-"]')].filter((e) => e.offsetParent).map((e) => { let box = e.parentElement, planned = null; while (box && !planned) { const m = (box.innerText || '').match(/Planificat:[^0-9]*([0-9]+(?:[.,][0-9]+)?)/); if (m) planned = m[1]; box = box.parentElement; } return { id: e.id, planned: planned ?? '1' }; })`);
          for (const f of fields) await ui.fill(f.id, f.planned.replace(".", ","));
          await ui.click("Finalizează operația");
          await ui.settle(1500);
          if (await ui.has(/Confirmi|Finalizezi/) && (await ui.canClick("Finalizează"))) await ui.click(/^Finalizează/);
        }
        const after = (await tasksOf(ui, planId)).find((t) => t.taskId === taskId)?.status;
        if (after === "COMPLETED") completed += 1;
        ctx.check(`EXE complete ${taskId.split(":").slice(-2).join(":")} → COMPLETED (server)`, after === "COMPLETED", after);
        progressed = true;
        break;
      }
      if (!progressed) { await ui.dump("atelier-stuck"); throw new Error("no startable operation offered to any capable person"); }
    }
    const tasks = await tasksOf(ui, planId);
    ctx.check("EXE-5 every operation of the plan is COMPLETED (server)", tasks.length > 0 && tasks.every((t) => t.status === "COMPLETED"), { completed, total: tasks.length, qcPassed });
    if (await ui.canClick("Ieși din atelier")) await ui.click("Ieși din atelier");
    return { completed, qcPassed };
  } catch (e) { await ui.dump("atelier"); throw e; } finally { ui.close(); }
}

/** Producție — takes over and resolves the reported issue from the job sheet (execution.supervise). */
async function supervise(ctx) {
  const ui = await asAccount(ctx, "productionA", "production-supervise");
  try {
    await ui.go(`/lucrari/${encodeURIComponent(ctx.state.ids.jobId)}`);
    if (await ui.canClick("Preia problema")) await ui.click("Preia problema");
    await ui.click("Marchează rezolvată");
    await ui.settle(1200);
    const record = await ui.api(`/api/jobs/${encodeURIComponent(ctx.state.ids.jobId)}/record`);
    const issues = record.body?.record?.issues ?? [];
    ctx.check("EXE-3 Producție took over and resolved the reported issue (server)", issues.length > 0 && issues.every((i) => i.status === "RESOLVED"), issues.map((i) => i.status));
  } catch (e) { await ui.dump("supervise"); throw e; } finally { ui.close(); }
}

/**
 * Finalization and Planned vs Actual: what the engine records and what the UI shows today.
 * The owner reads the engine's actual internal cost through the API (financial scope = owner);
 * the UI has no view for it yet — recorded as a presentation limit, never as a visual PASS.
 */
async function plannedVsActual(ctx) {
  const ui = await asOwner(ctx, "owner-pva");
  const prod = await asAccount(ctx, "productionA", "production-pva");
  try {
    const { jobId, planId } = ctx.state.ids;
    const job = await ui.api(`/api/jobs/${encodeURIComponent(jobId)}`);
    ctx.check("FIN-1 job is finished (server stage EXECUTION_COMPLETED)", job.body?.job?.stage === "EXECUTION_COMPLETED", job.body?.job?.stage);
    const plan = (await ui.api(`/api/execution-plans/${encodeURIComponent(planId)}`)).body;
    const tasks = plan?.executionPlan?.tasks ?? plan?.tasks ?? [];
    const withPlannedQty = tasks.filter((t) => t.quantities && Object.keys(t.quantities).length > 0).length;
    const withActualTime = tasks.filter((t) => (t.workSessions ?? []).length > 0 || t.actualDurationMinutes != null).length;
    const withActualQty = tasks.filter((t) => t.completion || t.actualConsumption).length;
    ctx.check("PVA-1 engine records planned quantities, actual time and actual quantities per operation", withPlannedQty > 0 && withActualTime === tasks.length && withActualQty > 0, { tasks: tasks.length, withPlannedQty, withActualTime, withActualQty });
    // The job detail carries the scoped execution view: owner scope includes the actual internal cost.
    const actual = job.body?.execution?.view?.actualInternalCost ?? null;
    ctx.check("PVA-2 engine computes the actual internal cost for the owner (job detail API, owner scope)", Boolean(actual && actual.status), actual ? { status: actual.status, lines: (actual.lines ?? []).length, plannedComparableTotal: actual.plannedComparableTotal } : null);
    const prodJob = (await prod.api(`/api/jobs/${encodeURIComponent(jobId)}`)).body;
    ctx.check("PVA-3 Producție does not receive the internal cost (financial scope enforced)", prodJob?.execution?.view && prodJob.execution.view.actualInternalCost === undefined);
    await ui.go(`/lucrari/${encodeURIComponent(jobId)}`);
    const sheet = await ui.text();
    ctx.check("PVA-4 job sheet shows recorded hours and completion (UI)", /finalizate|Finalizat/.test(sheet) && /Ore de muncă|ore/i.test(sheet));
    await ui.shot("FIN_OWNER_job-finished-situation", { step: "FIN-1/PVA-4", role: "Proprietar", state: "lucrare finalizată: ore, durată, progres" }, { full: true });
    await ui.go(`/lucrari/${encodeURIComponent(jobId)}?sectiune=operatii`);
    await ui.shot("FIN_OWNER_job-finished-operations", { step: "PVA-4", role: "Proprietar", state: "operații finalizate: planificat vs realizat pe operație" }, { full: true });
    await ui.go(`/lucrari/${encodeURIComponent(jobId)}`);
    await ui.waitText(/Planificat vs realizat/, 20000).catch(() => {});
    const costShown = await ui.has(/Cost operațional calculat din execuție/);
    ctx.check("PVA-5 owner sees Planificat vs realizat: estimated, operational, difference, margins (UI)", costShown && (await ui.has(/Marjă estimată/)) && (await ui.has(/Cost efectiv confirmat contabil/)));
    await ui.shot("CFC_OWNER_job-planned-vs-actual", { step: "PVA-5", role: "Proprietar", state: "planificat vs realizat, lucrare finalizată" }, { full: true });
    const economics = await ui.api(`/api/jobs/${encodeURIComponent(jobId)}/economics`);
    ctx.check("PVA-6 economics API: no confirmed accounting cost claimed, unknown never zero", economics.status === 200 && economics.body?.economics?.confirmedCost?.status === "NOT_MODELLED", economics.body?.economics?.operationalCost?.completeness);
    const prodEconomics = await prod.api(`/api/jobs/${encodeURIComponent(jobId)}/economics`);
    ctx.check("PVA-7 Producție is refused the economics (403) and sees no cost panel", prodEconomics.status === 403, prodEconomics.status);
    await prod.go(`/lucrari/${encodeURIComponent(jobId)}`);
    await prod.settle(1500);
    ctx.check("PVA-7b Producție job sheet has no Planificat vs realizat panel (UI)", !(await prod.has(/Cost operațional calculat/)));
    return { actualCostStatus: actual?.status ?? null, costShownInUi: costShown, operational: economics.body?.economics?.operationalCost?.completeness ?? null };
  } catch (e) { await ui.dump("pva"); throw e; } finally { ui.close(); prod.close(); }
}

const NAV = (ui) => ui.page.eval(`[...document.querySelectorAll('.app-shell__modules .app-shell__module-label')].map((e) => e.textContent.trim())`);

/** The four-role contract: navigation AND server answers (hidden UI is not proof). */
async function roles(ctx) {
  const quote = quoteApi(ctx.state.ids.quoteUrl);
  const job = `/api/jobs/${encodeURIComponent(ctx.state.ids.jobId)}`;
  const matrix = [
    // [account, path, method, expected status]
    ["ownerA", "/api/quotes", "GET", 200], ["ownerA", "/api/admin/access", "GET", 200], ["ownerA", quote, "GET", 200], ["ownerA", "/api/people", "GET", 200],
    ["commercialA", "/api/quotes", "GET", 200], ["commercialA", quote, "GET", 200], ["commercialA", "/api/admin/access", "GET", 200],
    ["commercialA", `${quote}/confirm-order`, "POST", 403], ["commercialA", `${job}/production`, "POST", 403], ["commercialA", "/api/admin/access/invitations", "POST", 403],
    ["productionA", job, "GET", 200], ["productionA", "/api/customers", "GET", 200], ["productionA", "/api/quotes", "GET", 403], ["productionA", quote, "GET", 403],
    ["productionA", "/api/admin/access", "GET", 403], ["productionA", "/api/people", "POST", 403], ["productionA", "/api/admin/commercial-policy", "GET", 403],
    ["workshopA", job, "GET", 200], ["workshopA", "/api/customers", "GET", 403], ["workshopA", "/api/quotes", "GET", 403], ["workshopA", quote, "GET", 403],
    ["workshopA", `${job}/production`, "POST", 403], ["workshopA", "/api/admin/access", "GET", 403], ["workshopA", "/api/people", "GET", 403],
  ];
  const expectedNav = { ownerA: "Clienți,Cereri,Oferte,Lucrări,Atelier,Catalog,Administrare", commercialA: "Clienți,Cereri,Oferte,Lucrări,Atelier,Catalog,Administrare", productionA: "Clienți,Cereri,Lucrări,Atelier,Catalog,Administrare", workshopA: "Lucrări,Atelier" };
  for (const key of ["ownerA", "commercialA", "productionA", "workshopA"]) {
    const ui = await asAccount(ctx, key, `roles-${key}`);
    try {
      await ui.go("/");
      const nav = (await NAV(ui)).join(",");
      ctx.check(`ROLE-NAV ${key}: navigation follows the role`, nav === expectedNav[key], nav);
      for (const [account, path, method, expected] of matrix.filter((m) => m[0] === key)) {
        const r = await ui.api(path, method === "GET" ? {} : { method, body: "{}" });
        ctx.check(`ROLE-API ${key} ${method} ${path.replace(/[a-z]+(%3A|:)[A-Za-z0-9%:_.-]{12,}/g, ":id")} → ${expected}`, r.status === expected, r.status);
      }
      if (key === "workshopA") {
        await ui.go(`/lucrari/${encodeURIComponent(ctx.state.ids.jobId)}`);
        const t = await ui.text();
        ctx.check("ROLE-UI Atelier job sheet: client as text, no Cerere/Ofertă links, no money, no planning edit", !/\b\d{1,3}(?:[.\s]\d{3})*,\d{2}\s?(EUR|RON|lei)\b/.test(t) && !/Modifică în Date lucrare/.test(t) && !(await ui.page.eval(`[...document.querySelectorAll('a')].some((a) => /^\\/(oferte|cereri|clienti)/.test(a.getAttribute('href') || ''))`)));
        await ui.view(390, 844);
        await ui.go(`/lucrari/${encodeURIComponent(ctx.state.ids.jobId)}`);
        await ui.shot("ROLE_WORKSHOP_job-sheet-finished", { step: "ROLE", role: "Atelier", state: "fișa lucrării finalizate, fără date comerciale" }, { full: true });
      }
    } finally { ui.close(); }
  }
}

/** Invalid invitation, expired session, revoked user mid-session. */
async function sessions(ctx) {
  const pub = await ctx.suite.actor("public-invalid");
  try {
    await pub.go("/invitatie#t=nevalid-pilot-e2e");
    ctx.check("SES-1 an invalid invitation link is refused calmly", await pub.waitText(/Invitația nu mai este valabilă/, 15000));
    await pub.shot("SES_PUBLIC_invitation-invalid", { step: "SES-1", role: "Public", state: "invitație invalidă" });
  } finally { pub.close(); }
  // Expired session: a second device closes the other sessions; the first one must sign in again.
  const a = await asAccount(ctx, "commercialA", "session-a");
  const b = await asAccount(ctx, "commercialA", "session-b");
  try {
    await a.go("/clienti");
    await b.go("/cont/securitate");
    await b.click(/^Închide (cealaltă sesiune|celelalte)/);
    await b.settle(1000);
    const after = await a.api("/api/customers");
    ctx.check("SES-2 a closed/expired session is refused by the server (401)", after.status === 401, after.status);
    await a.go("/clienti");
    ctx.check("SES-3 the UI returns to sign-in for the expired session", await a.waitText(/Autentific|Login Societate|Sesiunea a expirat/, 15000));
    await a.shot("SES_COMMERCIAL_session-expired", { step: "SES-2/3", role: "Comercial", state: "sesiune închisă din alt dispozitiv: revenire la autentificare" });
  } finally { a.close(); b.close(); }
  // Revoked user mid-session (a temporary synthetic member, invited then revoked by the owner).
  const owner = await asOwner(ctx, "owner-revoke");
  try {
    const email = "temporar@pilot-demo.test";
    const inv = await owner.api("/api/admin/access/invitations", { method: "POST", body: JSON.stringify({ email, role: "member" }) });
    const token = decodeURIComponent(String(inv.body?.inviteUrl).split("#t=")[1] ?? "");
    ctx.remember(token);
    const password = ctx.newPassword(); ctx.remember(password);
    const temp = await ctx.suite.actor("revoked-user");
    try {
      await temp.api("/api/cloud/invitations/accept", { method: "POST", body: JSON.stringify({ token, mode: "new", password }) });
      ctx.check("SES-4 temporary member signed in", (await temp.api("/api/customers")).status === 200);
      await owner.go("/admin/access");
      await owner.page.eval(`(() => { const row = [...document.querySelectorAll('.adm-member')].find((r) => r.textContent.includes(${JSON.stringify(email)})); const b = row && [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Revocă'); if (b) b.click(); })()`);
      await owner.settle();
      await owner.click("Revocă accesul");
      await owner.settle(1200);
      const r = await temp.api("/api/customers");
      ctx.check("SES-5 revoked user is refused at the next request (401/403)", r.status === 401 || r.status === 403, r.status);
      await temp.go("/clienti");
      await temp.shot("SES_REVOKED_user-after-revocation", { step: "SES-5", role: "Comercial revocat", state: "acces retras" });
    } finally { temp.close(); }
  } finally { owner.close(); }
}

/** One account in A (Atelier) and B (Producție): login choice, switch, operator reset, isolation. */
async function multiOrg(ctx) {
  const ownerB = await ctx.suite.actor("owner-b");
  const b = ctx.secrets.accounts.ownerB;
  try {
    if ((await ownerB.login(b.email, b.password)) !== 200) throw new Error("owner B login");
    // Isolation: organization B cannot reach A's resources by id.
    for (const path of [`/api/jobs/${encodeURIComponent(ctx.state.ids.jobId)}`, `/api/customers/${encodeURIComponent(ctx.state.ids.customerId)}`, quoteApi(ctx.state.ids.quoteUrl), `/api/requests/${encodeURIComponent(ctx.state.ids.requestId)}`, `/api/execution-plans/${encodeURIComponent(ctx.state.ids.planId)}`]) {
      const r = await ownerB.api(path);
      ctx.check(`ISO-1 owner B → A resource refused (${path.split("/")[2]})`, r.status === 404 || r.status === 403, r.status);
    }
    const customersB = JSON.stringify((await ownerB.api("/api/customers")).body ?? {});
    ctx.check("ISO-2 owner B lists none of A's customers", !customersB.includes(CLIENT.name));
    if (!ctx.state.ids.dualInB) {
      const inv = await ownerB.api("/api/admin/access/invitations", { method: "POST", body: JSON.stringify({ email: ctx.secrets.accounts.dual.email, role: "production" }) });
      const token = decodeURIComponent(String(inv.body?.inviteUrl).split("#t=")[1] ?? "");
      ctx.remember(token);
      const acc = await ownerB.api("/api/cloud/invitations/accept", { method: "POST", body: JSON.stringify({ token, mode: "existing", password: ctx.secrets.accounts.dual.password }) });
      ctx.check("MULTI-1 the A account accepted a B invitation with its existing password", acc.status === 200, acc.status);
      ctx.state.ids.dualInB = true; ctx.saveState?.();
    }
  } finally { ownerB.close(); }
  const ui = await ctx.suite.actor("dual");
  try {
    await ui.go("/");
    await ui.click("Login Societate");
    await ui.page.waitFor(`Boolean(document.querySelector('#cloud-email'))`);
    await ui.page.eval(`(() => { const set = (id, v) => { const el = document.getElementById(id); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }; set('cloud-email', ${JSON.stringify(ctx.secrets.accounts.dual.email)}); set('cloud-password', ${JSON.stringify(ctx.secrets.accounts.dual.password)}); })()`);
    await ui.click("Autentificare", { exact: true });
    await ui.page.waitFor(`Boolean(document.querySelector('#cloud-organization'))`, 15000);
    const opts = await ui.page.eval(`[...document.querySelectorAll('#cloud-organization option')].map((o) => o.textContent)`);
    ctx.check("MULTI-2 login asks to choose the organization, with the role per organization, no error alert", opts.some((o) => /· Atelier$/.test(o)) && opts.some((o) => /· Producție$/.test(o)) && !(await ui.has(/Autentificarea nu a reușit/)), opts);
    await ui.shot("MULTI_DUAL_login-organization-choice", { step: "MULTI-2", role: "Cont în A și B", state: "alegerea organizației (parola mascată)" });
    await ui.fill("cloud-organization", ctx.secrets.accounts.ownerA.organizationId);
    await ui.click("Continuă", { exact: true });
    await ui.page.waitFor(`location.pathname !== '/' || document.querySelector('.app-shell')`, 15000);
    await identify(ui, ctx, "assembly");
    ctx.check("MULTI-3 operator identified in A", Boolean((await ui.api("/api/operator-session")).body?.operator));
    await ui.page.eval(`([...document.querySelectorAll('.account-area button')].find((x) => /cont/i.test(x.textContent)) || { click() {} }).click()`);
    await ui.settle();
    await ui.fill("active-organization", ctx.secrets.accounts.ownerB.organizationId);
    await ui.settle(2500);
    const s = await ui.api("/api/cloud/session");
    ctx.check("MULTI-4 switched to B with role Producție", s.body?.organization?.organizationId === ctx.secrets.accounts.ownerB.organizationId && s.body?.organization?.roleLabel === "Producție", s.body?.organization?.roleLabel);
    ctx.check("MULTI-5 operator identity from A is reset in B", !(await ui.api("/api/operator-session")).body?.operator);
    ctx.check("ISO-3 in B the A job is refused (404) for the switched account", (await ui.api(`/api/jobs/${encodeURIComponent(ctx.state.ids.jobId)}`)).status === 404);
    await ui.go("/lucrari");
    // Only A identifiers in the main content (B's own name also contains "PILOT").
    const mainB = await ui.page.eval(`(document.querySelector("main") ?? document.body).innerText`);
    ctx.check("ISO-4 no A work cached into B's list", !mainB.includes(CLIENT.name) && !mainB.includes(ctx.state.ids.jobId), mainB.match(/\d+ din \d+/)?.[0]);
    await ui.shot("MULTI_DUAL_org-b-production", { step: "MULTI-4/ISO-4", role: "Producție în B", state: "organizația B: fără lucrările lui A" });
  } catch (e) { await ui.dump("multi-org"); throw e; } finally { ui.close(); }
}

/** Smart modularity: B is a simple company (commercial only, no Atelier setup); A activates Materials later. */
async function modularity(ctx) {
  const ownerB = await ctx.suite.actor("owner-b-simple");
  const b = ctx.secrets.accounts.ownerB;
  try {
    if ((await ownerB.login(b.email, b.password)) !== 200) throw new Error("owner B login");
    await ownerB.go("/cereri/noua");
    await ownerB.click("Adaugă client rapid");
    await ownerB.fill("Denumire client", "Client Simplu Fictiv SRL");
    await ownerB.fill("Titlu cerere", "Panou simplu — firmă fără atelier configurat");
    await ownerB.fill("Descriere", "Firmă simplă sintetică: doar flux comercial.");
    await ownerB.click(/^Litere volumetrice luminoase — față plexiglas/);
    await ownerB.click("Creează cererea și configurează");
    await ownerB.page.waitFor(`/configurator/.test(location.pathname)`, 20000);
    ownerB.configuratorUrl = await ownerB.page.eval("location.pathname + location.search");
    // Commercial & Financial V1: B completes its own identity in Administrare › Date firmă.
    if (!(await ownerB.api("/api/seller")).body?.configured) {
      await ownerB.go("/admin/company");
      await ownerB.waitText(/Date firmă/);
      await ownerB.fill("Denumire legală", "WORKOS PILOT B SRL");
      await ownerB.fill("Identificator fiscal (CIF)", "DEMO-CIF-PILOT-B");
      await ownerB.click("Revizuiește și salvează");
      await ownerB.click(/^Salvează versiunea/);
      await ownerB.waitText(/Datele firmei au fost salvate/, 15000);
    }
    await fillAndConfirm(ownerB);
    await ownerB.fill("Preț net al produsului, fără TVA", "900");
    await ownerB.click("Confirmă prețul");
    await ownerB.settle(1200);
    if (await ownerB.has(/Am verificat tarifele neconfirmate/)) await ownerB.check("Am verificat tarifele neconfirmate");
    await ownerB.click("Îngheață oferta", { exact: true });
    await ownerB.waitText(/Deschide oferta înghețată/, 20000);
    await ownerB.click("Deschide oferta înghețată");
    await ownerB.click("Confirmă comanda");
    await ownerB.click("Da, confirm comanda");
    await ownerB.waitText(/Fișa lucrării|Deschide fișa lucrării/, 20000);
    const jobs = (await ownerB.api("/api/jobs")).body?.overview?.jobs ?? [];
    ctx.check("MOD-1 simple company B: a valid commercial flow ends in an accepted order/job without people or machines", jobs.length === 1 && jobs[0].stage === "ORDER_CREATED", jobs.map((j) => j.stage));
    await ownerB.go("/atelier");
    ctx.check("MOD-2 B's Atelier explains the optional module instead of blocking (no operators configured)", await ownerB.has(/Nu există operatori configurați|opțional/i));
    await ownerB.shot("MOD_OWNERB_atelier-not-configured", { step: "MOD-2", role: "Proprietar B", state: "firmă simplă: Atelier neconfigurat, fluxul comercial nu e blocat" });
  } catch (e) { await ownerB.dump("modularity-b"); throw e; } finally { ownerB.close(); }
  const owner = await asOwner(ctx, "owner-a-modules");
  try {
    const ext = await owner.api(`/api/execution-tasks/${encodeURIComponent("task:none")}/external`, { method: "POST" });
    ctx.check("MOD-3 optional external production is DISABLED by default (module state)", JSON.stringify((await owner.api("/api/admin/external-production")).body).includes("DISABLED"), ext.status);
    // hours.asOf is the read time, not history.
    const record = async () => { const r = (await owner.api(`/api/jobs/${encodeURIComponent(ctx.state.ids.jobId)}/record`)).body?.record ?? {}; if (r.hours) delete r.hours.asOf; return JSON.stringify(r); };
    const before = await record();
    await owner.go("/admin/material-readiness");
    const initialMode = (await owner.api("/api/admin/material-readiness")).body?.mode;
    ctx.check("MOD-0 Materials module starts in its default state (DISABLED) and did not block execution", initialMode === "DISABLED", initialMode);
    if (initialMode !== "REQUIRED") {
      await owner.page.eval(`document.getElementById("material-readiness-mode-REQUIRED").click()`);
      await owner.settle();
      await owner.click("Revizuiește și salvează");
      await owner.click("Confirmă", { exact: true });
      await owner.settle(1200);
    }
    const mode = (await owner.api("/api/admin/material-readiness")).body;
    const after = await record();
    ctx.check("MOD-4 Materials activated later (REQUIRED) without rewriting the finished job's history", /REQUIRED/.test(JSON.stringify(mode)) && before === after, { mode: mode?.mode, historyIdentical: before === after });
    await owner.shot("MOD_OWNER_materials-activated", { step: "MOD-4", role: "Proprietar", state: "Materiale activat ulterior; istoricul lucrării neschimbat" }, { full: true });
  } catch (e) { await owner.dump("modularity-a"); throw e; } finally { owner.close(); }
}

/** Main screens at 390 px (Light, Dark) and 1440 px Dark: operability, overflow, readable state. */
async function visual(ctx) {
  const screens = [
    ["workshopA", "/atelier", "VIS_WORKSHOP_atelier", "Atelier: identificare operator"],
    ["ownerA", `/lucrari/${encodeURIComponent(ctx.state.ids.jobId)}`, "VIS_OWNER_job-finished", "fișa lucrării finalizate"],
    ["ownerA", "/admin/access", "VIS_OWNER_access", "Acces organizație: echipa"],
    ["productionA", "/", "VIS_PRODUCTION_home", "pagina de start Producție"],
  ];
  for (const [key, path, name, label] of screens) {
    const ui = await asAccount(ctx, key, `visual-${key}`);
    try {
      for (const [w, hgt, theme] of [[390, 844, "light"], [390, 844, "dark"], [1440, 900, "dark"]]) {
        await ui.view(w, hgt, theme);
        await ui.go(path);
        const overflow = await ui.page.eval("document.documentElement.scrollWidth > innerWidth + 1");
        ctx.check(`VIS ${name} ${w}px ${theme}: no horizontal overflow`, !overflow);
        await ui.shot(name, { step: "VIS", role: key, state: label }, { full: true });
      }
    } finally { ui.close(); }
  }
  const pub = await ctx.suite.actor("visual-login");
  try {
    for (const [w, hgt, theme] of [[390, 844, "light"], [390, 844, "dark"], [1440, 900, "dark"]]) {
      await pub.view(w, hgt, theme);
      await pub.go("/");
      ctx.check(`VIS login ${w}px ${theme}: no horizontal overflow`, !(await pub.page.eval("document.documentElement.scrollWidth > innerWidth + 1")));
      await pub.shot("VIS_PUBLIC_login", { step: "VIS", role: "Public", state: "autentificare" });
    }
  } finally { pub.close(); }
}

/** Facts that must survive any restart (read through the API as the owner). */
async function facts(ctx) {
  const ui = await asOwner(ctx, "facts");
  try {
    const access = (await ui.api("/api/admin/access")).body ?? {};
    const events = (await ui.api("/api/admin/access/events")).body ?? {};
    const people = (await ui.api("/api/people")).body?.registry?.people ?? [];
    const zones = (await ui.api("/api/workcenters")).body?.workcenters ?? [];
    const jobs = (await ui.api("/api/jobs")).body?.overview?.jobs ?? [];
    const plan = (await ui.api(`/api/execution-plans/${encodeURIComponent(ctx.state.ids.planId)}`)).body;
    const tasks = plan?.executionPlan?.tasks ?? [];
    const policy = (await ui.api("/api/admin/commercial-policy")).body ?? {};
    const record = (await ui.api(`/api/jobs/${encodeURIComponent(ctx.state.ids.jobId)}/record`)).body?.record ?? {};
    return {
      members: (access.members ?? []).map((m) => `${m.email}:${m.role}:${m.active}`).sort(),
      auditEvents: (events.events ?? events.items ?? []).length,
      people: people.map((p) => `${p.displayName}:${p.operatorPinConfigured}`).sort(),
      zones: zones.map((z) => `${z.label}:${z.lifecycle}:${(z.machineLabels ?? []).join("+")}`).sort(),
      jobs: jobs.map((j) => `${j.jobId}:${j.stage}`).sort(),
      tasks: tasks.map((t) => `${t.taskId}:${t.status}:${(t.workSessions ?? []).length}`).sort(),
      policyVersion: JSON.stringify(policy).match(/"version"\s*:\s*(\d+)/)?.[1] ?? null,
      issues: (record.issues ?? []).map((i) => `${i.entryId}:${i.status}`).sort(),
      files: (record.files ?? []).length,
    };
  } finally { ui.close(); }
}

async function snapshot(ctx) {
  ctx.state.facts = await facts(ctx);
  ctx.check("PERS-0 facts recorded before restart", ctx.state.facts.members.length >= 5 && ctx.state.facts.tasks.length > 0, { members: ctx.state.facts.members.length, auditEvents: ctx.state.facts.auditEvents, tasks: ctx.state.facts.tasks.length });
}

async function persistence(ctx) {
  const now = await facts(ctx);
  for (const key of Object.keys(ctx.state.facts)) {
    ctx.check(`PERS ${key} identical after restart`, JSON.stringify(now[key]) === JSON.stringify(ctx.state.facts[key]), { before: JSON.stringify(ctx.state.facts[key]).length, after: JSON.stringify(now[key]).length });
  }
  const ui = await asAccount(ctx, "workshopA", "after-restart");
  try {
    await ui.go("/atelier");
    ctx.check("PERS-UI the restarted application serves the UI and a role signs in", await ui.has(/Identifică operatorul|Atelier/));
  } finally { ui.close(); }
}

/** On a RESTORED copy: data and audit are there, and a representative flow still works. */
async function restored(ctx) {
  const now = await facts(ctx);
  for (const key of ["members", "people", "zones", "jobs", "tasks", "issues", "auditEvents"]) {
    ctx.check(`REST ${key} present in the restored copy`, JSON.stringify(now[key]) === JSON.stringify(ctx.state.facts[key]), null);
  }
  const ui = await asAccount(ctx, "commercialA", "restored-flow");
  try {
    await ui.go("/cereri/noua");
    await ui.click("Adaugă client rapid");
    await ui.fill("Denumire client", "Client După Restaurare SRL");
    await ui.fill("Titlu cerere", "Cerere pe copia restaurată");
    await ui.fill("Descriere", "Flux reprezentativ după restaurare.");
    await ui.click("Salvează cererea");
    await ui.page.waitFor(`/^\\/cereri\\/./.test(location.pathname) && !/noua/.test(location.pathname)`, 20000);
    const customers = JSON.stringify((await ui.api("/api/customers")).body);
    ctx.check("REST-FLOW a new client and request are created on the restored copy", customers.includes("Client După Restaurare SRL"));
  } finally { ui.close(); }
}

async function asAccount(ctx, key, label = key) {
  const ui = await ctx.suite.actor(label);
  const a = ctx.secrets.accounts[key];
  if ((await ui.login(a.email, a.password)) !== 200) throw new Error(`${key} login failed`);
  return ui;
}

export const CLIENT = { name: "Atelier Panouri Fictive SRL", city: "Sibiu" };

/** Comercial — new request with a quickly added client and a starting product. */
async function request(ctx) {
  const ui = await asAccount(ctx, "commercialA", "commercial-request");
  try {
    await ui.go("/cereri/noua");
    await ui.click("Adaugă client rapid");
    await ui.fill("Denumire client", CLIENT.name);
    await ui.fill("Titlu cerere", "Litere luminoase fațadă — pilot");
    await ui.fill("Descriere", "Cerere sintetică pentru Pilot Readiness E2E.");
    await ui.click(/^Litere volumetrice luminoase — față plexiglas/);
    await ui.shot("COM_COMMERCIAL_new-request", { step: "COM-1", role: "Comercial", state: "cerere nouă: client nou rapid, titlu, produs ales" }, { full: true });
    await ui.click("Creează cererea și configurează");
    await ui.page.waitFor(`/configurator|configureaza|produs/.test(location.pathname)`, 20000);
    const url = new URL(await ui.page.eval("location.href"));
    const customerId = url.searchParams.get("customer");
    const requestId = url.searchParams.get("request");
    const detail = await ui.api(`/api/requests/${encodeURIComponent(requestId)}`);
    ctx.check("COM-1 client and request created and linked (server)", detail.status === 200 && JSON.stringify(detail.body).includes(customerId) && JSON.stringify(detail.body).includes(CLIENT.name), { request: detail.status });
    ctx.state.ids = { ...(ctx.state.ids ?? {}), customerId, requestId, configuratorUrl: url.pathname + url.search };
    return { customerId, requestId };
  } catch (e) { await ui.dump("request"); throw e; } finally { ui.close(); }
}

export const SELLER = {
  legalName: "WORKOS PILOT DEMO SRL",
  fiscalId: "DEMO-CIF-PILOT",
  tradeRegister: "DEMO-REG-PILOT",
  address: "Strada Exemplu nr. 1",
  locality: "Localitate Demo",
  iban: "RO34DEMO0000000000000001",
  bank: "BANCA DEMONSTRATIVĂ",
};

/** Owner — company identity in Administrare › Date firmă (validated, versioned; all existing fields). */
async function seller(ctx) {
  const ui = await asOwner(ctx, "owner-seller");
  try {
    const before = await ui.api("/api/seller");
    if (!before.body?.configured) {
      await ui.go("/admin/company");
      await ui.waitText(/Date firmă/);
      await ui.shot("CFC_OWNER_company-unconfigured", { step: "ORG-7", role: "Proprietar", state: "date firmă neconfigurate" }, { full: true });
      // Invalid IBAN first: the server refuses it and the draft is kept.
      await ui.fill("Denumire legală", SELLER.legalName);
      await ui.fill("Identificator fiscal (CIF)", SELLER.fiscalId);
      await ui.fill("IBAN", "RO00 GRESIT");
      await ui.click("Revizuiește și salvează");
      await ui.click(/^Salvează versiunea/);
      await ui.waitText(/IBAN invalid/, 15000);
      ctx.check("ORG-7a invalid IBAN refused by the server, draft kept (UI)", await ui.has(/IBAN invalid/));
      await ui.shot("CFC_OWNER_company-invalid-iban", { step: "ORG-7a", role: "Proprietar", state: "date fiscale invalide: IBAN refuzat" }, { full: true });
      for (const [label, value] of [["Nr. Registrul Comerțului", SELLER.tradeRegister], ["Adresă", SELLER.address], ["Localitate", SELLER.locality], ["IBAN", SELLER.iban], ["Bancă", SELLER.bank]]) {
        await ui.fill(label, value);
      }
      await ui.click("Revizuiește și salvează");
      await ui.click(/^Salvează versiunea/);
      await ui.waitText(/Datele firmei au fost salvate/, 15000);
      await ui.shot("CFC_OWNER_company-saved", { step: "ORG-7", role: "Proprietar", state: "date firmă salvate, versiunea 1, istoric" }, { full: true });
    }
    const s = await ui.api("/api/seller");
    const seller = s.body?.seller ?? {};
    ctx.check(
      "ORG-7 company identity configured in Administrare › Date firmă (UI): legal, fiscal, address and bank fields",
      s.status === 200 && seller.legalName === SELLER.legalName && seller.fiscalId === SELLER.fiscalId && seller.iban === SELLER.iban && seller.bank === SELLER.bank && s.body?.version >= 1,
      { status: s.status, version: s.body?.version },
    );
  } catch (e) { await ui.dump("seller"); throw e; } finally { ui.close(); }
}

const CONFIG = [
  ["Produs", "root.inscription", "PILOT"],
  ["Față", "face.finish", "none"],
  ["Față", "face.confirmedAreaMm2", "250000"],
  ["Volum", "volume.depthMm", "60"],
  ["Volum", "volume.finish", "none"],
  ["Volum", "volume.confirmedPerimeterMm", "12500"],
];

async function fillAndConfirm(ui) {
  await ui.go(ui.configuratorUrl);
  const idle = () => ui.page.waitFor(`!/Se actualizează|Se verifică valorile/.test(document.body.innerText)`, 20000);
  for (const [section, id, value] of CONFIG) {
    await ui.click(section, { exact: true });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await idle();
      await ui.fill(id, value);
      await ui.sleep(600);
      await idle();
      if (await ui.page.eval(`document.getElementById(${JSON.stringify(id)})?.value === ${JSON.stringify(value)}`)) break;
    }
  }
  await idle();
  await ui.page.waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Verifică configurația' && !b.disabled)`, 20000);
  await ui.click("Verifică configurația");
  await ui.waitText(/Confirmă configurația/, 20000);
  await ui.click("Confirmă configurația");
  await ui.waitText(/Configurație confirmată/, 20000);
}

/** Comercial — configures the product from the server schema and gets it confirmed by the server. */
async function configure(ctx) {
  const ui = await asAccount(ctx, "commercialA", "commercial-configure");
  ui.configuratorUrl = ctx.state.ids.configuratorUrl;
  try {
    await fillAndConfirm(ui);
    ctx.check("COM-2 Comercial: configuration complete and confirmed by the server", await ui.has(/5 din 5 părți complete/));
    // Price setting is reserved to prices.manual.set (Proprietar); the UI says so — recorded, not bypassed.
    const blocked = await ui.has(/Prețul manual nu poate fi setat/);
    ctx.check("COM-3 Comercial cannot set the manual price / freeze (prices.manual.set is owner-only, pre-V1 rule kept)", blocked);
    await ui.shot("COM_COMMERCIAL_configuration-confirmed-price-owner-only", { step: "COM-2/3", role: "Comercial", state: "configurație confirmată; prețul manual îl stabilește Proprietarul" }, { full: true });
  } catch (e) { await ui.dump("configure"); throw e; } finally { ui.close(); }
}

/** Proprietar — same request: confirms the configuration, sets the client price, acknowledges unconfirmed rates, freezes. */
async function freeze(ctx) {
  const ui = await asOwner(ctx, "owner-freeze");
  ui.configuratorUrl = ctx.state.ids.configuratorUrl;
  try {
    await fillAndConfirm(ui);
    await ui.fill("Preț net al produsului, fără TVA", "1450");
    await ui.click("Confirmă prețul");
    await ui.settle(1200);
    if (await ui.has(/Am verificat tarifele neconfirmate/)) await ui.check("Am verificat tarifele neconfirmate");
    await ui.shot("COM_OWNER_quote-ready-to-freeze", { step: "COM-4", role: "Proprietar", state: "preț client confirmat, tarife neconfirmate verificate, gata de înghețare" }, { full: true });
    await ui.click("Îngheață oferta", { exact: true });
    await ui.waitText(/Deschide oferta înghețată/, 20000);
    await ui.click("Deschide oferta înghețată");
    await ui.page.waitFor(`/oferte\\//.test(location.pathname)`, 20000);
    const quoteUrl = await ui.page.eval("location.pathname");
    ctx.check("COM-4 quote frozen and opened (server-backed URL)", /\/oferte\//.test(quoteUrl), quoteUrl);
    await ui.shot("COM_OWNER_quote-frozen", { step: "COM-4", role: "Proprietar", state: "ofertă înghețată" }, { full: true });
    ctx.state.ids.quoteUrl = quoteUrl;
    return { quoteUrl };
  } catch (e) { await ui.dump("freeze"); throw e; } finally { ui.close(); }
}

/** Commercial & Financial V1 · offering policy, Comercial request, Owner approval, freeze. */
async function offering(ctx) {
  const owner = await asOwner(ctx, "owner-offering");
  const commercial = await asAccount(ctx, "commercialA", "commercial-offering");
  try {
    if (!ctx.state.ids.offeringPolicySet) {
      await owner.go("/admin/offering");
      await owner.waitText(/Reguli de ofertare/);
      await owner.shot("CFC_OWNER_offering-default", { step: "CFC-1", role: "Proprietar", state: "fără politică salvată: doar Proprietarul" }, { full: true });
      await owner.click(/excepțiile cer aprobarea/);
      await owner.settle(400);
      ctx.check("CFC-1 approval mode without a rule cannot be saved (fail-closed, UI)", await owner.has(/Nicio regulă activă/));
      await owner.fill("Valoare netă maximă fără aprobare", "1000");
      await owner.click("Revizuiește și salvează");
      await owner.click(/^Salvează versiunea/);
      await owner.waitText(/Regulile au fost salvate/, 15000);
      await owner.shot("CFC_OWNER_offering-saved", { step: "CFC-1", role: "Proprietar", state: "mod cu aprobare, prag valoare netă" }, { full: true });
      ctx.state.ids.offeringPolicySet = true; ctx.saveState?.();
    }
    const policy = (await owner.api("/api/admin/offering-policy")).body?.policy;
    ctx.check("CFC-1 policy stored and versioned by the server", policy?.mode === "COMMERCIAL_APPROVAL_POLICY" && policy?.rules?.maximumNetValue === 1000 && policy?.version >= 1, policy?.version);
    const commercialPolicy = await commercial.api("/api/offering-policy");
    ctx.check("CFC-2 Comercial reads the mode, never the threshold", commercialPolicy.status === 200 && !JSON.stringify(commercialPolicy.body).includes("1000"), commercialPolicy.body?.policy?.mode);
    ctx.check("CFC-2b Comercial cannot read or change the policy administration", (await commercial.api("/api/admin/offering-policy")).status === 403 && (await commercial.api("/api/admin/price-approvals")).status === 403);

    if (!ctx.state.ids.approvalRequestId) {
      const customer = await commercial.api("/api/customers", { method: "POST", body: JSON.stringify({ displayName: "Client Aprobare SRL" }) });
      const customerId = customer.body?.customer?.customerId;
      const req = await commercial.api("/api/requests", { method: "POST", body: JSON.stringify({ customerId, title: "Ofertă peste prag — pilot", description: "Cerere sintetică pentru aprobarea Proprietarului." }) });
      const requestId = req.body?.request?.requestId ?? req.body?.detail?.request?.requestId;
      ctx.state.ids.approvalCustomerId = customerId;
      ctx.state.ids.approvalRequestId = requestId;
      ctx.saveState?.();
    }
    const { customerId: baseCustomer, requestId: baseRequest, configuratorUrl } = ctx.state.ids;
    commercial.configuratorUrl = configuratorUrl
      .split(encodeURIComponent(baseRequest)).join(encodeURIComponent(ctx.state.ids.approvalRequestId))
      .split(baseRequest).join(ctx.state.ids.approvalRequestId)
      .split(encodeURIComponent(baseCustomer)).join(encodeURIComponent(ctx.state.ids.approvalCustomerId))
      .split(baseCustomer).join(ctx.state.ids.approvalCustomerId);
    await fillAndConfirm(commercial);
    await commercial.fill("Preț net al produsului, fără TVA", "1450");
    await commercial.click("Confirmă prețul");
    await commercial.settle(1500);
    ctx.check("CFC-3 Comercial sets the price; the server asks for the Owner's approval (UI)", await commercial.has(/Necesită aprobarea Proprietarului/));
    ctx.check("CFC-3b freeze is not available before approval (UI)", !(await commercial.canClick("Îngheață oferta")));
    await commercial.shot("CFC_COMMERCIAL_approval-required", { step: "CFC-3", role: "Comercial", state: "ofertă peste regulile firmei: aprobare necesară" }, { full: true });
    if (await commercial.canClick("Trimite spre aprobare")) {
      await commercial.fill("Notă pentru Proprietar (opțional)", "Client cu volum mare");
      await commercial.click("Trimite spre aprobare");
      await commercial.waitText(/Așteaptă aprobarea Proprietarului/, 15000);
    }
    await commercial.shot("CFC_COMMERCIAL_approval-pending", { step: "CFC-4", role: "Comercial", state: "solicitare trimisă, în așteptare" }, { full: true });
    const pageText = await commercial.text();
    // The pre-V1 "Cost intern" panel title is shown to the Comercial without values; only values,
    // margins and the Owner's thresholds would be a leak.
    ctx.check("CFC-4 Comercial view shows no margin, rule or threshold (UI)", !/marj|1\.000,00|Valoarea netă depășește/i.test(pageText));

    await owner.go("/admin/offering");
    await owner.waitText(/Client Aprobare SRL/, 20000);
    await owner.shot("CFC_OWNER_approval-request", { step: "CFC-5", role: "Proprietar", state: "solicitare de aprobare: regula declanșată, preț net" }, { full: true });
    const pending = (await owner.api("/api/admin/price-approvals?status=REQUESTED")).body?.approvals ?? [];
    const approval = pending.find((item) => item.requestId === ctx.state.ids.approvalRequestId);
    if (approval) {
      await owner.click("Aprobă această variantă");
      await owner.settle(1500);
    }
    const decided = (await owner.api("/api/admin/price-approvals?status=APPROVED")).body?.approvals ?? [];
    const approved = decided.find((item) => item.requestId === ctx.state.ids.approvalRequestId);
    ctx.check("CFC-5 Owner approves the exact variant (UI), journaled by the server", Boolean(approved), approved?.status);
    if (approved) ctx.state.ids.approvalId = approved.approvalId;

    await fillAndConfirm(commercial);
    await commercial.fill("Preț net al produsului, fără TVA", "1450");
    await commercial.click("Confirmă prețul");
    await commercial.settle(1500);
    ctx.check("CFC-6 Comercial sees the approval for the same variant (UI)", await commercial.has(/Aprobată de Proprietar/));
    await commercial.shot("CFC_COMMERCIAL_approval-granted", { step: "CFC-6", role: "Comercial", state: "aprobare acordată, înghețare permisă" }, { full: true });
    await commercial.click("Îngheață oferta", { exact: true });
    await commercial.waitText(/Deschide oferta înghețată/, 20000);
    await commercial.click("Deschide oferta înghețată");
    await commercial.page.waitFor(`/oferte\\//.test(location.pathname)`, 20000);
    const approvedQuoteUrl = await commercial.page.eval("location.pathname");
    const quote = (await owner.api(quoteApi(approvedQuoteUrl))).body;
    const frozenOffering = (quote?.quoteSnapshot ?? quote)?.offering;
    ctx.check("CFC-7 quote frozen by the Comercial with the approval in the snapshot", frozenOffering?.outcome === "APPROVED_EXCEPTION" && frozenOffering?.pricedByRole === "member", frozenOffering?.outcome);
    ctx.state.ids.approvedQuoteUrl = approvedQuoteUrl; ctx.saveState?.();
    await commercial.shot("CFC_COMMERCIAL_quote-frozen-approved", { step: "CFC-7", role: "Comercial", state: "ofertă înghețată cu aprobare" }, { full: true });
    ctx.check("CFC-8 Comercial still cannot accept the order", (await commercial.api(`${quoteApi(approvedQuoteUrl)}/confirm-order`, { method: "POST", body: "{}" })).status === 403);

    // Isolation and scoped roles on the new routes.
    const ownerB = await ctx.suite.actor("owner-b-offering");
    try {
      const b = ctx.secrets.accounts.ownerB;
      if ((await ownerB.login(b.email, b.password)) !== 200) throw new Error("owner B login");
      const approvalsB = JSON.stringify((await ownerB.api("/api/admin/price-approvals")).body ?? {});
      ctx.check("CFC-ISO organization B sees none of A's approvals and keeps its own default policy", !approvalsB.includes(ctx.state.ids.approvalRequestId) && (await ownerB.api("/api/offering-policy")).body?.policy?.mode === "OWNER_ONLY");
      if (ctx.state.ids.approvalId) {
        ctx.check("CFC-ISO B cannot decide A's approval (404)", (await ownerB.api(`/api/admin/price-approvals/${encodeURIComponent(ctx.state.ids.approvalId)}/decision`, { method: "POST", body: JSON.stringify({ decision: "APPROVED" }) })).status === 404);
      }
    } finally { ownerB.close(); }
    for (const key of ["productionA", "workshopA"]) {
      const scoped = await asAccount(ctx, key, `cfc-${key}`);
      try {
        const statuses = [
          (await scoped.api("/api/offering-policy")).status,
          (await scoped.api("/api/admin/price-approvals")).status,
          (await scoped.api("/api/seller/versions")).status,
          (await scoped.api(`/api/jobs/${encodeURIComponent(ctx.state.ids.jobId)}/economics`)).status,
        ];
        ctx.check(`CFC-ROLE ${key} refused on policy, approvals, company history and economics`, statuses.every((s) => s === 403), statuses);
      } finally { scoped.close(); }
    }
    return { approvedQuoteUrl };
  } catch (e) { await commercial.dump("offering"); await owner.dump("offering-owner"); throw e; } finally { owner.close(); commercial.close(); }
}

/** Commercial & Financial V1 · company identity versions, concurrency, frozen quotes unchanged. */
async function companyIdentity(ctx) {
  const owner = await asOwner(ctx, "owner-company");
  const commercial = await asAccount(ctx, "commercialA", "commercial-company");
  try {
    const before = (await owner.api("/api/seller")).body;
    if (before?.seller?.bank === SELLER.bank) {
      await owner.go("/admin/company");
      await owner.waitText(/Date firmă/);
      await owner.fill("Bancă", "BANCA DEMONSTRATIVĂ PILOT");
      await owner.click("Revizuiește și salvează");
      await owner.click(/^Salvează versiunea/);
      await owner.waitText(/Datele firmei au fost salvate/, 15000);
    }
    await owner.shot("CFC_OWNER_company-history", { step: "CFC-9", role: "Proprietar", state: "date firmă: versiune nouă și istoric" }, { full: true });
    const versions = (await owner.api("/api/seller/versions")).body;
    ctx.check("CFC-9 a second company version is recorded with author and changed fields", (versions?.versions ?? []).length >= 2 && versions.versions[0].changedFields.some((f) => f.field === "bank"), versions?.currentVersion);
    const quote = (await owner.api(quoteApi(ctx.state.ids.quoteUrl))).body;
    const frozenSeller = (quote?.quoteSnapshot ?? quote)?.seller ?? {};
    ctx.check("CFC-10 the frozen quote keeps the identity of its issue time", frozenSeller.bank !== "BANCA DEMONSTRATIVĂ PILOT", frozenSeller.bank ?? null);
    const stale = await owner.api("/api/seller", { method: "PATCH", body: JSON.stringify({ ...SELLER, expectedVersion: 0 }) });
    ctx.check("CFC-11 a concurrent (stale) company edit is refused (409)", stale.status === 409, stale.status);
    const commercialView = (await commercial.api("/api/seller")).body;
    ctx.check("CFC-12 Comercial reads the identity, cannot edit it", commercialView?.canEdit === false && (await commercial.api("/api/seller", { method: "PATCH", body: JSON.stringify(SELLER) })).status === 403);
    await commercial.go("/admin/company");
    await commercial.waitText(/Date firmă/, 15000);
    await commercial.shot("CFC_COMMERCIAL_company-readonly", { step: "CFC-12", role: "Comercial", state: "date firmă: doar citire" }, { full: true });
  } finally { owner.close(); commercial.close(); }
}

/** Commercial & Financial V1 · the new screens at 1440/768/390 px, Light and Dark. */
async function commercialFinancialVisual(ctx) {
  const screens = [
    ["ownerA", "/admin/offering", "VIS_CFC_OWNER_offering", "Reguli de ofertare"],
    ["ownerA", "/admin/company", "VIS_CFC_OWNER_company", "Date firmă"],
    ["ownerA", `/lucrari/${encodeURIComponent(ctx.state.ids.jobId)}`, "VIS_CFC_OWNER_job-pva", "Planificat vs realizat"],
    ["commercialA", "/admin/company", "VIS_CFC_COMMERCIAL_company", "Date firmă, doar citire"],
  ];
  for (const [key, path, name, label] of screens) {
    const ui = await asAccount(ctx, key, `cfc-visual-${key}`);
    try {
      for (const [w, hgt, theme] of [[1440, 900, "light"], [1440, 900, "dark"], [768, 1024, "light"], [390, 844, "light"], [390, 844, "dark"]]) {
        await ui.view(w, hgt, theme);
        await ui.go(path);
        await ui.settle(900);
        const overflow = await ui.page.eval("document.documentElement.scrollWidth > innerWidth + 1");
        ctx.check(`VIS ${name} ${w}px ${theme}: no horizontal overflow`, !overflow);
        await ui.shot(name, { step: "VIS-CFC", role: key, state: label }, { full: true });
      }
      // Keyboard: the first focusable control in the main content receives a visible focus ring.
      await ui.view(1440, 900, "light");
      await ui.go(path);
      await ui.settle(600);
      const focus = await ui.page.eval(`(() => { const el = document.querySelector('main a, main button, main input'); if (!el) return 'none'; el.focus(); const s = getComputedStyle(el); return document.activeElement === el ? (s.outlineStyle !== 'none' || s.boxShadow !== 'none' ? 'ring' : 'focus') : 'no-focus'; })()`);
      ctx.check(`VIS ${name}: keyboard focus reaches the content`, focus === "ring" || focus === "focus", focus);
    } finally { ui.close(); }
  }
}

export const STEPS = [
  { id: "products", title: "Owner selects the products offered", run: products },
  { id: "commercial", title: "Owner confirms the commercial policy", run: commercialPolicy },
  { id: "costs", title: "Owner confirms production costs", run: costs },
  { id: "workcenters", title: "Owner creates zones and machines", run: workcenters },
  { id: "people", title: "Owner adds people, skills and PINs", run: people },
  { id: "invitations", title: "Owner invites the team; members accept", run: invitations },
  { id: "request", title: "Comercial creates client and request", run: request },
  { id: "seller", title: "Owner configures the company identity (Administrare › Date firmă)", run: seller },
  { id: "configure", title: "Comercial configures and confirms the product", run: configure },
  { id: "freeze", title: "Owner sets the price and freezes the quote", run: freeze },
  { id: "accept", title: "Owner downloads the PDF, accepts; order and job", run: accept },
  { id: "immutability", title: "Later policy change does not rewrite the frozen quote", run: immutability },
  { id: "release", title: "Producție releases the job (Atelier refused)", run: release },
  { id: "atelier", title: "Atelier executes every operation by PIN, with QC", run: atelier },
  { id: "supervise", title: "Producție resolves the reported issue", run: supervise },
  { id: "pva", title: "Finalization and Planned vs Actual", run: plannedVsActual },
  { id: "offering", title: "Offering policy: Comercial request, Owner approval, freeze", run: offering },
  { id: "company", title: "Company identity versions, concurrency, frozen quote unchanged", run: companyIdentity },
  { id: "cfcvisual", title: "Commercial & Financial screens at 1440/768/390 px Light/Dark", run: commercialFinancialVisual },
  { id: "roles", title: "Four-role contract: navigation and server", run: roles },
  { id: "sessions", title: "Invalid invitation, expired session, revoked user", run: sessions },
  { id: "multiorg", title: "Two organizations: choice, switch, operator reset, isolation", run: multiOrg },
  { id: "modularity", title: "Simple company B; Materials activated later in A", run: modularity },
  { id: "visual", title: "Main screens at 390 px Light/Dark and 1440 px Dark", run: visual },
  { id: "snapshot", title: "Record facts before restart", run: snapshot },
  // Run explicitly with --steps after a restart / on a restored copy (never part of the default chain).
  { id: "persistence", title: "Facts identical after restart", run: persistence, explicitOnly: true },
  { id: "restored", title: "Restored copy: data, audit and a representative flow", run: restored, explicitOnly: true },
];
