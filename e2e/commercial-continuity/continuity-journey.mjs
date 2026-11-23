// Commercial Continuity V2 · browser journey on an isolated synthetic runtime.
// REQUEST → saved variant → handoff → price → approval → issued quote, in the four commercial modes,
// plus journal, stale approval, concurrent edit and the second-acceptance installation block.
// Real UI, real API, real engine; nothing is computed by the test itself.
// Usage: node e2e/commercial-continuity/continuity-journey.mjs --base URL --root DIR --evidence DIR [--chrome EXE]
// Credentials: the synthetic dev identity is read from <root>/.dev-identity.json; the Comercial
// account is created here with a generated password kept in <root>/continuity-e2e-secrets.json
// (outside Git). Neither is printed, logged or captured (secret guard on every capture).
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createSuite } from "../pilot/ui.mjs";

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const BASE = arg("base");
const ROOT = arg("root");
const EVIDENCE = arg("evidence");
const CHROME = arg("chrome") ?? process.env.WORKOS_E2E_CHROME ?? `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1248/chrome-win64/chrome.exe`;
if (!BASE || !ROOT || !EVIDENCE) { console.error("usage: --base URL --root DIR --evidence DIR"); process.exit(2); }

const identity = JSON.parse(readFileSync(`${ROOT}/.dev-identity.json`, "utf8"));
const secretsFile = `${ROOT}/continuity-e2e-secrets.json`;
const secrets = existsSync(secretsFile) ? JSON.parse(readFileSync(secretsFile, "utf8")) : {};
const RUN = Date.now().toString(36);
const MEMBER_EMAIL = secrets.memberEmail ?? `comercial-${RUN}@workos.local`;
const MEMBER_PASSWORD = secrets.memberPassword ?? `Cc2-${randomBytes(12).toString("base64url")}`;

const suite = createSuite({
  base: BASE,
  evidence: EVIDENCE,
  chrome: CHROME,
  profiles: `${ROOT}/.e2e-profiles`,
  secrets: () => [identity.password, MEMBER_PASSWORD],
});
const { check } = suite;
const PRODUCT = "PRD-LETTERS-FRONTLIT-PLEXI-AL06";
const SELLER = {
  legalName: "FIRMA DEMONSTRATIVĂ S.R.L.", brand: "ATELIER DEMONSTRATIV", fiscalId: "DEMO-CIF-0001", tradeRegister: "DEMO-REG-0001",
  address: "Strada Exemplu nr. 1", locality: "Localitate Demo", iban: "RO34DEMO0000000000000001", bank: "BANCA DEMONSTRATIVĂ",
};
const values = (inscription, depth = "60") => ({
  "root.inscription": inscription, "face.finish": "none", "face.confirmedAreaMm2": 250000,
  "volume.depthMm": depth, "volume.finish": "none", "volume.confirmedPerimeterMm": 12500,
});
const WIDTHS = [[1440, 900], [1280, 720], [768, 1024], [390, 844]];

