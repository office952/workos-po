// Compare two characterization runs for the given actors. Exit 1 on any difference outside the
// declared noise list. Usage: node compare-characterization.mjs <before.json> <after.json> --actors owner,member [--noise noise.json] [--out diff.json]
import { readFileSync, writeFileSync } from "node:fs";
const [, , a, b] = process.argv;
const arg = (n, f = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : f; };
const actors = (arg("actors") ?? "owner,member").split(",");
const noise = arg("noise") ? new Set(JSON.parse(readFileSync(arg("noise"), "utf8"))) : new Set();
const A = JSON.parse(readFileSync(a, "utf8")); const B = JSON.parse(readFileSync(b, "utf8"));
const byRoute = (x) => new Map(x.rows.map((r) => [r.route, r]));
const ma = byRoute(A), mb = byRoute(B);
const diffs = [];
for (const [route, ra] of ma) {
  const rb = mb.get(route);
  if (!rb) { diffs.push({ route, kind: "missing_after" }); continue; }
  for (const actor of actors) {
    const x = ra.results[actor], y = rb.results[actor];
    if (!x || !y) continue;
    for (const field of ["status", "shape", "body", "money", "error"]) {
      if (field === "body" && route.split(" ")[0] !== "GET") continue;
      if (JSON.stringify(x[field]) !== JSON.stringify(y[field])) {
        const key = `${route}|${actor}|${field}`;
        diffs.push({ route, actor, field, before: x[field], after: y[field], noise: noise.has(key) });
      }
    }
  }
}
for (const route of mb.keys()) if (!ma.has(route)) diffs.push({ route, kind: "new_after" });
const real = diffs.filter((d) => !d.noise && d.kind !== "new_after");
if (arg("out")) writeFileSync(arg("out"), JSON.stringify({ actors, total: diffs.length, real: real.length, diffs }, null, 2));
console.log(`diffs=${diffs.length} real=${real.length} newRoutes=${diffs.filter((d) => d.kind === "new_after").length}`);
for (const d of real.slice(0, 40)) console.log(JSON.stringify(d));
process.exit(real.length ? 1 : 0);
