// V1 Organization Access · browser E2E on a SYNTHETIC isolated runtime (headless Chromium over CDP).
// Usage: node browser-e2e.mjs --base http://127.0.0.1:5271 --root <synthetic root> --evidence <dir> --chrome <chrome.exe>
// Credentials come from the synthetic root and generated passwords stay in memory.
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const BASE = arg("base"); const ROOT = arg("root"); const EVID = arg("evidence"); const CHROME = arg("chrome"); const PROFILES = arg("profiles");
mkdirSync(`${EVID}/screenshots`, { recursive: true });
const identity = JSON.parse(readFileSync(`${ROOT}/.reference-identity.json`, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const shots = [];
const check = (name, pass, detail = null) => { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${JSON.stringify(detail).slice(0, 200)}` : ""}`); };

async function launch(port, profile) {
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${PROFILES}/${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      const target = list.find((t) => t.type === "page");
      if (target) return { proc, page: await connect(target.webSocketDebuggerUrl) };
    } catch { /* not yet */ }
    await sleep(200);
  }
  throw new Error("chrome_not_ready");
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; pending.set(i, (msg) => (msg.error ? j(new Error(`${method}: ${msg.error.message}`)) : r(msg.result))); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  const page = {
    send,
    async viewport(width, height = 900) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 }); },
    async theme(scheme) { await page.eval(`localStorage.setItem('workos-color-scheme','${scheme}')`); },
    async goto(path, settle = 2200) { await send("Page.navigate", { url: path.startsWith("http") ? path : BASE + path }); await sleep(settle); },
    async eval(expr) { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; },
    async text() { return page.eval(`document.body.innerText`); },
    async click(text, scope = "document") { return page.eval(`(() => { const el = [...${scope}.querySelectorAll('button, a, label')].find(e => e.offsetParent && e.textContent.trim().replace(/\\s+/g,' ').includes(${JSON.stringify(text)})); if (!el) return false; el.click(); return true; })()`); },
    async type(selector, value) { return page.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`); },
    async shot(name, meta) {
      const r = await send("Page.captureScreenshot", { format: "png" });
      const buf = Buffer.from(r.data, "base64");
      const path = `${EVID}/screenshots/${name}.png`;
      writeFileSync(path, buf);
      shots.push({ name, path, sha256: createHash("sha256").update(buf).digest("hex"), ...meta, capturedAt: new Date().toISOString() });
    },
    async overflow() { return page.eval(`document.documentElement.scrollWidth > window.innerWidth + 1`); },
    async focusVisible() { return page.eval(`(() => { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e); return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'; })()`); },
    async tab(n = 1) { for (let i = 0; i < n; i++) { await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); await sleep(60); } },
    async esc() { await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await sleep(300); },
  };
  return page;
}

const MONEY = /\b\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?\s?(?:EUR|RON|lei|€)\b/i;
const loginInPage = (page, email, password) => page.eval(`fetch('/api/cloud/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(${JSON.stringify({ email, password })})}).then(r=>r.status)`);
const navLabels = (page) => page.eval(`[...document.querySelectorAll('.app-shell__modules .app-shell__module-label, .app-shell__switcher-sheet .app-shell__module-label')].map(e=>e.textContent.trim())`);

