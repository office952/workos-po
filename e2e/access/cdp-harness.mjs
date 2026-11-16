// V1 Organization Access · minimal headless-Chromium driver over CDP for the SYNTHETIC E2E scripts.
// No secrets are written: callers keep passwords/PINs in memory and mask them before any capture.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createHarness({ base, evidence, chrome, profiles }) {
  mkdirSync(`${evidence}/screenshots`, { recursive: true });
  const results = [];
  const shots = [];
  const check = (name, pass, detail = null) => {
    results.push({ name, pass: Boolean(pass), detail });
    console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${JSON.stringify(detail).slice(0, 300)}` : ""}`);
  };

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
      async goto(path, settle = 2200) { await send("Page.navigate", { url: path.startsWith("http") ? path : base + path }); await sleep(settle); },
      async eval(expr) { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; },
      async text() { return page.eval(`document.body.innerText`); },
      async click(text, scope = "document") { return page.eval(`(() => { const el = [...${scope}.querySelectorAll('button, a, label, [role=button]')].find(e => e.offsetParent && !e.disabled && e.textContent.trim().replace(/\\s+/g,' ').includes(${JSON.stringify(text)})); if (!el) return false; el.click(); return true; })()`); },
      async type(selector, value) { return page.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`); },
      async waitFor(predicateExpr, timeout = 15000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await page.eval(predicateExpr).catch(() => false)) return true; await sleep(250); } return false; },
      async shot(name, meta) {
        const r = await send("Page.captureScreenshot", { format: "png" });
        const buf = Buffer.from(r.data, "base64");
        const path = `${evidence}/screenshots/${name}.png`;
        writeFileSync(path, buf);
        shots.push({ name, path, sha256: createHash("sha256").update(buf).digest("hex"), ...meta, capturedAt: new Date().toISOString() });
      },
    };
    return page;
  }

  async function launch(port, profile) {
    const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profiles}/${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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

  const loginInPage = (page, email, password) => page.eval(`fetch('/api/cloud/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(${JSON.stringify({ email, password })})}).then(r=>r.status)`);
  const fetchJson = (page, path, init = null) => page.eval(`fetch(${JSON.stringify(path)}, Object.assign({credentials:'include'}, ${JSON.stringify(init ?? {})})).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }))`);

  function write(name) {
    writeFileSync(`${evidence}/${name}`, JSON.stringify({ base, results, shots }, null, 2));
    const passed = results.filter((r) => r.pass).length;
    console.log(`TOTAL ${results.length} PASS ${passed}`);
    return passed === results.length;
  }

  return { launch, check, loginInPage, fetchJson, write, results, shots };
}
