import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  ACM_CASSETTE_NONE_FORM_SCHEMA_ID,
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  ACM_CASSETTE_NONE_PROOF_VALUES,
  ACM_CASSETTE_NONE_TEMPLATE_VERSION,
  CANONICAL_PRODUCT_CODE,
  FRAME_CLEARANCE_SETTING_ID,
} from "@workos-final/domain";
import { provisionNewOrganization } from "../src/cloud/provision.js";
import { startWorkosApi } from "../src/startApi.js";

const EMAIL = "owner-acm-v1@example.test";
const PASSWORD = "OwnerPass12";
const PORT = process.env.WORKOS_ACM_V1_PORT?.trim() || "19887";
const HOST = "127.0.0.1";
const KEEP = process.env.WORKOS_ACM_V1_KEEP === "1";

const LETTERS_VALUES = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
} as const;

type JsonObject = Record<string, unknown>;

async function readJson(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

function quantity(
  items: unknown,
  id: string,
): number | undefined {
  if (!Array.isArray(items)) {
    return undefined;
  }
  const found = items.find((item) => {
    return typeof item === "object" && item !== null && (item as JsonObject).id === id;
  }) as JsonObject | undefined;
  return typeof found?.value === "number" ? found.value : undefined;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const cloudRoot = mkdtempSync(join(tmpdir(), "workos-acm-v1-saas-"));
  mkdirSync(cloudRoot, { recursive: true });
  const staticRoot = resolve(process.cwd(), "..", "..", "dist");
  const provisioned = await provisionNewOrganization({
    cloudRoot,
    displayName: "Atelier ACM V1",
    email: EMAIL,
    password: PASSWORD,
    bootstrapPolicy: "SYNTHETIC_TEST",
  });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    WORKOS_CLOUD_ROOT: cloudRoot,
    WORKOS_STATIC_ROOT: staticRoot,
    PORT,
    HOST,
    NODE_ENV: "development",
  };
  delete env.WORKOS_SQLITE_PATH;

  const started = await startWorkosApi(env, { installSignals: KEEP });
  const origin = `http://${started.hostname}:${started.port}`;
  try {
    await runJourney({
      origin,
      cloudRoot,
      staticRoot,
      organizationId: provisioned.organization.organizationId,
    });
  } finally {
    if (!KEEP) {
      await started.close();
    }
  }
}