const owner = await launch(9351, "owner");
const user = await launch(9352, "invitee");
try {
  // A · owner opens Administrare › Acces organizație
  await owner.page.viewport(1440);
  await owner.page.goto("/", 1500);
  check("A1 owner login", (await loginInPage(owner.page, identity.users.owner.email, identity.password)) === 200);
  await owner.page.theme("light");
  await owner.page.goto("/admin/access");
  const accessText = await owner.page.text();
  check("A2 access page shows users, invitations, roles", /Utilizatori cu acces/.test(accessText) && /Invitații în așteptare/.test(accessText) && /Roluri și drepturi/.test(accessText) && /Atelier/.test(accessText));
  check("A3 no internal codes on the access page", !/ACTIVE_SCOPED|org\.access|capability|membership_|mem:|usr:/.test(accessText));
  await owner.page.shot("access_owner_1440_light", { route: "/admin/access", state: "owner list", viewport: "1440x900", theme: "Lumină" });

  // B · invite a workshop user through the dialog
  check("B1 open invite dialog", await owner.page.click("Invită utilizator"));
  await sleep(400);
  await owner.page.tab(1);
  check("B2 keyboard focus visible inside the dialog", (await owner.page.focusVisible()) === true);
  const inviteEmail = `atelier.e2e@workos.test`;
  await owner.page.type("#acc-invite-email", inviteEmail);
  await owner.page.click("Atelier", "document.querySelector('dialog[open], [role=dialog]')");
  await owner.page.shot("access_invite_dialog_1440_light", { route: "/admin/access", state: "invite dialog", viewport: "1440x900", theme: "Lumină" });
  await owner.page.click("Trimite invitația", "document.querySelector('dialog[open], [role=dialog]')");
  await sleep(1500);
  const link = await owner.page.eval(`document.querySelector('#acc-once-link')?.value ?? null`);
  check("B3 one-time invitation link shown (pilot LINK)", typeof link === "string" && link.includes("/invitatie#t="));
  // Evidence must not contain tokens: the link field is masked for the capture only.
  await owner.page.eval(`document.querySelector('#acc-once-link').style.webkitTextSecurity = 'disc'`);
  await owner.page.shot("access_once_link_1440_light", { route: "/admin/access", state: "one-time link (VISUAL_OWNER_REVIEW_REQUIRED)", viewport: "1440x900", theme: "Lumină", note: "token masked in the capture" });
  await owner.page.eval(`document.querySelector('#acc-once-link').style.webkitTextSecurity = ''`);

  // C · the invitee accepts in a fresh browser (390 px)
  await user.page.viewport(390, 844);
  await user.page.goto(link.replace(/^https?:\/\/[^/]+/, BASE), 2500);
  const inviteText = await user.page.text();
  check("C1 invitation page names organization and role, masks the email", /Ai fost invitat în/.test(inviteText) && /Atelier/.test(inviteText) && /a•••@workos\.test/.test(inviteText));
  await user.page.shot("invitation_public_390_light", { route: "/invitatie", state: "valid invitation", viewport: "390x844", theme: "Lumină" });
  const password = `${randomBytes(12).toString("base64url")}7a`; // policy: letters + a digit
  await user.page.type("#acct-new-password", password);
  await user.page.type("#acct-confirm-password", password);
  await user.page.click("Acceptă invitația");
  await sleep(3500);
  const landing = await user.page.eval(`location.pathname`);
  const landingText = await user.page.text();
  check("C2 invitee lands in the application as Atelier", landing === "/" && /Atelier/.test(landingText) && !/Autentificare/.test(landingText.slice(0, 200)));
  await user.page.viewport(1440);
  await user.page.goto("/", 2500);
  const workshopNav = await navLabels(user.page);
  check("C3 workshop navigation: Lucrări + Atelier only", JSON.stringify(workshopNav) === JSON.stringify(["Lucrări", "Atelier"]), workshopNav);
  await user.page.shot("workshop_home_1440_light", { route: "/", state: "workshop landing (Atelier)", viewport: "1440x900", theme: "Lumină" });
  await user.page.goto("/oferte");
  check("C4 workshop opening /oferte gets a calm no-access state", /Nu ai acces la această secțiune/.test(await user.page.text()));
  await user.page.shot("workshop_no_access_quotes_1440_light", { route: "/oferte", state: "no access", viewport: "1440x900", theme: "Lumină" });
  const jobs = await user.page.eval(`fetch('/api/jobs',{credentials:'include'}).then(r=>r.json()).then(b=>b.overview.jobs.map(j=>j.jobId))`);
  let moneySeen = null;
  for (const jobId of jobs.slice(0, 5)) {
    await user.page.goto(`/lucrari/${encodeURIComponent(jobId)}`, 2500);
    const text = await user.page.text();
    if (MONEY.test(text)) { moneySeen = { jobId: jobId.slice(0, 20), sample: text.match(MONEY)[0] }; break; }
  }
  check("C5 workshop job sheets show no money (5 jobs, visible text)", moneySeen === null, moneySeen);
  await user.page.shot("workshop_job_sheet_1440_light", { route: "/lucrari/:id", state: "job sheet, workshop scope", viewport: "1440x900", theme: "Lumină" });
  const quotesApi = await user.page.eval(`fetch('/api/quotes',{credentials:'include'}).then(r=>r.status)`);
  check("C6 workshop API /api/quotes refused by the server", quotesApi === 403);

  // D · owner changes the role to Producție; the workshop browser picks it up at the next request
  await owner.page.goto("/admin/access");
  const changed = await owner.page.eval(`(() => { const row = [...document.querySelectorAll('.adm-member')].find(r => r.textContent.includes(${JSON.stringify(inviteEmail)})); const b = row && [...row.querySelectorAll('button')].find(x => x.textContent.includes('Schimbă rolul')); if (!b) return false; b.click(); return true; })()`);
  await sleep(400);
  await owner.page.click("Producție", "document.querySelector('dialog[open], [role=dialog]')");
  await owner.page.shot("access_role_dialog_1440_light", { route: "/admin/access", state: "change role", viewport: "1440x900", theme: "Lumină" });
  await owner.page.click("Schimbă rolul", "document.querySelector('dialog[open], [role=dialog]')");
  await sleep(1500);
  check("D1 owner changes Atelier → Producție", changed && /Rolul lui/.test(await owner.page.text()));
  await user.page.goto("/oferte", 2500); // 403 on the server → session re-read
  await sleep(2500);
  await user.page.goto("/", 2500);
  const productionNav = await navLabels(user.page);
  check("D2 navigation follows the new role without re-login", productionNav.includes("Clienți") && productionNav.includes("Lucrări") && !productionNav.includes("Oferte"), productionNav);

  // F · Contul meu › Securitate: change password keeps this device signed in
  await user.page.theme("dark");
  await user.page.goto("/cont/securitate", 2500);
  check("F1 account security page", /Schimbă parola/.test(await user.page.text()) && /Sesiuni active/.test(await user.page.text()));
  await user.page.shot("account_security_1440_dark", { route: "/cont/securitate", state: "account security", viewport: "1440x900", theme: "Noapte" });
  const newPassword = `${randomBytes(12).toString("base64url")}7a`; // policy: letters + a digit
  await user.page.type("#acct-current", password);
  await user.page.type("#acct-next", newPassword);
  await user.page.type("#acct-confirm", newPassword);
  await user.page.click("Schimbă parola", "document.querySelector('.acct-form')");
  await sleep(2500);
  check("F2 password changed; still signed in", /Parola a fost schimbată/.test(await user.page.text()));
  await user.page.goto("/lucrari", 2000);
  check("F3 rotated session works after navigation", /Lucrări/.test(await user.page.text()) && !/Autentificare/.test((await user.page.text()).slice(0, 300)));
  await user.page.viewport(390, 844);
  await user.page.goto("/cont/securitate", 2500);
  check("F4 account security at 390 px has no horizontal overflow", !(await user.page.overflow()));
  await user.page.shot("account_security_390_dark", { route: "/cont/securitate", state: "after password change", viewport: "390x844", theme: "Noapte" });

  // E · owner revokes; the user loses access at the next request
  await owner.page.goto("/admin/access");
  await owner.page.eval(`(() => { const row = [...document.querySelectorAll('.adm-member')].find(r => r.textContent.includes(${JSON.stringify(inviteEmail)})); [...row.querySelectorAll('button')].find(x => x.textContent.trim() === 'Revocă').click(); })()`);
  await sleep(400);
  await owner.page.click("Revocă accesul", "document.querySelector('dialog[open], [role=dialog]')");
  await sleep(1500);
  check("E1 owner revokes the user", /nu se mai poate autentifica/.test(await owner.page.text()));
  await owner.page.shot("access_after_revoke_1440_light", { route: "/admin/access", state: "revoked", viewport: "1440x900", theme: "Lumină" });
  await user.page.viewport(1440);
  await user.page.goto("/lucrari", 3000);
  const afterRevoke = await user.page.text();
  check("E2 revoked user is sent back to sign-in", /Autentificare|Sesiunea a expirat|Login/.test(afterRevoke));
  await user.page.shot("revoked_user_1440_dark", { route: "/lucrari", state: "after revocation", viewport: "1440x900", theme: "Noapte" });

  // G · public reset page in pilot mode, invalid invitation token
  await user.page.theme("light");
  await user.page.goto("/resetare-parola", 2000);
  check("G1 reset page without token offers the request form", /Am uitat parola/.test(await user.page.text()));
  await user.page.type("#acct-reset-email", "oricine@workos.test");
  await user.page.click("Trimite linkul");
  await sleep(1500);
  check("G2 pilot (no email): neutral answer pointing to support", /suportul WorkOS/.test(await user.page.text()));
  await user.page.shot("password_reset_pilot_1440_light", { route: "/resetare-parola", state: "pilot: no email delivery", viewport: "1440x900", theme: "Lumină" });
  await user.page.goto("/invitatie#t=invalid-token-for-test-only", 2500);
  check("G3 invalid or used invitation shows a neutral unavailable state", /Invitația nu mai este valabilă/.test(await user.page.text()));
  await user.page.shot("invitation_unavailable_1440_light", { route: "/invitatie", state: "token invalid/used/expired", viewport: "1440x900", theme: "Lumină" });

  // H · responsive and themes for the access page
  for (const [w, h] of [[1440, 900], [1280, 800], [768, 1024], [390, 844]]) {
    for (const theme of ["light", "dark"]) {
      await owner.page.viewport(w, h);
      await owner.page.theme(theme);
      await owner.page.goto("/admin/access", 2000);
      const of = await owner.page.overflow();
      check(`H access page ${w}px ${theme}: no horizontal overflow`, !of);
      if ((w === 768 && theme === "light") || (w === 390 && theme === "dark") || (w === 1280 && theme === "dark")) {
        await owner.page.shot(`access_owner_${w}_${theme === "light" ? "light" : "dark"}`, { route: "/admin/access", state: "owner list", viewport: `${w}x${h}`, theme: theme === "light" ? "Lumină" : "Noapte" });
      }
    }
  }
  await owner.page.viewport(1440);
  await owner.page.theme("light");
  // I · Esc closes the dialog
  await owner.page.goto("/admin/access", 2000);
  await owner.page.click("Invită utilizator");
  await sleep(300);
  await owner.page.esc();
  check("I1 Esc closes the invite dialog", !(await owner.page.eval(`!!document.querySelector('dialog[open], [role=dialog]')`)));
} finally {
  owner.proc.kill();
  user.proc.kill();
}
writeFileSync(`${EVID}/browser_e2e_results.json`, JSON.stringify({ base: BASE, results, shots }, null, 2));
console.log(`TOTAL ${results.length} PASS ${results.filter((r) => r.pass).length}`);
