import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SeedHttpClient } from "../../cloud/ownerReviewSeed.js";
import { quotesForRequest, requireOk } from "../../cloud/ownerReviewSeed.js";
import { DEMO_IMAGE_PROVENANCE, renderDemoImage, renderDemoPdf, type DemoImageSpec, type DemoPdfSpec } from "./demoFiles.js";

/**
 * N-020 · versioned, idempotent, resumable seed of a customer dossier, through the supported HTTP
 * routes only. Every applied step is written once to a ledger in the demo root; a recorded step
 * is never applied again, and an entity found by its natural key (site name, work title, document
 * title + file name, an existing assignment or terms version) is adopted, never modified. So a
 * second run creates nothing and later edits by the operator are kept.
 */
export const CLIENT_DOSSIER_SEED_VERSION = "N020-CLIENT-DOSSIER-V1";
export const CLIENT_DOSSIER_LEDGER_FILE = "client-dossier-seed-ledger.json";

type LinkRef =
  | { kind: "SITE"; site: string }
  | { kind: "REQUEST"; requestTitle: string }
  | { kind: "JOB"; requestTitle: string }
  | { kind: "HISTORICAL_WORK"; work: string };

export type ClientDossierScenario = {
  customer: { cui: string | null; displayName: string };
  sites: Array<{ key: string; fields: Record<string, string | null> }>;
  siteAssignments: Array<{ key: string; subject: "REQUEST" | "JOB"; requestTitle: string; site: string }>;
  quoteRevisions: Array<{ key: string; requestTitle: string; productCode: string; values: Record<string, unknown>; manualProductNetPrice: number }>;
  historicalWorks: Array<{ key: string; site: string | null; fields: Record<string, string | null> }>;
  documents: Array<{
    key: string;
    fileName: string;
    file: { pdf: DemoPdfSpec } | { image: DemoImageSpec };
    kind: string;
    photoStage?: string;
    title: string;
    documentNumber?: string;
    documentDate?: string;
    description?: string;
    links: LinkRef[];
  }>;
  commercialTerms: { key: string; referenceDocument: string | null; fields: Record<string, string | number | null> } | null;
};

type LedgerStep = { result: string; appliedAt: string };
type Ledger = { seedVersion: string; customerId: string | null; steps: Record<string, LedgerStep>; files: Record<string, { sha256: string; sizeBytes: number }> };

export type ClientDossierSeedReport = {
  seedVersion: string;
  customerId: string;
  applied: string[];
  skipped: string[];
  adopted: string[];
  refused: string[];
};

function readLedger(root: string): Ledger {
  const path = join(root, CLIENT_DOSSIER_LEDGER_FILE);
  if (!existsSync(path)) return { seedVersion: CLIENT_DOSSIER_SEED_VERSION, customerId: null, steps: {}, files: {} };
  const ledger = JSON.parse(readFileSync(path, "utf8")) as Ledger;
  if (ledger.seedVersion !== CLIENT_DOSSIER_SEED_VERSION) {
    throw new Error(`client_dossier_seed_version_mismatch:${ledger.seedVersion}`);
  }
  return ledger;
}

