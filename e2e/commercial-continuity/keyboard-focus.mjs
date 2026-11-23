// Commercial Continuity V2 · keyboard Tab focus evidence (not programmatic .focus()).
// Usage: node e2e/commercial-continuity/keyboard-focus.mjs --base URL --root DIR --evidence DIR
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createSuite, sleep } from "../pilot/ui.mjs";

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const BASE = arg("base");
const ROOT = arg("root");
const EVIDENCE = arg("evidence");
const CHROME = arg("chrome") ?? process.env.WORKOS_E2E_CHROME ?? `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1248/chrome-win64/chrome.exe`;
if (!BASE || !ROOT || !EVIDENCE) { console.error("usage: --base URL --root DIR --evidence DIR"); process.exit(2); }
mkdirSync(EVIDENCE, { recursive: true });

const identity = JSON.parse(readFileSync(`${ROOT}/.dev-identity.json`, "utf8"));
const PRODUCT = "PRD-LETTERS-FRONTLIT-PLEXI-AL06";
const SELLER = {
  legalName: "FIRMA DEMONSTRATIVĂ S.R.L.", brand: "ATELIER DEMONSTRATIV", fiscalId: "DEMO-CIF-0001",
  tradeRegister: "DEMO-REG-0001", address: "Strada Exemplu nr. 1", locality: "Localitate Demo",
  iban: "RO34DEMO0000000000000001", bank: "BANCA DEMONSTRATIVĂ",
};
const values = (inscription) => ({
  "root.inscription": inscription, "face.finish": "none", "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60", "volume.finish": "none", "volume.confirmedPerimeterMm": 12500,
});

const suite = createSuite({
  base: BASE,
  evidence: EVIDENCE,
  chrome: CHROME,
  profiles: `${ROOT}/.e2e-profiles-keyboard-final`,
  secrets: () => [identity.password],
});
const { check } = suite;
const RUN = Date.now().toString(36);
const quoteHref = (id) => `/oferte/produs/${encodeURIComponent(PRODUCT)}/${encodeURIComponent(id)}`;
const cfg = (customerId, requestId, variantId) =>
  `/configurator?customer=${encodeURIComponent(customerId)}&request=${encodeURIComponent(requestId)}&product=${PRODUCT}&varianta=${encodeURIComponent(variantId)}&pas=pret`;

async function api(ui, method, path, body) {
  return ui.api(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const ok = (r) => r.status >= 200 && r.status < 300;

async function tab(ui, times = 1) {
  for (let i = 0; i < times; i += 1) {
    await ui.page.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9,
    });
    await ui.page.send("Input.dispatchKeyEvent", {
      type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9,
    });
    await sleep(40);
  }
}

function probeExpr() {
  return `(() => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return { ok: false, reason: "no-active" };
    const hit = el.classList?.contains("hit") ? el : el.closest?.(".hit");
    const ring = getComputedStyle(hit || el);
    const outlineOn = ring.outlineStyle !== "none" && parseFloat(ring.outlineWidth || "0") > 0;
    const shadowOn = Boolean(ring.boxShadow) && ring.boxShadow !== "none";
    const focusVisible = typeof el.matches === "function" && el.matches(":focus-visible");
    return {
      ok: focusVisible && (outlineOn || shadowOn),
      tag: el.tagName,
      className: String(el.className || "").slice(0, 80),
      text: (el.getAttribute("aria-label") || el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 90),
      testId: el.getAttribute("data-testid") || (hit && hit.getAttribute("data-testid")) || null,
      focusVisible,
      outlineStyle: ring.outlineStyle,
      outlineWidth: ring.outlineWidth,
      outlineColor: ring.outlineColor,
      boxShadow: ring.boxShadow,
    };
  })()`;
}

async function tabUntil(ui, re, max = 50) {
  await ui.page.eval(`(() => { const b = document.body; b.setAttribute("tabindex", "-1"); b.focus(); })()`);
  for (let i = 0; i < max; i += 1) {
    await tab(ui, 1);
    const probe = await ui.page.eval(probeExpr());
    if (probe?.text && re.test(probe.text)) return { ...probe, tabs: i + 1 };
  }
  return { ok: false, reason: "not-reached", tabs: max, last: await ui.page.eval(probeExpr()) };
}

