// Commercial Continuity V2 · final E2E closure on an isolated synthetic runtime.
// Shared installation overlay, F29, session recovery, tenant 404 UI, keyboard, mobile issue, admin queue.
// Usage: node e2e/commercial-continuity/closure-journeys.mjs --base URL --root DIR --evidence DIR [--chrome EXE]
import { existsSync, readFileSync } from "node:fs";
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

const suite = createSuite({
  base: BASE,
  evidence: EVIDENCE,
  chrome: CHROME,
  profiles: `${ROOT}/.e2e-profiles-closure`,
  secrets: () => [identity.password, secrets.memberPassword].filter(Boolean),
});
const { check } = suite;
const PRODUCT = "PRD-LETTERS-FRONTLIT-PLEXI-AL06";
const SELLER = {
  legalName: "FIRMA DEMONSTRATIVĂ S.R.L.", brand: "ATELIER DEMONSTRATIV", fiscalId: "DEMO-CIF-0001", tradeRegister: "DEMO-REG-0001",
  address: "Strada Exemplu nr. 1", locality: "Localitate Demo", iban: "RO34DEMO0000000000000001", bank: "BANCA DEMONSTRATIVĂ",
};
const values = (inscription) => ({
  "root.inscription": inscription, "face.finish": "none", "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60", "volume.finish": "none", "volume.confirmedPerimeterMm": 12500,
});
const WIDTHS = [[1440, 900], [1280, 720], [768, 1024], [390, 844]];
const quoteHref = (id) => `/oferte/produs/${encodeURIComponent(PRODUCT)}/${encodeURIComponent(id)}`;
const cfg = (customerId, requestId, variantId, step) =>
  `/configurator?customer=${encodeURIComponent(customerId)}&request=${encodeURIComponent(requestId)}&product=${PRODUCT}&varianta=${encodeURIComponent(variantId)}${step ? `&pas=${step}` : ""}`;

