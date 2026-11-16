// Pilot Readiness E2E · small, label-driven UI helpers on top of the existing CDP harness.
// Finds controls the way the component tests do (accessible label / button name), never by layout.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHarness, sleep } from "../access/cdp-harness.mjs";

export { sleep };

const SECRET_GUARD = `(secrets) => {
  const t = document.body.innerText; const hits = [];
  for (const s of secrets) if (s && t.includes(s)) hits.push('text');
  for (const i of document.querySelectorAll('input, textarea')) {
    const masked = i.type === 'password' || getComputedStyle(i).webkitTextSecurity === 'disc';
    if (!masked && secrets.some((s) => s && i.value.includes(s))) hits.push('field:' + (i.id || i.name));
  }
  if (/#t=[A-Za-z0-9_-]{8,}/.test(t)) hits.push('token-in-text');
  return hits;
}`;

/** One browser context per actor; every check and capture is recorded for the evidence matrix. */
export function createSuite({ base, evidence, chrome, profiles, secrets = () => [] }) {
  mkdirSync(`${evidence}/screenshots`, { recursive: true });
  const h = createHarness({ base, evidence, chrome, profiles });
  const shots = [];
  let port = 9700 + Math.floor(Math.random() * 200);

  async function actor(label) {
    const b = await h.launch(port++, `${label}-${Date.now()}`);
    const p = b.page;
    const ui = {
      proc: b.proc,
      page: p,
      sleep,
      width: 1440,
      height: 900,
      theme: "light",
      async view(width, height, theme = ui.theme) {
        ui.width = width; ui.height = height;
        await p.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
        if (theme !== ui.theme) { ui.theme = theme; await p.eval(`localStorage.setItem('workos-color-scheme', ${JSON.stringify(theme)})`).catch(() => {}); }
      },
      async go(path) {
        await p.send("Page.navigate", { url: path.startsWith("http") ? path : base + path });
        await sleep(500);
        await p.waitFor(`document.readyState === 'complete' && !/Se încarcă WorkOS/.test(document.body.innerText)`, 45000);
        await ui.settle();
      },
      async settle(ms = 700) {
        await p.waitFor(`!document.querySelector('[aria-busy="true"]')`, 20000).catch(() => {});
        await sleep(ms);
      },
      text: () => p.text(),
      has: async (re) => re.test(await p.text()),
      waitText: (re, t = 15000) => p.waitFor(`${re}.test(document.body.innerText)`, t),
      /** Click the first visible, enabled button/link whose accessible name matches. */
      async click(name, { scope = "document", exact = false } = {}) {
        const ok = await p.eval(`(() => {
          const want = ${JSON.stringify(typeof name === "string" ? name : null)}; const re = ${typeof name === "string" ? "null" : name.toString()};
          const norm = (s) => (s || '').trim().replace(/\\s+/g, ' ');
          const els = [...${scope}.querySelectorAll('button, a, [role=button], [role=tab], [role=radio], label')].filter((e) => e.offsetParent !== null && !e.disabled && e.getAttribute('aria-disabled') !== 'true');
          const name = (e) => norm(e.getAttribute('aria-label') || e.textContent);
          const el = els.find((e) => re ? re.test(name(e)) : (${exact} ? name(e) === want : name(e).includes(want)));
          if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true;
        })()`);
        if (!ok) throw new Error(`click: no enabled control named ${name}`);
        await ui.settle();
      },
      /** Click the button named `name` inside the nearest container of the field labelled `label`. */
      async clickNear(label, name) {
        const ok = await p.eval(`(() => {
          const norm = (s) => (s || '').trim().replace(/\\s+/g, ' ');
          const l = [...document.querySelectorAll('label')].find((x) => x.offsetParent && norm(x.textContent) === ${JSON.stringify(label)});
          const field = l && (l.htmlFor ? document.getElementById(l.htmlFor) : l.querySelector('input,select'));
          let box = field?.parentElement;
          while (box && box !== document.body) {
            const b = [...box.querySelectorAll('button')].find((e) => e.offsetParent && !e.disabled && norm(e.textContent).includes(${JSON.stringify(name)}));
            if (b) { b.click(); return true; }
            box = box.parentElement;
          }
          return false;
        })()`);
        if (!ok) throw new Error(`clickNear: no ${name} near ${label}`);
        await ui.settle();
      },
      async canClick(name) {
        return p.eval(`[...document.querySelectorAll('button, a, [role=button]')].some((e) => e.offsetParent !== null && !e.disabled && (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\\s+/g,' ').includes(${JSON.stringify(name)}))`);
      },
      /** Set a field by its visible label (label[for] or aria-label), firing React's events. */
      async fill(label, value, { scope = "document" } = {}) {
        const ok = await p.eval(`(() => {
          const norm = (s) => (s || '').trim().replace(/\\s+/g, ' ');
          const want = ${JSON.stringify(label)};
          let el = null;
          for (const l of ${scope}.querySelectorAll('label')) { if (norm(l.textContent).startsWith(want) && l.offsetParent !== null) { el = l.htmlFor ? document.getElementById(l.htmlFor) : l.querySelector('input,select,textarea'); if (el) break; } }
          if (!el) el = [...${scope}.querySelectorAll('input,select,textarea')].find((e) => e.offsetParent !== null && (e.getAttribute('aria-label') === want || e.id === want));
          if (!el) return false;
          const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
          let v = ${JSON.stringify(value)};
          if (el.tagName === 'SELECT' && ![...el.options].some((o) => o.value === v)) { const o = [...el.options].find((o) => norm(o.textContent).toLowerCase().includes(String(v).toLowerCase())); if (!o) return 'no-option'; v = o.value; }
          el.focus(); Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.blur();
          return true;
        })()`);
        if (ok !== true) throw new Error(`fill: ${ok === "no-option" ? "no option" : "no field"} for ${label}`);
        await sleep(250);
      },
      async check(label) {
        const ok = await p.eval(`(() => { const norm = (s) => (s || '').trim().replace(/\\s+/g, ' '); for (const l of document.querySelectorAll('label')) { if (norm(l.textContent).includes(${JSON.stringify(label)})) { const i = l.htmlFor ? document.getElementById(l.htmlFor) : l.querySelector('input'); if (i && !i.checked) { i.click(); } return true; } } return false; })()`);
        if (!ok) throw new Error(`check: no checkbox/radio labelled ${label}`);
        await sleep(250);
      },
      dialog: `document.querySelector('dialog[open], [role=dialog], [role=alertdialog]')`,
      api: (path, init = {}) => p.eval(`fetch(${JSON.stringify(path)}, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, ${JSON.stringify(init)})).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))`),
      login: (email, password, organizationId) => p.eval(`fetch('/api/cloud/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify({ email, password, ...(organizationId ? { organizationId } : {}) })}) }).then((r) => r.status)`),
      async shot(name, meta = {}, { full = false } = {}) {
        const hits = await p.eval(`(${SECRET_GUARD})(${JSON.stringify(secrets().filter(Boolean))})`);
        if (hits.length) { h.check(`capture blocked by secret guard: ${name}`, false, hits); return; }
        let height = ui.height;
        if (full) {
          height = Math.min(8000, await p.eval("Math.max(document.documentElement.scrollHeight, innerHeight)"));
          await p.send("Emulation.setDeviceMetricsOverride", { width: ui.width, height, deviceScaleFactor: 1, mobile: ui.width < 768 }); await sleep(400);
        }
        const r = await p.send("Page.captureScreenshot", { format: "png" });
        const buf = Buffer.from(r.data, "base64");
        const file = `${name}_${ui.width}x${ui.height}_${ui.theme === "dark" ? "Dark" : "Light"}.png`;
        writeFileSync(`${evidence}/screenshots/${file}`, buf);
        if (full) await p.send("Emulation.setDeviceMetricsOverride", { width: ui.width, height: ui.height, deviceScaleFactor: 1, mobile: ui.width < 768 });
        const overflow = await p.eval("document.documentElement.scrollWidth > innerWidth + 1");
        shots.push({ file, url: await p.eval("location.pathname + location.search"), viewport: `${ui.width}x${ui.height}`, capturedHeight: height, theme: ui.theme === "dark" ? "Dark" : "Light", horizontalOverflow: overflow, secretGuard: "PASS", sha256: createHash("sha256").update(buf).digest("hex"), capturedAt: new Date().toISOString(), ...meta });
      },
      /** Visible text + controls, for failure diagnostics only (no secrets: password fields are not read). */
      async dump(label) {
        const t = await p.eval(`(document.querySelector('main') ?? document.body).innerText.slice(0, 2500)`);
        const c = await p.eval(`[...document.querySelectorAll('main button, main a, main input, main select, main textarea, dialog button, dialog input, dialog select')].filter((e) => e.offsetParent).map((e) => e.tagName[0] + ':' + (e.id || '') + ':' + (e.type || '') + ':' + (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60) + (e.disabled ? ' [x]' : '')).join('\\n').slice(0, 3000)`);
        console.log(`\n--- DUMP ${label} @ ${await p.eval("location.pathname + location.search")}\n${t}\n--- controls\n${c}\n---`);
      },
      close() { b.proc.kill(); },
    };
    await ui.view(1440, 900);
    await ui.go("/");
    await p.eval(`localStorage.setItem('workos-color-scheme', 'light')`);
    return ui;
  }

  function write(name, extra = {}) {
    writeFileSync(`${evidence}/${name}`, JSON.stringify({ base, results: h.results, shots, ...extra }, null, 2));
    const passed = h.results.filter((r) => r.pass).length;
    console.log(`TOTAL ${h.results.length} PASS ${passed}`);
    return passed === h.results.length;
  }

  return { actor, check: h.check, results: h.results, shots, write };
}