async function programmatic(ui, re) {
  return ui.page.eval(`(() => {
    const re = ${re.toString()};
    const btn = [...document.querySelectorAll("button, a, [role=button], input, textarea, [role=radio]")].find((e) =>
      re.test((e.getAttribute("aria-label") || e.textContent || "").replace(/\\s+/g, " "))
    );
    if (!btn) return { found: false };
    btn.focus();
    const hit = btn.classList.contains("hit") ? btn : btn.closest(".hit");
    const ring = getComputedStyle(hit || btn);
    return {
      found: true,
      focusVisible: typeof btn.matches === "function" && btn.matches(":focus-visible"),
      outlineStyle: ring.outlineStyle,
      outlineWidth: ring.outlineWidth,
      text: (btn.getAttribute("aria-label") || btn.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 90),
    };
  })()`);
}

let owner;
try {
  owner = await suite.actor("owner");
  check("owner signs in", (await owner.login(identity.email, identity.password)) === 200);
  await owner.go("/");
  const session = await api(owner, "GET", "/api/cloud/session");
  const organizationId = session.body?.organization?.organizationId ?? session.body?.activeOrganization?.organizationId ?? session.body?.organizationId;
  check("active organization is known", Boolean(organizationId));
  await api(owner, "PATCH", "/api/seller", SELLER);
  const customer = await api(owner, "POST", "/api/customers", { displayName: `Focus ${RUN}` });
  const customerId = customer.body?.customer?.customerId;
  const createdReq = await api(owner, "POST", "/api/requests", { customerId, title: `Focus ${RUN}`, description: "Keyboard." });
  const requestId = createdReq.body?.request?.requestId ?? createdReq.body?.detail?.request?.requestId;
  check("focus request created", Boolean(requestId));

  const admin = await api(owner, "GET", "/api/resources-admin");
  for (const row of admin.body?.costEvidence ?? []) {
    if (!row.evidenceRowId || typeof row.amount !== "number") continue;
    await api(owner, "PATCH", `/api/resources-admin/cost-evidence/${encodeURIComponent(row.evidenceRowId)}`, {
      amount: row.amount, note: "Confirmat focus montaj",
    });
  }
  await api(owner, "PATCH", "/api/operational-services/SITE_INSTALLATION", { offerMode: "INTERNAL" });
  await api(owner, "PATCH", `/api/requests/${encodeURIComponent(requestId)}`, { optionalScopeIds: ["SITE_INSTALLATION"] });
  await api(owner, "PATCH", `/api/requests/${encodeURIComponent(requestId)}/installation-facts`, {
    expectedVersion: 0, street: "Strada Fabricii 10", city: "București", measurementStatus: "OFFICE_MEASURED",
    facadeType: "CONCRETE", fixingMethod: "MECHANICAL_ANCHOR", siteElectrical: "NOT_APPLICABLE", crewSize: 3, plannedDurationHours: 4,
  });
  await api(owner, "POST", "/api/resources-admin/cost-evidence", { resourceId: "LAB-SITE-INSTALL", amount: 25, note: "Tarif sintetic montaj." });
  await api(owner, "PATCH", `/api/requests/${encodeURIComponent(requestId)}/installation-price`, { netPrice: 200 });

  async function issue(inscription, netPrice) {
    const created = await api(owner, "POST", `/api/requests/${encodeURIComponent(requestId)}/variants`, { productCode: PRODUCT });
    const variantId = created.body?.variant?.variantId;
    const path = `/api/requests/${encodeURIComponent(requestId)}/variants/${encodeURIComponent(variantId)}`;
    await api(owner, "PATCH", path, { expectedVersion: created.body.variant.version, values: values(inscription) });
    const preview = await api(owner, "POST", `/api/products/${PRODUCT}/preview`, { values: values(inscription) });
    const current = (await api(owner, "GET", path)).body.variant;
    const confirmed = await api(owner, "POST", `/api/products/${PRODUCT}/confirm`, {
      variantId, expectedVersion: current.version, reviewId: preview.body.reviewId,
    });
    const priced = await api(owner, "PUT", `${path}/price`, { expectedVersion: confirmed.body.variant.version, netPrice });
    const frozen = await api(owner, "POST", `/api/products/${PRODUCT}/quote-snapshots`, {
      variantId, expectedVersion: priced.body.variant.version,
    });
    return { variantId, quote: frozen.body?.quoteSnapshot };
  }

  const first = await issue("FOCUS1", 1000);
  const second = await issue("FOCUS2", 800);
  check("two quotes issued for focus", Boolean(first.quote?.quoteSnapshotId && second.quote?.quoteSnapshotId));
  const firstOrder = await api(owner, "POST", `/api/products/${PRODUCT}/quote-snapshots/${encodeURIComponent(first.quote.quoteSnapshotId)}/confirm-order`);
  check("holder order accepted", ok(firstOrder));

  // Light · quote primary action via real Tab.
  await owner.view(1440, 900, "light");
  await owner.go(quoteHref(second.quote.quoteSnapshotId));
  await owner.waitText(/Confirmă comanda|Ofertă emisă/);
  const progLight = await programmatic(owner, /Confirmă comanda/);
  check("programmatic focus on Confirmă is typically not :focus-visible", progLight.found && progLight.focusVisible === false, progLight);
  const tabConfirmLight = await tabUntil(owner, /Confirmă comanda|Sari la conținut/);
  const skipOrConfirm = tabConfirmLight;
  if (skipOrConfirm?.text && /Sari la conținut/i.test(skipOrConfirm.text)) {
    check("skip link shows a visible Tab ring (Light)", Boolean(skipOrConfirm.ok), skipOrConfirm);
    await owner.shot("kb_skip_link_light", { scenario: "keyboard Tab", role: "Proprietar" });
  }
  const confirmLight = /Confirmă comanda/.test(skipOrConfirm?.text || "")
    ? skipOrConfirm
    : await tabUntil(owner, /Confirmă comanda/);
  check("Tab reaches Confirmă comanda with a visible ring (Light)", Boolean(confirmLight.ok && /Confirmă/.test(confirmLight.text || "")), confirmLight);
  await owner.shot("kb_confirm_tab_light", { scenario: "keyboard Tab", role: "Proprietar" });

  if (await owner.canClick("Confirmă comanda")) await owner.click("Confirmă comanda");
  await owner.settle(500);
  const modalLight = await tabUntil(owner, /Da, confirm comanda|Renunță|Montaj comun/);
  check("Tab reaches confirmation or installation decision (Light)", Boolean(modalLight.ok), modalLight);
  await owner.shot("kb_confirm_modal_light", { scenario: "keyboard Tab modal", role: "Proprietar" });

  if (await owner.has(/Montaj comun · o singură dată/) === false && await owner.canClick("Da, confirm comanda")) {
    await owner.click("Da, confirm comanda");
    await owner.settle(800);
  }
  if (await owner.has(/Montaj comun · o singură dată/)) {
    const installLight = await tabUntil(owner, /Montaj comun · o singură dată|Acceptă cu montaj separat/);
    check("Tab reaches installation decision (Light)", Boolean(installLight.ok), installLight);
    await owner.shot("kb_install_decision_light", { scenario: "keyboard Tab installation", role: "Proprietar" });
  } else {
    check("installation decision controls visible after confirm", false, await owner.page.eval("document.body.innerText.slice(0,400)"));
  }

  // Dark · same quote decision surface.
  await owner.view(1440, 900, "dark");
  await owner.go(quoteHref(second.quote.quoteSnapshotId));
  await owner.waitText(/Confirmă comanda|Montaj comun|Ofertă emisă/);
  if (await owner.canClick("Confirmă comanda")) {
    const confirmDark = await tabUntil(owner, /Confirmă comanda|Sari la conținut/);
    const confirmDarkHit = /Confirmă comanda/.test(confirmDark?.text || "") ? confirmDark : await tabUntil(owner, /Confirmă comanda/);
    check("Tab reaches Confirmă comanda with a visible ring (Dark)", Boolean(confirmDarkHit.ok), confirmDarkHit);
    await owner.shot("kb_confirm_tab_dark", { scenario: "keyboard Tab", role: "Proprietar" });
    await owner.click("Confirmă comanda");
    await owner.settle(500);
  }
  if (await owner.has(/Montaj comun · o singură dată/)) {
    const installDark = await tabUntil(owner, /Montaj comun · o singură dată|Acceptă cu montaj separat/);
    check("Tab reaches installation decision (Dark)", Boolean(installDark.ok), installDark);
    await owner.shot("kb_install_decision_dark", { scenario: "keyboard Tab installation", role: "Proprietar" });
  } else if (await owner.has(/Da, confirm comanda/)) {
    const modalDark = await tabUntil(owner, /Da, confirm comanda|Renunță/);
    check("Tab reaches confirmation modal (Dark)", Boolean(modalDark.ok), modalDark);
    await owner.shot("kb_confirm_modal_dark", { scenario: "keyboard Tab modal", role: "Proprietar" });
  }

  // Approval mode radios.
  await owner.view(1440, 900, "light");
  await owner.go("/admin/offering");
  await owner.waitText(/Reguli de ofertare|Solicitări de aprobare/);
  const approvalLight = await tabUntil(owner, /Aprobare|Proprietarul|Comercial|Deschide varianta|Salvează/);
  check("Tab reaches an approval/policy control (Light)", Boolean(approvalLight.ok), approvalLight);
  await owner.shot("kb_approval_light", { scenario: "keyboard Tab approval", role: "Proprietar" });
  await owner.view(1440, 900, "dark");
  await owner.go("/admin/offering");
  await owner.waitText(/Reguli de ofertare|Solicitări de aprobare/);
  const approvalDark = await tabUntil(owner, /Aprobare|Proprietarul|Comercial|Deschide varianta|Salvează/);
  check("Tab reaches an approval/policy control (Dark)", Boolean(approvalDark.ok), approvalDark);
  await owner.shot("kb_approval_dark", { scenario: "keyboard Tab approval", role: "Proprietar" });

  // Mobile issue action.
  const issueReq = (await api(owner, "POST", "/api/requests", { customerId, title: `Emite focus ${RUN}`, description: "Mobile." })).body;
  const issueId = issueReq?.request?.requestId ?? issueReq?.detail?.request?.requestId;
  const pricedOnly = (await api(owner, "POST", `/api/requests/${encodeURIComponent(issueId)}/variants`, { productCode: PRODUCT })).body?.variant;
  const pricedPath = `/api/requests/${encodeURIComponent(issueId)}/variants/${encodeURIComponent(pricedOnly.variantId)}`;
  await api(owner, "PATCH", pricedPath, { expectedVersion: pricedOnly.version, values: values("MOBIL") });
  const pricedPreview = await api(owner, "POST", `/api/products/${PRODUCT}/preview`, { values: values("MOBIL") });
  const pricedNow = (await api(owner, "GET", pricedPath)).body.variant;
  const pricedConfirm = await api(owner, "POST", `/api/products/${PRODUCT}/confirm`, { variantId: pricedNow.variantId, expectedVersion: pricedNow.version, reviewId: pricedPreview.body.reviewId });
  await api(owner, "PUT", `${pricedPath}/price`, { expectedVersion: pricedConfirm.body.variant.version, netPrice: 900 });
  await owner.view(390, 844, "light");
  await owner.go(cfg(customerId, issueId, pricedOnly.variantId));
  await owner.waitText(/Emite oferta|Preț net/);
  const issueLight = await tabUntil(owner, /Emite oferta/);
  check("Tab reaches mobile issue action (Light 390)", Boolean(issueLight.ok), issueLight);
  await owner.shot("kb_mobile_issue_light", { scenario: "keyboard Tab mobile issue", role: "Proprietar" });
  await owner.view(390, 844, "dark");
  await owner.go(cfg(customerId, issueId, pricedOnly.variantId));
  await owner.waitText(/Emite oferta|Preț net/);
  const issueDark = await tabUntil(owner, /Emite oferta/);
  check("Tab reaches mobile issue action (Dark 390)", Boolean(issueDark.ok), issueDark);
  await owner.shot("kb_mobile_issue_dark", { scenario: "keyboard Tab mobile issue", role: "Proprietar" });

  const after = await owner.page.eval(`document.activeElement && document.activeElement !== document.body`);
  check("no focus loss after theme/viewport changes on issue action", Boolean(issueDark.ok || after));
} catch (error) {
  check(`keyboard evidence aborted: ${String(error?.message ?? error).slice(0, 240)}`, false);
  console.error(error);
} finally {
  const passed = suite.write("keyboard-focus-results.json", { run: RUN });
  owner?.close();
  process.exit(passed ? 0 : 1);
}