function writeLedger(root: string, ledger: Ledger): void {
  const path = join(root, CLIENT_DOSSIER_LEDGER_FILE);
  writeFileSync(`${path}.tmp`, `${JSON.stringify(ledger, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
}

type Dossier = {
  sites: Array<{ siteId: string; name: string }>;
  siteAssignments: Array<{ subjectKind: string; subjectId: string; siteId: string }>;
  documents: Array<{ documentId: string; title: string; originalFileName: string }>;
  historicalWorks: Array<{ workId: string; title: string }>;
};

export async function seedClientDossier(input: {
  client: SeedHttpClient;
  /** Multipart upload with the same authenticated session (the JSON client cannot send files). */
  upload: (path: string, form: FormData) => Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }>;
  root: string;
  scenario: ClientDossierScenario;
  now?: () => string;
  /**
   * Optional source images for a visual review copy, by scenario document key (PNG/JPEG bytes and
   * their declared provenance). They replace the generated schematic image of that document only;
   * documents, stages, dates and links stay the scenario's. Without it the schematic images are used.
   */
  imageSources?: Record<string, { bytes: Uint8Array; contentType: "image/png" | "image/jpeg"; provenance: string }>;
}): Promise<ClientDossierSeedReport> {
  const { client, root, scenario } = input;
  const now = input.now ?? (() => new Date().toISOString());
  const ledger = readLedger(root);
  const report: ClientDossierSeedReport = { seedVersion: CLIENT_DOSSIER_SEED_VERSION, customerId: "", applied: [], skipped: [], adopted: [], refused: [] };

  const customers = (await requireOk(await client.request("GET", "/api/customers"), "customers")).customers as Array<{
    customerId: string;
    displayName: string;
    cui: string | null;
  }>;
  const customer =
    (ledger.customerId ? customers.find((item) => item.customerId === ledger.customerId) : undefined) ??
    customers.find((item) => (scenario.customer.cui && item.cui === scenario.customer.cui) || item.displayName === scenario.customer.displayName);
  if (!customer) throw new Error("client_dossier_seed_customer_missing");
  ledger.customerId = customer.customerId;
  report.customerId = customer.customerId;
  const base = `/api/customers/${encodeURIComponent(customer.customerId)}`;

  const dossier = async (): Promise<Dossier> => (await requireOk(await client.request("GET", `${base}/dossier`), "dossier")).dossier as Dossier;
  const workspace = (await requireOk(await client.request("GET", `${base}/workspace`), "workspace")).workspace as {
    requests: Array<{ requestId: string; title: string }>;
    jobs: Array<{ jobId: string; requestId: string | null }>;
  };
  const requestId = (title: string) => {
    const found = workspace.requests.find((item) => item.title === title);
    if (!found) throw new Error(`client_dossier_seed_request_missing:${title}`);
    return found.requestId;
  };
  const jobId = (title: string) => {
    const found = workspace.jobs.find((item) => item.requestId === requestId(title));
    if (!found) throw new Error(`client_dossier_seed_job_missing:${title}`);
    return found.jobId;
  };
  const ids: Record<string, string> = Object.fromEntries(Object.entries(ledger.steps).map(([key, step]) => [key, step.result]));

  /** Runs `step` once. `adopt` returns an existing entity's id when the natural key already exists. */
  async function once(key: string, adopt: () => Promise<string | null>, step: () => Promise<string>): Promise<void> {
    if (ledger.steps[key]) {
      report.skipped.push(key);
      return;
    }
    const existing = await adopt();
    const result = existing ?? (await step());
    if (result.startsWith("refused:")) {
      report.refused.push(`${key}:${result}`);
      return;
    }
    ledger.steps[key] = { result, appliedAt: now() };
    ids[key] = result;
    (existing ? report.adopted : report.applied).push(key);
    writeLedger(root, ledger);
  }

  for (const site of scenario.sites) {
    await once(
      `site:${site.key}`,
      async () => (await dossier()).sites.find((item) => item.name === site.fields.name)?.siteId ?? null,
      async () => {
        const created = await client.request("POST", `${base}/sites`, site.fields);
        return created.ok ? String((created.body?.site as { siteId: string }).siteId) : `refused:${created.status}`;
      },
    );
  }

  for (const assignment of scenario.siteAssignments) {
    const subjectId = assignment.subject === "REQUEST" ? requestId(assignment.requestTitle) : jobId(assignment.requestTitle);
    await once(
      `assignment:${assignment.key}`,
      // Any site already chosen for this request or job is the operator's choice: kept.
      async () => (await dossier()).siteAssignments.find((item) => item.subjectKind === assignment.subject && item.subjectId === subjectId)?.siteId ?? null,
      async () => {
        const siteId = ids[`site:${assignment.site}`];
        if (!siteId) return "refused:site_not_seeded";
        const done = await client.request("PUT", `${base}/site-assignments`, { subjectKind: assignment.subject, subjectId, siteId });
        return done.ok ? siteId : `refused:${done.status}`;
      },
    );
  }

  for (const revision of scenario.quoteRevisions) {
    const target = requestId(revision.requestTitle);
    await once(
      `quote:${revision.key}`,
      async () => {
        const quotes = await quotesForRequest(client, target);
        return quotes.length >= 2 ? String(quotes[quotes.length - 1]?.quoteSnapshotId) : null;
      },
      async () => {
        const previewed = await requireOk(
          await client.request("POST", `/api/products/${revision.productCode}/preview`, { values: revision.values, requestId: target }),
          `preview:${revision.key}`,
        );
        const priced = await requireOk(
          await client.request("POST", `/api/products/${revision.productCode}/confirm`, {
            values: revision.values,
            reviewId: previewed.reviewId,
            requestId: target,
            manualProductNetPrice: revision.manualProductNetPrice,
          }),
          `confirm:${revision.key}`,
        );
        const disclosure = priced.rateAcknowledgement as { status?: unknown; bindingHash?: unknown } | null | undefined;
        const frozen = await client.request("POST", `/api/products/${revision.productCode}/quote-snapshots`, {
          values: revision.values,
          reviewId: previewed.reviewId,
          customerId: customer.customerId,
          requestId: target,
          manualProductNetPrice: revision.manualProductNetPrice,
          ...(disclosure?.status === "REQUIRED" && typeof disclosure.bindingHash === "string"
            ? { rateAcknowledgement: { bindingHash: disclosure.bindingHash } }
            : {}),
        });
        return frozen.ok ? String((frozen.body?.quoteSnapshot as { quoteSnapshotId: string }).quoteSnapshotId) : `refused:${String(frozen.body?.error ?? frozen.status)}`;
      },
    );
  }

  for (const work of scenario.historicalWorks) {
    await once(
      `historical:${work.key}`,
      async () => (await dossier()).historicalWorks.find((item) => item.title === work.fields.title)?.workId ?? null,
      async () => {
        const siteId = work.site ? ids[`site:${work.site}`] : null;
        const created = await client.request("POST", `${base}/historical-works`, { ...work.fields, siteId: siteId ?? null });
        return created.ok ? String((created.body?.work as { workId: string }).workId) : `refused:${String(created.body?.error ?? created.status)}`;
      },
    );
  }

  const resolveLink = (link: LinkRef): { kind: string; subjectId: string } | null => {
    switch (link.kind) {
      case "SITE":
        return ids[`site:${link.site}`] ? { kind: "SITE", subjectId: ids[`site:${link.site}`]! } : null;
      case "REQUEST":
        return { kind: "REQUEST", subjectId: requestId(link.requestTitle) };
      case "JOB":
        return { kind: "JOB", subjectId: jobId(link.requestTitle) };
      case "HISTORICAL_WORK":
        return ids[`historical:${link.work}`] ? { kind: "HISTORICAL_WORK", subjectId: ids[`historical:${link.work}`]! } : null;
      default: {
        const _exhaustive: never = link;
        return _exhaustive;
      }
    }
  };

  for (const document of scenario.documents) {
    await once(
      `document:${document.key}`,
      async () => (await dossier()).documents.find((item) => item.title === document.title && item.originalFileName === document.fileName)?.documentId ?? null,
      async () => {
        const source = "image" in document.file ? input.imageSources?.[document.key] : undefined;
        const bytes = "pdf" in document.file ? await renderDemoPdf(document.file.pdf) : (source?.bytes ?? renderDemoImage(document.file.image));
        const form = new FormData();
        form.set("file", new File([bytes], document.fileName, { type: "pdf" in document.file ? "application/pdf" : (source?.contentType ?? "image/png") }));
        form.set("kind", document.kind);
        if (document.photoStage) form.set("photoStage", document.photoStage);
        form.set("title", document.title);
        if (document.documentNumber) form.set("documentNumber", document.documentNumber);
        if (document.documentDate) form.set("documentDate", document.documentDate);
        const description = "image" in document.file ? [document.description, source?.provenance ?? DEMO_IMAGE_PROVENANCE].filter(Boolean).join(" ") : document.description;
        if (description) form.set("description", description);
        form.set("links", JSON.stringify(document.links.map(resolveLink).filter(Boolean)));
        const uploaded = await input.upload(`${base}/documents`, form);
        if (!uploaded.ok) return `refused:${String(uploaded.body?.error ?? uploaded.status)}`;
        ledger.files[document.key] = { sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.byteLength };
        return String(uploaded.body?.documentId);
      },
    );
  }

  const terms = scenario.commercialTerms;
  if (terms) {
    await once(
      `terms:${terms.key}`,
      // Terms already recorded (by the operator or an earlier run) are never overwritten.
      async () => {
        const current = await requireOk(await client.request("GET", `${base}/commercial-terms`), "terms");
        const recorded = current.terms as { revision?: number } | null;
        return recorded?.revision ? `revision:${recorded.revision}` : null;
      },
      async () => {
        const referenceDocumentId = terms.referenceDocument ? (ids[`document:${terms.referenceDocument}`] ?? null) : null;
        const saved = await client.request("PUT", `${base}/commercial-terms`, { ...terms.fields, referenceDocumentId, expectedRevision: 0 });
        return saved.ok ? `revision:${String((saved.body?.terms as { revision: number }).revision)}` : `refused:${String(saved.body?.error ?? saved.status)}`;
      },
    );
  }

  writeLedger(root, ledger);
  return report;
}