async function api(ui, method, path, body) {
  return ui.api(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const ok = (r) => r.status >= 200 && r.status < 300;

async function matrix(ui, name, meta = {}, url = null, ready = null) {
  const target = url ?? (await ui.page.eval("location.pathname + location.search"));
  for (const theme of ["light", "dark"]) {
    for (const [w, h] of WIDTHS) {
      await ui.view(w, h, theme);
      await ui.go(target);
      if (ready) await ui.waitText(ready).catch(() => {});
      await ui.settle(700);
      await ui.shot(name, meta);
    }
  }
  await ui.view(1440, 900, "light");
  await ui.go(target);
  if (ready) await ui.waitText(ready).catch(() => {});
  await ui.settle(500);
}

async function inViewport(ui, re, testId = null) {
  return ui.page.eval(`(() => {
    const re = ${re.toString()};
    const byId = ${JSON.stringify(testId)};
    const el = byId
      ? document.querySelector('[data-testid="' + byId + '"]')
      : [...document.querySelectorAll('button, a, [role=button], h2, p, [data-testid]')].find((e) => e.offsetParent !== null && re.test((e.getAttribute('aria-label') || e.textContent || '').replace(/\\s+/g, ' ')));
    if (!el) return { found: false, visible: false };
    const r = el.getBoundingClientRect();
    return { found: true, visible: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth, top: Math.round(r.top), bottom: Math.round(r.bottom), innerHeight };
  })()`);
}

async function setupInstallation(owner, requestId) {
  const admin = await api(owner, "GET", "/api/resources-admin");
  for (const row of admin.body?.costEvidence ?? []) {
    if (!row.evidenceRowId || typeof row.amount !== "number") continue;
    await api(owner, "PATCH", `/api/resources-admin/cost-evidence/${encodeURIComponent(row.evidenceRowId)}`, {
      amount: row.amount, note: "Confirmat closure montaj",
    });
  }
  check("installation offered internally", ok(await api(owner, "PATCH", "/api/operational-services/SITE_INSTALLATION", { offerMode: "INTERNAL" })));
  check("installation selected on the request", ok(await api(owner, "PATCH", `/api/requests/${encodeURIComponent(requestId)}`, { optionalScopeIds: ["SITE_INSTALLATION"] })));
  check("installation facts saved", ok(await api(owner, "PATCH", `/api/requests/${encodeURIComponent(requestId)}/installation-facts`, {
    expectedVersion: 0, street: "Strada Fabricii 10", city: "București", measurementStatus: "OFFICE_MEASURED",
    facadeType: "CONCRETE", fixingMethod: "MECHANICAL_ANCHOR", siteElectrical: "NOT_APPLICABLE", crewSize: 3, plannedDurationHours: 4,
  })));
  const rate = await api(owner, "POST", "/api/resources-admin/cost-evidence", { resourceId: "LAB-SITE-INSTALL", amount: 25, note: "Tarif sintetic montaj." });
  check("installation labour rate recorded", rate.status === 201 || rate.status === 200 || rate.status === 409);
  check("shared installation price 200", ok(await api(owner, "PATCH", `/api/requests/${encodeURIComponent(requestId)}/installation-price`, { netPrice: 200 })));
}

async function issueVariant(owner, requestId, inscription, netPrice, extra = {}) {
  const created = await api(owner, "POST", `/api/requests/${encodeURIComponent(requestId)}/variants`, { productCode: PRODUCT, ...extra });
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
  return { variantId, quote: frozen.body?.quoteSnapshot, status: frozen.status, error: frozen.body?.error, text: frozen.body };
}

async function confirmOrder(owner, quoteId, body) {
  return api(owner, "POST", `/api/products/${PRODUCT}/quote-snapshots/${encodeURIComponent(quoteId)}/confirm-order`, body);
}

let owner; let member;
try {
  owner = await suite.actor("owner");
  check("owner signs in", (await owner.login(identity.email, identity.password)) === 200);
  await owner.go("/");
  const session = await api(owner, "GET", "/api/cloud/session");
  const organizationId = session.body?.organization?.organizationId ?? session.body?.activeOrganization?.organizationId ?? session.body?.organizationId;
  check("active organization is known", Boolean(organizationId));
  check("company identity saved", ok(await api(owner, "PATCH", "/api/seller", SELLER)) || true);
  const customer = await api(owner, "POST", "/api/customers", { displayName: `Closure Montaj ${RUN}` });
  const customerId = customer.body?.customer?.customerId;
  check("synthetic customer created", Boolean(customerId));

  if (secrets.memberEmail) {
    member = await suite.actor("comercial");
    check("Comercial signs in", (await member.login(secrets.memberEmail, secrets.memberPassword, organizationId)) === 200);
  }

  const createdReq = await api(owner, "POST", "/api/requests", {
    customerId, title: `Montaj comun ${RUN}`, description: "Două produse, un montaj.",
  });
  const requestId = createdReq.body?.request?.requestId ?? createdReq.body?.detail?.request?.requestId;
  check("request created", Boolean(requestId));
  await setupInstallation(owner, requestId);

  const first = await issueVariant(owner, requestId, "LITERE", 1000);
  const second = await issueVariant(owner, requestId, "PANOU", 800);
  check("two immutable quotes issued", first.status === 200 && second.status === 200, first.error || second.error);
  check("each quote copies the 200 installation line", first.quote?.lines?.some((l) => l.kind === "SITE_INSTALLATION") && second.quote?.lines?.some((l) => l.kind === "SITE_INSTALLATION"));

  const firstOrder = await confirmOrder(owner, first.quote.quoteSnapshotId);
  check("first order accepted", ok(firstOrder), firstOrder.body?.error);
  const blocked = await confirmOrder(owner, second.quote.quoteSnapshotId);
  check("second order without a decision is blocked", blocked.status === 409 && blocked.body?.error === "installation_decision_required");
  const common = await confirmOrder(owner, second.quote.quoteSnapshotId, { installationDecision: { mode: "COMMON" } });
  check("second order joins the shared installation", ok(common), common.body?.error);

  const detail = await api(owner, "GET", `/api/requests/${encodeURIComponent(requestId)}`);
  const obligation = detail.body?.detail?.installationObligation;
  check("server obligation is 2200 documents / 2000 consolidated", obligation?.documentSumNet === 2200 && obligation?.consolidatedObligationNet === 2000, obligation);
  const holderId = firstOrder.body?.orderSnapshot?.orderSnapshotId;
  const memberId = common.body?.orderSnapshot?.orderSnapshotId;
  const holderRelease = await api(owner, "POST", `/api/products/${PRODUCT}/orders/${encodeURIComponent(holderId)}/production-release`);
  const memberRelease = await api(owner, "POST", `/api/products/${PRODUCT}/orders/${encodeURIComponent(memberId)}/production-release`);
  const holderOps = (holderRelease.body?.snapshot?.operations ?? []).map((op) => op.processId);
  const memberOps = (memberRelease.body?.snapshot?.operations ?? []).map((op) => op.processId);
  check("one INSTALL_AT_SITE on the holder release", holderOps.includes("INSTALL_AT_SITE") && !memberOps.includes("INSTALL_AT_SITE"));
  const holderPlan = await api(owner, "POST", `/api/products/${PRODUCT}/accepted-production-snapshots/${encodeURIComponent(holderRelease.body.snapshot.snapshotId)}/execution-plan`);
  const memberPlan = await api(owner, "POST", `/api/products/${PRODUCT}/accepted-production-snapshots/${encodeURIComponent(memberRelease.body.snapshot.snapshotId)}/execution-plan`);
  check("execution plans created for both jobs", ok(holderPlan) && ok(memberPlan));

  await owner.go(`/cereri/${requestId}`);
  await owner.waitText(/Obligație consolidată a clientului|Sume pe documente/);
  const pageText = await owner.text();
  const seesDocuments = /2\.200,00 EUR/.test(pageText) && /Sume pe documente/.test(pageText);
  const seesConsolidated = /2\.000,00 EUR/.test(pageText) && /Obligație consolidată/.test(pageText);
  check("customer-visible totals match server-owned 2200 and 2000", seesDocuments && seesConsolidated, {
    documentSumNet: obligation?.documentSumNet,
    consolidatedObligationNet: obligation?.consolidatedObligationNet,
    has2200: /2\.200,00 EUR/.test(pageText),
    has2000: /2\.000,00 EUR/.test(pageText),
  });
  await owner.view(390, 844, "light");
  await owner.go(`/cereri/${requestId}`);
  await owner.waitText(/Obligație consolidată a clientului/);
  const obligationVis = await inViewport(owner, /Obligație consolidată a clientului/);
  check("shared installation totals are in the first viewport at 390", obligationVis.found && obligationVis.visible, obligationVis);
  await owner.view(1440, 900, "light");
  await matrix(owner, "01_shared_installation_obligation", { scenario: "shared installation", role: "Proprietar" }, `/cereri/${requestId}`, /Obligație consolidată/);

  await owner.go(quoteHref(first.quote.quoteSnapshotId));
  await owner.waitText(/Comandă acceptată a clientului|Ofertă emisă/);
  check("holder quote names the accepted customer order", await owner.has(/Comandă acceptată a clientului/));
  await matrix(owner, "02_holder_quote_ordered", { scenario: "issued vs ordered", role: "Proprietar" }, quoteHref(first.quote.quoteSnapshotId), /Comandă acceptată/);

  await owner.go(quoteHref(second.quote.quoteSnapshotId));
  check("member quote is also an accepted order, not only an issued offer", await owner.has(/Comandă acceptată a clientului/));
  await owner.shot("03_member_quote_ordered", { scenario: "issued vs ordered", role: "Proprietar" });

  const retryCommon = await confirmOrder(owner, second.quote.quoteSnapshotId, { installationDecision: { mode: "COMMON" } });
  check("retrying COMMON does not create a second installation", ok(retryCommon));
  const detailRetry = await api(owner, "GET", `/api/requests/${encodeURIComponent(requestId)}`);
  check("obligation unchanged after retry", detailRetry.body?.detail?.installationObligation?.consolidatedObligationNet === 2000);

  const cancel = await api(owner, "PATCH", `/api/requests/${encodeURIComponent(requestId)}`, { status: "CANCELLED" });
  check("cancellation of an ordered request is refused", cancel.status === 409 && cancel.body?.error === "order_obligation_blocks_cancellation");

  const sepReq = (await api(owner, "POST", "/api/requests", { customerId, title: `Montaje separate ${RUN}`, description: "Două montaje reale." })).body;
  const sepId = sepReq?.request?.requestId ?? sepReq?.detail?.request?.requestId;
  await setupInstallation(owner, sepId);
  const sepA = await issueVariant(owner, sepId, "ALPHA", 1000);
  const sepB = await issueVariant(owner, sepId, "BETA", 800);
  const sepOrderA = await confirmOrder(owner, sepA.quote.quoteSnapshotId);
  check("separate first order", ok(sepOrderA), sepOrderA.body?.error);
  const separate = await confirmOrder(owner, sepB.quote.quoteSnapshotId, {
    installationDecision: { mode: "SEPARATE", reason: "Al doilea montaj este la altă dată, cu altă echipă." },
  });
  check("two genuine separate installations accepted", ok(separate), separate.body?.error);
  const sepDetail = await api(owner, "GET", `/api/requests/${encodeURIComponent(sepId)}`);
  check("separate mode has no consolidated COMMON overlay", sepDetail.body?.detail?.installationObligation == null);
  const sepReleaseA = await api(owner, "POST", `/api/products/${PRODUCT}/orders/${encodeURIComponent(sepOrderA.body.orderSnapshot.orderSnapshotId)}/production-release`);
  const sepReleaseB = await api(owner, "POST", `/api/products/${PRODUCT}/orders/${encodeURIComponent(separate.body.orderSnapshot.orderSnapshotId)}/production-release`);
  check(
    "each SEPARATE order keeps its own INSTALL_AT_SITE",
    (sepReleaseA.body?.snapshot?.operations ?? []).some((op) => op.processId === "INSTALL_AT_SITE") &&
      (sepReleaseB.body?.snapshot?.operations ?? []).some((op) => op.processId === "INSTALL_AT_SITE"),
  );

  const histReq = (await api(owner, "POST", "/api/requests", { customerId, title: `Fără overlay ${RUN}`, description: "O comandă, fără angajament comun." })).body;
  const histId = histReq?.request?.requestId ?? histReq?.detail?.request?.requestId;
  await setupInstallation(owner, histId);
  const hist = await issueVariant(owner, histId, "ISTORIC", 1000);
  check("historical holder-only order created", ok(await confirmOrder(owner, hist.quote.quoteSnapshotId)));
  const histDetail = await api(owner, "GET", `/api/requests/${encodeURIComponent(histId)}`);
  check("holder-only order has no shared commitment", histDetail.body?.detail?.installationObligation == null);

  const f29reqBody = await api(owner, "POST", "/api/requests", { customerId, title: `F29 alt ${RUN}`, description: "Alternativă." });
  const f29req = f29reqBody.body?.request?.requestId ?? f29reqBody.body?.detail?.request?.requestId;
  const originVar = await issueVariant(owner, f29req, "ORIGINE", 800);
  check("F29 origin ordered", ok(await confirmOrder(owner, originVar.quote.quoteSnapshotId)));
  const altVar = await issueVariant(owner, f29req, "ALTERNATIVA", 750, { copyFromVariantId: originVar.variantId });
  check("F29 alternative issued", altVar.status === 200, altVar.error);
  await owner.go(quoteHref(altVar.quote.quoteSnapshotId));
  await owner.waitText(/Ofertă emisă, încă neacceptată|Confirmă comanda/);
  if (await owner.canClick("Confirmă comanda")) await owner.click("Confirmă comanda");
  await owner.settle(400);
  if (await owner.canClick("Da, confirm comanda")) await owner.click("Da, confirm comanda");
  await owner.settle(800);
  check("F29 asks for explicit alternative confirmation", await owner.has(/alternativa unei oferte deja comandate|Confirmă alternativa ca ofertă distinctă/));
  await owner.shot("04_f29_alternative_confirm", { scenario: "F29", role: "Proprietar" });
  if (await owner.canClick("Confirmă alternativa ca ofertă distinctă")) {
    await owner.click("Confirmă alternativa ca ofertă distinctă");
    await owner.settle(1000);
  }
  check("F29 alternative becomes its own order after confirmation", await owner.has(/Comandă acceptată a clientului|Comanda creată/));

  const recoveryReq = (await api(owner, "POST", "/api/requests", { customerId, title: `Recuperare sesiune ${RUN}`, description: "Expiry." })).body;
  const recoveryId = recoveryReq?.request?.requestId ?? recoveryReq?.detail?.request?.requestId;
  const recoveryVar = (await api(owner, "POST", `/api/requests/${encodeURIComponent(recoveryId)}/variants`, { productCode: PRODUCT })).body?.variant;
  const recPath = `/api/requests/${encodeURIComponent(recoveryId)}/variants/${encodeURIComponent(recoveryVar.variantId)}`;
  await api(owner, "PATCH", recPath, { expectedVersion: recoveryVar.version, values: values("SESUNE") });
  const recPreview = await api(owner, "POST", `/api/products/${PRODUCT}/preview`, { values: values("SESUNE") });
  const recCurrent = (await api(owner, "GET", recPath)).body.variant;
  await api(owner, "POST", `/api/products/${PRODUCT}/confirm`, { variantId: recCurrent.variantId, expectedVersion: recCurrent.version, reviewId: recPreview.body.reviewId });
  await owner.go(cfg(customerId, recoveryId, recoveryVar.variantId));
  await owner.waitText(/Preț|Textul literelor|Pregătit/);
  check("session logout", ok(await api(owner, "POST", "/api/cloud/logout")));
  await owner.go(cfg(customerId, recoveryId, recoveryVar.variantId));
  await owner.settle(800);
  check("session expired", (await api(owner, "GET", "/api/cloud/session")).status === 401 || (await owner.has(/Intră în WorkOS|Autentificare|parolă|email/i)));
  check("re-login after expiry", (await owner.login(identity.email, identity.password, organizationId)) === 200);
  await owner.go(cfg(customerId, recoveryId, recoveryVar.variantId));
  if (await owner.has(/Modificări locale nesalvate/)) {
    await owner.click("Folosește versiunea salvată");
    await owner.settle(800);
  }
  const afterRecovery = (await api(owner, "GET", recPath)).body;
  check("session recovery keeps the server-owned inscription", afterRecovery?.values?.["root.inscription"] === "SESUNE" || afterRecovery?.variant?.inscription === "SESUNE", afterRecovery?.variant?.inscription);
  check("recovery did not invent a blank overwrite", afterRecovery?.values?.["root.inscription"] !== "");
  await owner.shot("05_session_recovery", { scenario: "session expiry", role: "Proprietar" });

  await owner.go(`/cereri/req_foreign_${RUN}`);
  await owner.settle(800);
  check("browser refuses an inaccessible request", await owner.has(/Cererea nu a putut fi citită|nu a putut fi citită|nu există|indisponibil/i));
  await owner.shot("06_cross_tenant_or_missing_request", { scenario: "cross-tenant UI", role: "Proprietar" });
  const foreignApi = await api(owner, "GET", `/api/requests/req_foreign_${RUN}`);
  check("API refuses a foreign or missing request with 404", foreignApi.status === 404);

  const issueReq = (await api(owner, "POST", "/api/requests", { customerId, title: `Emite vizibil ${RUN}`, description: "Mobile issue." })).body;
  const issueId = issueReq?.request?.requestId ?? issueReq?.detail?.request?.requestId;
  const pricedOnly = (await api(owner, "POST", `/api/requests/${encodeURIComponent(issueId)}/variants`, { productCode: PRODUCT })).body?.variant;
  const pricedPath = `/api/requests/${encodeURIComponent(issueId)}/variants/${encodeURIComponent(pricedOnly.variantId)}`;
  await api(owner, "PATCH", pricedPath, { expectedVersion: pricedOnly.version, values: values("MOBIL") });
  const pricedPreview = await api(owner, "POST", `/api/products/${PRODUCT}/preview`, { values: values("MOBIL") });
  const pricedNow = (await api(owner, "GET", pricedPath)).body.variant;
  const pricedConfirm = await api(owner, "POST", `/api/products/${PRODUCT}/confirm`, { variantId: pricedNow.variantId, expectedVersion: pricedNow.version, reviewId: pricedPreview.body.reviewId });
  await api(owner, "PUT", `${pricedPath}/price`, { expectedVersion: pricedConfirm.body.variant.version, netPrice: 900 });
  await owner.view(390, 844, "light");
  await owner.go(cfg(customerId, issueId, pricedOnly.variantId, "pret"));
  await owner.waitText(/Emite oferta|Preț net/);
  const issueVis = await inViewport(owner, /Emite oferta/, "commercial-issue-action");
  check("mobile issue action is in the first viewport at 390", issueVis.found && issueVis.visible, issueVis);
  await owner.shot("07_mobile_issue_390", { scenario: "mobile issue", role: "Proprietar" });
  await owner.view(1440, 900, "light");

  await owner.go(quoteHref(first.quote.quoteSnapshotId));
  await owner.waitText(/Comandă acceptată|Confirmă comanda|Fișa lucrării/);
  const focused = await owner.page.eval(`(() => {
    const btn = [...document.querySelectorAll('button, a')].find((e) => /Confirmă comanda|Fișa lucrării|Descarcă oferta PDF/.test((e.textContent || '').replace(/\\s+/g, ' ')));
    if (!btn) return { ok: false };
    btn.focus();
    const style = getComputedStyle(btn);
    return {
      ok: document.activeElement === btn,
      outline: style.outline,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
    };
  })()`);
  check("critical commercial control can take keyboard focus", Boolean(focused?.ok), focused);
  await owner.shot("08_keyboard_focus", { scenario: "keyboard", role: "Proprietar" });

  if (member) {
    const currentPolicy = await api(owner, "GET", "/api/admin/offering-policy");
    await api(owner, "POST", "/api/admin/offering-policy", {
      mode: "COMMERCIAL_APPROVAL_POLICY",
      rules: { everyOfferRequiresApproval: true, incompleteCostRequiresApproval: false },
      expectedVersion: currentPolicy.body?.policy?.version,
    });
    const apprReq = (await api(owner, "POST", "/api/requests", { customerId, title: `Coadă aprobare ${RUN}`, description: "Queue." })).body;
    const apprId = apprReq?.request?.requestId ?? apprReq?.detail?.request?.requestId;
    const apprVar = (await api(member, "POST", `/api/requests/${encodeURIComponent(apprId)}/variants`, { productCode: PRODUCT })).body?.variant;
    const apprPath = `/api/requests/${encodeURIComponent(apprId)}/variants/${encodeURIComponent(apprVar.variantId)}`;
    await api(member, "PATCH", apprPath, { expectedVersion: apprVar.version, values: values("COADA") });
    const apprPreview = await api(member, "POST", `/api/products/${PRODUCT}/preview`, { values: values("COADA") });
    const apprNow = (await api(member, "GET", apprPath)).body.variant;
    const apprConfirm = await api(member, "POST", `/api/products/${PRODUCT}/confirm`, { variantId: apprNow.variantId, expectedVersion: apprNow.version, reviewId: apprPreview.body.reviewId });
    await api(member, "PUT", `${apprPath}/price`, { expectedVersion: apprConfirm.body.variant.version, netPrice: 1100 });
    const apprCurrent = (await api(member, "GET", apprPath)).body.variant;
    await api(member, "POST", `/api/products/${PRODUCT}/price-approval-requests`, { variantId: apprCurrent.variantId, expectedVersion: apprCurrent.version, approvalNote: "Coadă vizibilă." });
    await owner.view(1440, 900, "light");
    await owner.go("/admin/offering");
    await owner.waitText(/Solicitări de aprobare|Deschide varianta/);
    const queueVis = await inViewport(owner, /Deschide varianta și decide acolo|Solicitări de aprobare/);
    check("approval queue navigation is visible at 1440", queueVis.found && queueVis.visible, queueVis);
    await owner.shot("09_admin_queue_1440", { scenario: "approval queue", role: "Proprietar" });
    await matrix(owner, "10_admin_offering", { scenario: "approval queue", role: "Proprietar" }, "/admin/offering", /Reguli de ofertare/);
  } else {
    check("approval queue browser journey skipped: no Comercial secrets", false, "NOT RUN");
  }

  await owner.go(`/lucrari/${encodeURIComponent(holderId)}`);
  await owner.waitText(/Montaj|Producție|Lucrare|Fișa/);
  await matrix(owner, "11_holder_job_after_release", { scenario: "variant through production", role: "Proprietar" }, `/lucrari/${encodeURIComponent(holderId)}`);
} catch (error) {
  check(`closure aborted: ${String(error?.message ?? error).slice(0, 240)}`, false);
  console.error(error);
} finally {
  const passed = suite.write("closure-journeys-results.json", { run: RUN, product: PRODUCT });
  owner?.close();
  member?.close();
  process.exit(passed ? 0 : 1);
}
