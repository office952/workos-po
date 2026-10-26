import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loginFetchSeedClient } from "../../cloud/ownerReviewHttp.js";
import { ALPHA_CLIMA_DOSSIER_SCENARIO } from "./alphaClimaScenario.js";
import { CLIENT_DOSSIER_LEDGER_FILE, CLIENT_DOSSIER_SEED_VERSION, seedClientDossier } from "./clientDossierSeed.js";

/**
 * pnpm --filter @workos-final/api demo:client-dossier -- --root <demo root> --base-url http://127.0.0.1:8895 [--illustrative-images <dir>]
 *
 * --illustrative-images: a folder with manifest.json ({ provenance, items: [{ key, file }] }) whose
 * images replace the generated schematic photos of those scenario documents (visual review copy).
 *
 * Signs in with the demo root's existing credentials (never prints or changes them), applies
 * the N-020 dossier scenario through the API and writes the ledger and a manifest into the root.
 * Refuses production and any root marked as real data.
 */
function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function codeIdentity(): string {
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() ? "+uncommitted" : "";
    return `${head}${dirty}`;
  } catch {
    return "unknown";
  }
}

type ImageSource = { bytes: Uint8Array; contentType: "image/png" | "image/jpeg"; provenance: string };

/** The source images of a visual review copy; every key must name a photo of the scenario, once. */
function readImageSources(dir: string): Record<string, ImageSource> {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { provenance: string; items: Array<{ key: string; file: string }> };
  const photoKeys = new Set(ALPHA_CLIMA_DOSSIER_SCENARIO.documents.filter((document) => "image" in document.file).map((document) => document.key));
  if (!manifest.provenance || !/ilustrativ/i.test(manifest.provenance)) throw new Error("illustrative_images_provenance_required");
  const sources: Record<string, ImageSource> = {};
  for (const item of manifest.items) {
    if (!photoKeys.has(item.key)) throw new Error(`illustrative_images_unknown_key:${item.key}`);
    if (sources[item.key]) throw new Error(`illustrative_images_duplicate_key:${item.key}`);
    const contentType = /\.jpe?g$/i.test(item.file) ? "image/jpeg" : "image/png";
    sources[item.key] = { bytes: new Uint8Array(readFileSync(join(dir, item.file))), contentType, provenance: manifest.provenance };
  }
  return sources;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("client_dossier_seed_production_refused");
  const root = resolve(flag("root") ?? "");
  const baseUrl = flag("base-url");
  if (!flag("root") || !baseUrl) throw new Error("usage: --root <demo root> --base-url <http://127.0.0.1:port>");
  const identityPath = join(root, ".reference-identity.json");
  if (!existsSync(identityPath)) throw new Error("client_dossier_seed_identity_missing");
  const identity = JSON.parse(readFileSync(identityPath, "utf8")) as {
    SYNTHETIC_ONLY?: string;
    REAL_DATA?: string;
    REAL_CUSTOMER_DATA?: string;
    PRODUCTION_ELIGIBLE?: string;
    email: string;
    password: string;
    organizationId: string;
  };
  if (identity.SYNTHETIC_ONLY !== "YES" || identity.REAL_DATA !== "NO" || identity.REAL_CUSTOMER_DATA !== "NO" || identity.PRODUCTION_ELIGIBLE !== "NO") {
    throw new Error("client_dossier_seed_requires_synthetic_root");
  }
  const imageDir = flag("illustrative-images");
  const imageSources = imageDir ? readImageSources(resolve(imageDir)) : undefined;
  const client = await loginFetchSeedClient({ baseUrl, email: identity.email, password: identity.password, organizationId: identity.organizationId });
  const report = await seedClientDossier({
    client,
    root,
    scenario: ALPHA_CLIMA_DOSSIER_SCENARIO,
    imageSources,
    async upload(path, form) {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, { method: "POST", headers: { cookie: client.jar.cookie }, body: form });
      return { ok: response.ok, status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null };
    },
  });
  const ledger = JSON.parse(readFileSync(join(root, CLIENT_DOSSIER_LEDGER_FILE), "utf8")) as Record<string, unknown>;
  const manifest = {
    kind: "workos-client-dossier-demo-manifest",
    seedVersion: CLIENT_DOSSIER_SEED_VERSION,
    synthetic: true,
    code: codeIdentity(),
    writtenAt: new Date().toISOString(),
    baseUrl,
    report,
    ledger,
    illustrativeImages: imageDir ? { dir: resolve(imageDir), keys: Object.keys(imageSources ?? {}) } : null,
  };
  writeFileSync(join(root, "client-dossier-seed-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ seedVersion: report.seedVersion, customerId: report.customerId, applied: report.applied.length, adopted: report.adopted.length, skipped: report.skipped.length, refused: report.refused }));
  if (report.refused.length) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