async function runJourney(input: {
  origin: string;
  cloudRoot: string;
  staticRoot: string;
  organizationId: string;
}): Promise<void> {
  const { origin, cloudRoot, staticRoot, organizationId } = input;

  const login = await fetch(`${origin}/api/cloud/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      organizationId,
    }),
  });
  assert(login.status === 200, `login_failed:${login.status}`);
  const cookie = login.headers.getSetCookie()[0]?.split(";", 1)[0] ?? "";
  const headers = { cookie, "content-type": "application/json" };

  const seller = await fetch(`${origin}/api/seller`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ legalName: "Atelier ACM Sintetic SRL" }),
  });
  assert(seller.status === 200, `seller_failed:${seller.status}`);

  const customer = await readJson(
    await fetch(`${origin}/api/customers`, {
      method: "POST",
      headers,
      body: JSON.stringify({ displayName: "Client ACM V1" }),
    }),
  );
  const customerId = (customer.customer as { customerId?: string }).customerId;
  assert(customerId, "customer_missing");
  const requestBody = await readJson(
    await fetch(`${origin}/api/requests`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customerId,
        title: "Cerere ACM V1",
        description: "Cerere sintetică pentru dovada ACM V2.",
      }),
    }),
  );
  const requestId =
    ((requestBody.request as JsonObject | undefined)?.requestId as string | undefined) ??
    (requestBody.requestId as string | undefined);
  assert(requestId, `request_missing:${JSON.stringify(requestBody)}`);

  const catalog = await readJson(await fetch(`${origin}/api/product-catalog`, { headers }));
  const catalogText = JSON.stringify(catalog);
  assert(catalogText.includes(ACM_CASSETTE_NONE_PRODUCT_CODE), "catalog_missing_acm");
  assert(catalogText.includes(CANONICAL_PRODUCT_CODE), "catalog_missing_letters");

  const product = await readJson(
    await fetch(`${origin}/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}`, { headers }),
  );
  const template = product.template as JsonObject;
  const formSchema = product.formSchema as JsonObject;
  assert(template?.code === ACM_CASSETTE_NONE_PRODUCT_CODE, "product_code_changed");
  assert(template?.version === ACM_CASSETTE_NONE_TEMPLATE_VERSION, "template_version_not_v2");
  assert(formSchema?.id === ACM_CASSETTE_NONE_FORM_SCHEMA_ID, "form_schema_not_v2");
  const formText = JSON.stringify(formSchema);
  assert(!formText.includes("mountingSystem"), "form_still_has_mounting");
  assert(!formText.includes("foldCount"), "form_still_has_fold_count");
  assert(formText.includes("face.cassetteDepthMm"), "form_missing_depth");
  assert(formText.includes("face.backReturnMm"), "form_missing_back_return");

  const lettersPreview = await readJson(
    await fetch(`${origin}/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers,
      body: JSON.stringify({ values: LETTERS_VALUES }),
    }),
  );
  const lettersReviewId = lettersPreview.reviewId;
  assert(
    typeof lettersReviewId === "string" && lettersReviewId.startsWith("crv1:"),
    "letters_preview_missing_crv1",
  );

  const preview = await readJson(
    await fetch(`${origin}/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers,
      body: JSON.stringify({ values: ACM_CASSETTE_NONE_PROOF_VALUES }),
    }),
  );
  assert(preview.readiness === "ready", `acm_preview_not_ready:${String(preview.readiness)}`);
  const firstReviewId = preview.reviewId;
  assert(
    typeof firstReviewId === "string" && firstReviewId.startsWith("crv1:"),
    "acm_preview_missing_crv1",
  );

  const confirm = await fetch(`${origin}/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/confirm`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      values: ACM_CASSETTE_NONE_PROOF_VALUES,
      reviewId: firstReviewId,
    }),
  });
  assert(confirm.status === 200, `acm_confirm_failed:${confirm.status}`);
  const confirmed = await readJson(confirm);
  const truth = confirmed.truth as JsonObject;
  const values = (truth.values ?? {}) as JsonObject;
  assert(truth.templateVersion === "2", "confirm_template_not_v2");
  assert(values["face.materialFamily"] === "acm", "identity_material");
  assert(values["face.thicknessMm"] === 3, "identity_thickness");
  assert(values["face.finish"] === "none", "identity_finish");
  assert(values["back.materialFamily"] === "steel", "identity_frame");
  assert(values["root.mountingSystem"] === undefined, "confirm_has_mounting");
  assert(values["face.foldCount"] === undefined, "confirm_has_fold_count");
  const blankArea = quantity((confirmed.aggregate as JsonObject)?.quantities, "cassette_blank_area");
  assert(blankArea !== undefined && Math.abs(blankArea - 2.2791) < 1e-6, `blank_area:${String(blankArea)}`);
  const widthMm = ACM_CASSETTE_NONE_PROOF_VALUES["face.widthMm"] as number;
  const heightMm = ACM_CASSETTE_NONE_PROOF_VALUES["face.heightMm"] as number;
  const depthMm = ACM_CASSETTE_NONE_PROOF_VALUES["face.cassetteDepthMm"] as number;
  const backReturnMm = ACM_CASSETTE_NONE_PROOF_VALUES["face.backReturnMm"] as number;
  const blankWidthMm = widthMm + 2 * (depthMm + backReturnMm);
  const blankHeightMm = heightMm + 2 * (depthMm + backReturnMm);
  assert(blankWidthMm === 3210, `blank_width:${blankWidthMm}`);
  assert(blankHeightMm === 710, `blank_height:${blankHeightMm}`);

  const quote = await fetch(`${origin}/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/quote-snapshots`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      values: ACM_CASSETTE_NONE_PROOF_VALUES,
      reviewId: firstReviewId,
      customerId,
    }),
  });
  const quoteText = await quote.text();
  assert(quote.status === 200, `quote_freeze_failed:${quote.status}:${quoteText}`);
  const quoted = JSON.parse(quoteText) as JsonObject;
  const quoteSnapshot = quoted.quoteSnapshot as JsonObject;
  assert((quoteSnapshot.truth as JsonObject)?.templateVersion === "2", "quote_template_not_v2");
  const quoteUsed =
    (((quoteSnapshot.productionInput as JsonObject | undefined)?.usedTechnicalSettings as
      | JsonObject[]
      | undefined) ??
      (quoteSnapshot.usedTechnicalSettings as JsonObject[] | undefined) ??
      []) ;
  const quoteClearance = quoteUsed.find((item) => item.id === FRAME_CLEARANCE_SETTING_ID);
  assert(quoteClearance?.value === 2, `quote_clearance:${JSON.stringify(quoteClearance)}`);
  assert(quoteClearance?.source === "PLATFORM_STARTER", "quote_clearance_source");
  assert(JSON.stringify(quoteSnapshot.truth).includes("face.cassetteDepthMm"), "quote_missing_depth");
  assert(!JSON.stringify(quoteSnapshot.truth).includes("mountingSystem"), "quote_has_mounting");
  assert(!JSON.stringify(quoteSnapshot.truth).includes("foldCount"), "quote_has_fold_count");

  const production = await fetch(
    `${origin}/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/accepted-production-snapshot`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        values: ACM_CASSETTE_NONE_PROOF_VALUES,
        reviewId: firstReviewId,
      }),
    },
  );
  assert(production.status === 200, `production_failed:${production.status}`);
  const produced = await readJson(production);
  const snapshot = produced.snapshot as JsonObject;
  const snapshotId = snapshot.snapshotId as string;
  const used = (snapshot.usedTechnicalSettings as JsonObject[]) ?? [];
  const frozenClearance = used.find((item) => item.id === FRAME_CLEARANCE_SETTING_ID);
  assert(frozenClearance?.value === 2, `production_clearance:${JSON.stringify(frozenClearance)}`);
  assert(frozenClearance?.definitionId === "STEEL_INTERNAL_FRAME.frameClearanceMm", "production_definition");
  assert(frozenClearance?.source === "PLATFORM_STARTER", "production_source");
  assert((snapshot.truth as JsonObject)?.templateVersion === "2", "production_template_not_v2");

  const saved = await fetch(`${origin}/api/admin/technical-settings`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      settings: [{ settingId: FRAME_CLEARANCE_SETTING_ID, value: 6 }],
    }),
  });
  assert(saved.status === 200, `clearance_save_failed:${saved.status}`);
  const admin = await readJson(saved);
  const adminSettings = (admin.settings as JsonObject[]) ?? [];
  const savedClearance = adminSettings.find((item) => item.settingId === FRAME_CLEARANCE_SETTING_ID);
  assert(savedClearance?.value === 6, "admin_clearance_not_6");
  assert(savedClearance?.source === "ORGANIZATION", "admin_clearance_not_organization");

  const staleAcm = await fetch(`${origin}/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/confirm`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      values: ACM_CASSETTE_NONE_PROOF_VALUES,
      reviewId: firstReviewId,
    }),
  });
  assert(staleAcm.status === 409, `stale_acm_expected_409:${staleAcm.status}`);

  const stillLetters = await fetch(`${origin}/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      values: LETTERS_VALUES,
      reviewId: lettersReviewId,
    }),
  });
  assert(stillLetters.status === 200, `letters_unexpectedly_invalidated:${stillLetters.status}`);

  const nextPreview = await readJson(
    await fetch(`${origin}/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers,
      body: JSON.stringify({ values: ACM_CASSETTE_NONE_PROOF_VALUES }),
    }),
  );
  const nextReviewId = nextPreview.reviewId;
  assert(
    typeof nextReviewId === "string" && nextReviewId.startsWith("crv1:"),
    "next_acm_preview_missing_crv1",
  );
  assert(nextReviewId !== firstReviewId, "next_acm_crv1_unchanged");

  const nextConfirm = await fetch(`${origin}/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/confirm`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      values: ACM_CASSETTE_NONE_PROOF_VALUES,
      reviewId: nextReviewId,
    }),
  });
  assert(nextConfirm.status === 200, `next_acm_confirm_failed:${nextConfirm.status}`);
  const nextConfirmed = await readJson(nextConfirm);

  const nextQuote = await fetch(`${origin}/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/quote-snapshots`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      values: ACM_CASSETTE_NONE_PROOF_VALUES,
      reviewId: nextReviewId,
      customerId,
    }),
  });
  assert(nextQuote.status === 200, `next_quote_failed:${nextQuote.status}`);
  const nextQuoted = await readJson(nextQuote);
  const nextQuoteSnapshot = nextQuoted.quoteSnapshot as JsonObject;
  const nextUsed =
    (((nextQuoteSnapshot.productionInput as JsonObject | undefined)?.usedTechnicalSettings as
      | JsonObject[]
      | undefined) ??
      (nextQuoteSnapshot.usedTechnicalSettings as JsonObject[] | undefined) ??
      []);
  const nextClearance = nextUsed.find((item) => item.id === FRAME_CLEARANCE_SETTING_ID);
  assert(nextClearance?.value === 6, `next_quote_clearance:${JSON.stringify(nextClearance)}`);
  assert(nextClearance?.source === "ORGANIZATION", "next_quote_source");

  const reread = await readJson(
    await fetch(
      `${origin}/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/accepted-production-snapshots/${snapshotId}`,
      { headers },
    ),
  );
  const storedUsed =
    ((reread.snapshot as JsonObject).usedTechnicalSettings as JsonObject[]) ?? [];
  const storedClearance = storedUsed.find((item) => item.id === FRAME_CLEARANCE_SETTING_ID);
  assert(storedClearance?.value === 2, `frozen_snapshot_rewritten:${JSON.stringify(storedClearance)}`);

  const configuratorPath = `/configurator?product=${encodeURIComponent(ACM_CASSETTE_NONE_PRODUCT_CODE)}&customer=${encodeURIComponent(customerId)}&request=${encodeURIComponent(requestId)}`;
  const catalogPath = `/catalog?customer=${encodeURIComponent(customerId)}&request=${encodeURIComponent(requestId)}`;
  const proof = {
    isolatedSyntheticSaas: true,
    origin,
    email: EMAIL,
    password: PASSWORD,
    organizationId,
    customerId,
    requestId,
    productCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
    templateVersion: template.version,
    formSchemaId: formSchema.id,
    configuratorUrl: `${origin}${configuratorPath}`,
    technicalAdminUrl: `${origin}/admin/technical`,
    catalogUrl: `${origin}${catalogPath}`,
    cloudRoot,
    staticRoot,
    realHubMedia: false,
    blankWidthMm,
    blankHeightMm,
    blankAreaM2: blankArea,
    firstReviewId,
    nextReviewId,
    staleAcmStatus: staleAcm.status,
    lettersConfirmAfterAcmChange: stillLetters.status,
    firstClearance: quoteClearance,
    nextClearance,
    frozenSnapshotClearance: storedClearance,
    nextConfirmStatus: nextConfirm.status,
    nextFrameWidthM: quantity(
      (nextConfirmed.aggregate as JsonObject)?.quantities,
      "frame_external_width_m",
    ),
  };
  writeFileSync(join(cloudRoot, "acm-v1-runtime.json"), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
}

await main();