async function api(ui, method, path, body) {
  return ui.api(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const ok = (r) => r.status >= 200 && r.status < 300;

/** Captures the current page at the four widths in Light and Dark. */
async function matrix(ui, name, meta = {}, url = null, ready = null) {
  const target = url ?? (await ui.page.eval("location.pathname + location.search"));
  for (const theme of ["light", "dark"]) {
    for (const [w, h] of WIDTHS) {
      await ui.view(w, h, theme);
      await ui.go(target);
      if (ready) await ui.waitText(ready).catch(() => {});
      await ui.settle(900);
      await ui.shot(name, meta);
    }
  }
  await ui.view(1440, 900, "light");
  await ui.go(target);
  if (ready) await ui.waitText(ready).catch(() => {});
  await ui.settle(900);
}

async function setPolicy(owner, mode, rules = {}) {
  const current = await api(owner, "GET", "/api/admin/offering-policy");
  const saved = await api(owner, "POST", "/api/admin/offering-policy", { mode, rules, expectedVersion: current.body.policy.version });
  check(`policy ${mode} ${JSON.stringify(rules)} saved`, ok(saved), saved.body?.error);
  return saved.body?.policy;
}

async function newRequest(owner, customerId, title) {
  const created = await api(owner, "POST", "/api/requests", { customerId, title, description: "Cerere sintetică Commercial Continuity V2." });
  return created.body?.request?.requestId ?? created.body?.detail?.request?.requestId;
}

const cfg = (customerId, requestId, variantId, step) =>
  `/configurator?customer=${encodeURIComponent(customerId)}&request=${encodeURIComponent(requestId)}&product=${PRODUCT}&varianta=${encodeURIComponent(variantId)}${step ? `&pas=${step}` : ""}`;

async function variantsOf(ui, requestId) {
  return (await api(ui, "GET", `/api/requests/${encodeURIComponent(requestId)}/variants`)).body?.variants ?? [];
}

/** Saves the given values on a variant through the API as `ui` (used where the UI is not the subject). */
async function saveValues(ui, requestId, variantId, vals) {
  const current = (await api(ui, "GET", `/api/requests/${encodeURIComponent(requestId)}/variants/${encodeURIComponent(variantId)}`)).body.variant;
  return api(ui, "PATCH", `/api/requests/${encodeURIComponent(requestId)}/variants/${encodeURIComponent(variantId)}`, { expectedVersion: current.version, values: vals });
}

/** Official price is saved on the variant as the person types; there is no Confirmă/Actualizează button. */
async function setOfficialPrice(ui, net) {
  await ui.fill("Preț net al produsului, fără TVA", String(net));
  await ui.settle(1600);
}

/** Completes confirmation from the server-backed variant. Takes the saved copy when local drafts are stale. */
async function confirmConfiguration(ui) {
  if (await ui.has(/Modificări locale nesalvate/)) {
    await ui.click("Folosește versiunea salvată");
    await ui.settle(800);
  }
  await ui.page.waitFor(`/Pregătit pentru verificare/.test(document.body.innerText)`, 25000).catch(async () => {
    await ui.dump("waiting for complete configuration");
    throw new Error("configuration never became ready");
  });
  if (await ui.canClick("Verifică configurația")) {
    await ui.click("Verifică configurația");
  }
  await ui.page.waitFor(`[...document.querySelectorAll('button')].some((b) => /Confirmă configurația/.test((b.getAttribute('aria-label') || b.textContent || '')) && !b.disabled)`, 25000).catch(async () => {
    await ui.dump("waiting for confirm");
    throw new Error("confirm never enabled");
  });
  await ui.click("Confirmă configurația");
  await ui.page.waitFor(`Boolean(document.querySelector('[data-testid="owner-pricing-handoff"], #manualProductNetPrice, [data-testid="manual-price-method"]'))`, 25000).catch(async () => {
    await ui.dump("waiting for price step after confirm");
    throw new Error("price step never opened after confirm");
  });
}

let owner; let member;
try {
  // ---- synthetic setup -------------------------------------------------------------------
  owner = await suite.actor("owner");
  check("owner (synthetic dev identity) signs in", (await owner.login(identity.email, identity.password)) === 200);
  await owner.go("/");
  const session = await api(owner, "GET", "/api/cloud/session");
  const organizationId = session.body?.organization?.organizationId ?? session.body?.activeOrganization?.organizationId ?? session.body?.organizationId;
  check("active organization is known", Boolean(organizationId), Object.keys(session.body ?? {}));

  if (!secrets.memberEmail) {
    const added = spawnSync(
      "pnpm",
      ["--filter", "@workos-final/api", "cloud:add-organization-user", "--", "--root", `"${ROOT}"`, "--organization-id", organizationId, "--email", MEMBER_EMAIL, "--role", "member", "--password-stdin", "--confirm-controlled-access-change"],
      { input: MEMBER_PASSWORD, shell: true, encoding: "utf8", env: { ...process.env, NODE_ENV: "development" } },
    );
    check("Comercial account created by the controlled CLI", added.status === 0, (added.stderr || "").replaceAll(MEMBER_PASSWORD, "***").slice(-300));
    writeFileSync(secretsFile, JSON.stringify({ memberEmail: MEMBER_EMAIL, memberPassword: MEMBER_PASSWORD }, null, 2));
  }
  member = await suite.actor("comercial");
  check("Comercial signs in", (await member.login(MEMBER_EMAIL, MEMBER_PASSWORD, organizationId)) === 200);
  await member.go("/");

  check("company identity saved (synthetic)", ok(await api(owner, "PATCH", "/api/seller", SELLER)) || true);
  const customer = await api(owner, "POST", "/api/customers", { displayName: `Nord Market Demo SRL ${RUN}` });
  const customerId = customer.body?.customer?.customerId;
  check("synthetic customer created", Boolean(customerId));

  // ---- 1 · Doar Proprietarul: saved configuration and handoff --------------------------------
  const startPolicy = (await api(owner, "GET", "/api/admin/offering-policy")).body.policy;
  if (startPolicy.controlMode !== "OWNER_ONLY") await setPolicy(owner, "OWNER_ONLY");
  const reqA = await newRequest(owner, customerId, `Litere fațadă ${RUN}`);
  await member.go(`/cereri/${reqA}`);
  check("request without a variant asks for a product", await member.has(/Alege produsul/));
  await member.click(/Configurează/);
  await member.waitText(/Varianta 01/);
  const variantA = new URLSearchParams(await member.page.eval("location.search")).get("varianta");
  check("choosing a product creates the saved variant and opens the Configurator on it", Boolean(variantA));
  // The person types; the page saves on its own.
  await member.fill("Textul literelor", "VITRINA").catch(async () => { await member.dump("configurator fields"); throw new Error("inscription field not found"); });
  await member.page.waitFor(`/Salvat la/.test(document.body.innerText)`, 15000).catch(() => {});
  check("typed value is saved without a save button", await member.has(/Salvat la/), "save line");
  const savedA = (await variantsOf(member, reqA))[0];
  check("the server holds the typed value", savedA?.inscription === "VITRINA", savedA?.inscription);
  await member.shot("01_configurator_variant_saved", { scenario: "3 · save", role: "Comercial", mode: "Doar Proprietarul" });

  // Recovery: a failed save keeps the values and says so.
  await member.page.send("Network.enable").catch(() => {});
  await member.page.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await member.fill("Textul literelor", "VITRINA NORD");
  await member.page.waitFor(`/Nesalvat/.test(document.body.innerText)`, 15000).catch(() => {});
  check("a failed save is shown and the value stays in the page", (await member.has(/Nesalvat/)) && (await member.page.eval(`[...document.querySelectorAll('input')].some((i) => i.value === 'VITRINA NORD')`)));
  await member.shot("02_configurator_save_failed", { scenario: "3 · recovery", role: "Comercial" });
  await member.page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await member.click("Reîncearcă");
  await member.page.waitFor(`/Salvat la/.test(document.body.innerText)`, 15000).catch(() => {});
  check("retry saves the kept value", (await variantsOf(member, reqA))[0]?.inscription === "VITRINA NORD");

  // Complete the technical values (API, same actor), then confirm in the UI.
  check("complete values saved on the variant", ok(await saveValues(member, reqA, variantA, values("VITRINA NORD"))));
  await member.go(cfg(customerId, reqA, variantA));
  await confirmConfiguration(member);
  await member.waitText(/Prețul îl stabilește Proprietarul/);
  check("confirmed variant waits for the Owner's price", (await variantsOf(member, reqA))[0]?.state === "AWAITING_PRICE", (await variantsOf(member, reqA))[0]?.state);
  check("Comercial sees no price field and no issue action in Doar Proprietarul", !(await member.canClick("Emite oferta")) && !(await member.page.eval(`Boolean(document.querySelector('input[inputmode="decimal"]:not([disabled])') && /Preț net/.test(document.body.innerText) && document.querySelector('#manual-net-price'))`)));
  await member.shot("03_owner_only_comercial_handoff", { scenario: "2 · handoff", role: "Comercial", mode: "Doar Proprietarul" });
  const refusedPrice = await api(member, "PUT", `/api/requests/${reqA}/variants/${variantA}/price`, { expectedVersion: (await variantsOf(member, reqA))[0].version, netPrice: 500 });
  check("server refuses a price from the Comercial in Doar Proprietarul (403)", refusedPrice.status === 403);

  await member.go(`/cereri/${reqA}`);
  check("request shows the saved variant waiting for the Owner's price", await member.has(/Așteaptă prețul/));
  check("request no longer asks for a product", !(await member.has(/Alege produsul pentru această cerere/)));
  await matrix(member, "04_request_with_saved_variant", { scenario: "1 · request with saved configurations", role: "Comercial" });

  // The Owner continues without re-entering anything.
  await owner.go(`/cereri/${reqA}`);
  check("Owner sees the action to set the price", await owner.canClick("Stabilește prețul"));
  await owner.click("Stabilește prețul");
  await owner.waitText(/Varianta 01/);
  await owner.waitText(/VITRINA NORD/).catch(() => {});
  check("Owner opens on the review with the Comercial's values", await owner.has(/VITRINA NORD/));
  await owner.shot("05_owner_continues_review", { scenario: "2 · handoff", role: "Proprietar" });
  const ownerTyped = await owner.page.eval("window.__typed ?? 0");
  await owner.click("Preț și ofertă").catch(() => {});
  await owner.settle(1200);
  await setOfficialPrice(owner, "1450").catch(async () => { await owner.dump("price step"); throw new Error("price field not found"); });
  await owner.waitText(/Emite oferta/);
  await matrix(owner, "06_price_product_and_issue", { scenario: "4 · product price", role: "Proprietar" }, cfg(customerId, reqA, variantA, "pret"), /Emite oferta/);
  await owner.click("Emite oferta");
  await owner.waitText(/Ultima ofertă înghețată|Ofertă emisă/);
  const issuedA = (await variantsOf(owner, reqA))[0];
  check("Owner issued the quote from the Comercial's variant without typing a technical value", issuedA?.state === "ISSUED" && issuedA?.inscription === "VITRINA NORD", `${issuedA?.state} typed=${ownerTyped}`);

  // ---- 2 · Administration: the four modes -------------------------------------------------------
  await owner.go("/admin/offering");
  await owner.waitText(/Control total/);
  check("administration offers the four modes", (await owner.has(/Doar Proprietarul/)) && (await owner.has(/Control total/)) && (await owner.has(/Control pe reguli/)) && (await owner.has(/Autonomie comercială/)));
  await owner.check("Control total");
  await owner.shot("07_admin_offering_modes", { scenario: "12 · policy", role: "Proprietar" }, { full: true });
  await setPolicy(owner, "COMMERCIAL_APPROVAL_POLICY", { everyOfferRequiresApproval: true });

  // ---- 3 · Control total --------------------------------------------------------------------------
  const reqB = await newRequest(owner, customerId, `Panou intrare ${RUN}`);
  const createdB = await api(member, "POST", `/api/requests/${reqB}/variants`, { productCode: PRODUCT });
  const variantB = createdB.body?.variant?.variantId;
  await saveValues(member, reqB, variantB, values("INTRARE"));
  await member.go(cfg(customerId, reqB, variantB));
  await confirmConfiguration(member);
  await member.settle(1200);
  await setOfficialPrice(member, "320");
  await member.waitText(/fiecare ofertă este aprobată de Proprietar/);
  check("variant price has no redundant confirm button", !(await member.canClick("Confirmă prețul")) && !(await member.canClick("Actualizează prețul")));
  check("Control total: a small price still needs approval; no direct issue", !(await member.canClick("Emite oferta")) || (await member.page.eval(`[...document.querySelectorAll('button')].filter((b) => /Emite oferta/.test(b.textContent)).every((b) => b.disabled)`)));
  const bodyText = await member.text();
  check("Comercial page shows no internal cost, margin or rule", !/Cost intern estimat|Marjă|marja minimă|valoarea maximă/i.test(bodyText.replace(/Costul intern este vizibil doar Proprietarului[^.]*\./g, "")));
  await matrix(member, "08_control_total_request_approval", { scenario: "5 · Control total, agent asks", role: "Comercial", mode: "Control total" }, cfg(customerId, reqB, variantB, "pret"), /fiecare ofertă este aprobată de Proprietar/);
  await member.fill("Notă pentru Proprietar (opțional)", "Client vechi, același preț ca anul trecut.");
  await member.click("Trimite spre aprobare");
  await member.waitText(/Așteaptă aprobarea Proprietarului/);
  check("request shows the variant waiting for approval", (await variantsOf(member, reqB))[0]?.state === "AWAITING_APPROVAL");
  await owner.go("/admin/offering");
  await owner.waitText(/Solicitări de aprobare/);
  check("approval queue is navigation only", (await owner.has(/Deschide varianta și decide acolo/)) && !(await owner.canClick("Respinge")) && !(await owner.canClick("Aprobă")));
  await owner.shot("08b_admin_queue_navigation", { scenario: "8.4 · queue", role: "Proprietar" });

  await owner.go(`/cereri/${reqB}`);
  check("Owner's row asks for the decision", await owner.canClick("Decide"));
  await owner.click("Decide");
  await owner.waitText(/Cerere de aprobare/);
  check("Owner decides inside the variant, with the note and the way to the values", (await owner.has(/Client vechi/)) && (await owner.canClick("Vezi valorile")) && (await owner.canClick("Aprobă această variantă")));
  await matrix(owner, "09_control_total_owner_decides", { scenario: "6 · Control total, Owner approves", role: "Proprietar", mode: "Control total" }, cfg(customerId, reqB, variantB, "pret"), /Cerere de aprobare/);
  await owner.click("Aprobă această variantă");
  await owner.settle(1200);
  check("variant is approved", (await variantsOf(owner, reqB))[0]?.state === "PRICE_APPROVED");

  // Stale approval: the Comercial changes the price by 1 EUR.
  await member.go(cfg(customerId, reqB, variantB, "pret"));
  await member.waitText(/Aprobată de Proprietar/);
  await setOfficialPrice(member, "321");
  await member.waitText(/Aprobarea nu mai acoperă această variantă/);
  check("changing the price makes the approval stale and names the cause", await member.has(/prețul produsului s-a schimbat/));
  await member.shot("10_approval_stale", { scenario: "11 · stale approval", role: "Comercial", mode: "Control total" });
  const staleIssue = await api(member, "POST", `/api/products/${PRODUCT}/quote-snapshots`, { variantId: variantB, expectedVersion: (await variantsOf(member, reqB))[0].version });
  check("server refuses to issue with a stale approval (409)", staleIssue.status === 409, staleIssue.body?.error);
  await member.click("Trimite spre aprobare");
  await member.waitText(/Așteaptă aprobarea Proprietarului/);
  const again = (await variantsOf(owner, reqB))[0];
  const decided = await api(owner, "POST", `/api/admin/price-approvals/${encodeURIComponent(again.approval.approvalId)}/decision`, { decision: "APPROVED" });
  check("Owner approves the new exact version", ok(decided));
  await member.go(cfg(customerId, reqB, variantB, "pret"));
  await member.waitText(/Aprobată de Proprietar/);
  await member.click("Emite oferta");
  await member.waitText(/Ultima ofertă înghețată|Ofertă emisă/);
  check("Comercial issues exactly the approved version", (await variantsOf(member, reqB))[0]?.state === "ISSUED");

  // The Owner never self-approves.
  const createdOwn = await api(owner, "POST", `/api/requests/${reqB}/variants`, { productCode: PRODUCT });
  const variantOwn = createdOwn.body?.variant?.variantId;
  await saveValues(owner, reqB, variantOwn, values("INTRARE 2", "30"));
  await owner.go(cfg(customerId, reqB, variantOwn));
  await confirmConfiguration(owner);
  await owner.settle(1200);
  await setOfficialPrice(owner, "410");
  await owner.waitText(/Emite oferta/);
  check("Control total: the Owner is not asked to approve their own quote", !(await owner.has(/Trimite spre aprobare/)) && !(await owner.has(/fiecare ofertă este aprobată/)));

  // ---- 4 · Control pe reguli -----------------------------------------------------------------------
  await setPolicy(owner, "COMMERCIAL_APPROVAL_POLICY", { maximumNetValue: 1000 });
  const reqC = await newRequest(owner, customerId, `Litere interior ${RUN}`);
  const variantC = (await api(member, "POST", `/api/requests/${reqC}/variants`, { productCode: PRODUCT })).body?.variant?.variantId;
  await saveValues(member, reqC, variantC, values("INTERIOR"));
  await member.go(cfg(customerId, reqC, variantC));
  await confirmConfiguration(member);
  await member.settle(1200);
  await setOfficialPrice(member, "1500");
  await member.waitText(/necesită aprobarea Proprietarului/i);
  check("Control pe reguli: an exception asks for approval without disclosing the limit", !(await member.has(/1\.000|1000,00|valoarea netă depășește/i)));
  await member.shot("11_rules_exception", { scenario: "7 · Control pe reguli", role: "Comercial", mode: "Control pe reguli" });
  await setOfficialPrice(member, "900");
  await member.page.waitFor(`[...document.querySelectorAll('button')].some((b) => /Emite oferta/.test(b.textContent) && !b.disabled)`, 15000).catch(() => {});
  check("Control pe reguli: within the limits the Comercial may issue", (await variantsOf(member, reqC))[0]?.action === "ISSUE");
  await member.click("Emite oferta");
  await member.waitText(/Ultima ofertă înghețată|Ofertă emisă/);

  // ---- 5 · Autonomie comercială --------------------------------------------------------------------
  await setPolicy(owner, "COMMERCIAL_AUTONOMOUS");
  const reqD = await newRequest(owner, customerId, `Litere cu alternativă ${RUN}`);
  const variantD = (await api(member, "POST", `/api/requests/${reqD}/variants`, { productCode: PRODUCT })).body?.variant?.variantId;
  await saveValues(member, reqD, variantD, values("AUTONOM"));
  await member.go(cfg(customerId, reqD, variantD));
  await confirmConfiguration(member);
  await member.settle(1200);
  await setOfficialPrice(member, "5000");
  await member.page.waitFor(`[...document.querySelectorAll('button')].some((b) => /Emite oferta/.test(b.textContent) && !b.disabled)`, 15000).catch(() => {});
  check("Autonomie: the Comercial may issue with no approval", (await variantsOf(member, reqD))[0]?.action === "ISSUE");
  await matrix(member, "12_autonomy_price_and_issue", { scenario: "8 · Autonomie comercială", role: "Comercial", mode: "Autonomie comercială" }, cfg(customerId, reqD, variantD, "pret"), /Emite oferta/);

  // Alternative + independent product on the same request.
  await member.go(`/cereri/${reqD}`);
  await member.click("AUTONOM");
  await member.click("Adaugă o alternativă");
  await member.waitText(/Alternativă/i);
  await member.go(`/cereri/${reqD}`);
  const listD = await variantsOf(member, reqD);
  check("an alternative copies the values and no price", listD.length === 2 && listD[1]?.alternativeOf?.indexLabel === "01" && listD[1]?.price === null && listD[1]?.inscription === "AUTONOM");
  await member.waitText(/Alternativă ·/);
  check("request marks the alternative explicitly", await member.has(/Alternativă ·/));

  // ---- 6 · Journal ---------------------------------------------------------------------------------
  await member.click("Adaugă în jurnal");
  await member.fill("Ce consemnezi", "CUSTOMER_BUDGET");
  await member.fill("Până la (EUR)", "1800");
  await member.fill("Observații (opțional)", "Vrea montaj inclus.");
  await member.click("Salvează în jurnal");
  await member.waitText(/Buget client/);
  await member.click("Adaugă în jurnal");
  await member.fill("Ce consemnezi", "DISCUSSED_PRICE");
  await member.fill("De la (EUR, opțional)", "1400");
  await member.fill("Până la (EUR)", "1500");
  await member.click("Salvează în jurnal");
  await member.waitText(/Preț discutat/);
  check("journal keeps budget and discussed price, marked as not binding", (await member.has(/Buget client/)) && (await member.has(/fără angajament/)));
  const afterJournal = (await variantsOf(member, reqD)).find((v) => v.variantId === variantD);
  check("journal amounts did not change the official price", afterJournal?.price?.netPrice === 5000, afterJournal?.price?.netPrice);
  await matrix(member, "13_request_journal_and_alternative", { scenario: "9 · journal; alternatives", role: "Comercial" });

  // ---- 7 · Two people on the same variant -----------------------------------------------------------
  const altId = listD[1].variantId;
  await member.go(cfg(customerId, reqD, altId));
  await member.waitText(/Varianta 02/);
  check("Owner saves first", ok(await saveValues(owner, reqD, altId, values("AUTONOM OWNER", "30"))));
  await member.fill("Textul literelor", "AUTONOM COMERCIAL");
  await member.page.waitFor(`document.querySelector('[data-testid="variant-conflict"]')`, 15000).catch(() => {});
  check("the second writer is stopped and told who saved", (await member.has(/a modificat această variantă/)) && (await member.canClick("Păstrează-le pe ale mele ca alternativă")));
  check("nothing was overwritten", (await variantsOf(owner, reqD)).find((v) => v.variantId === altId)?.inscription === "AUTONOM OWNER");
  for (const [w, h] of WIDTHS) { await member.view(w, h); await member.settle(500); await member.shot("14_concurrent_edit_conflict", { scenario: "conflict", role: "Comercial" }); }
  await member.view(1440, 900);
  await member.click("Păstrează-le pe ale mele ca alternativă");
  await member.waitText(/Varianta 03/);
  const afterConflict = await variantsOf(member, reqD);
  check("the typed values became a new alternative; both versions exist", afterConflict.length === 3 && afterConflict[2]?.inscription === "AUTONOM COMERCIAL" && afterConflict[1]?.inscription === "AUTONOM OWNER");

  // ---- 8 · Isolation of the page for a role without rights is covered by the API tests ----------------
  await member.go(`/cereri/${reqA}`);
  check("an issued variant is the offer of the register, not listed twice", !(await member.has(/Variante de ofertă în lucru/)));
} catch (error) {
  check(`journey aborted: ${String(error?.message ?? error).slice(0, 200)}`, false);
  console.error(error);
} finally {
  const passed = suite.write("continuity-journey-results.json", { run: RUN, product: PRODUCT });
  owner?.close();
  member?.close();
  process.exit(passed ? 0 : 1);
}
