import {
  ACM,
  LETTERS,
  SYNTHETIC_MANUAL_NET_PRICE,
  acmValues,
  ensureCustomer,
  ensureRequest,
  ensureSeller,
  lettersValues,
  requireOk,
  type SeedHttpClient,
} from "./ownerReviewSeed.js";

/**
 * Declarative extension of the existing synthetic HTTP seeds.
 * Identities come from the server. A branch is one persisted product quote
 * snapshot, matched again by product code and inscription.
 */
export const FOUNDATION_CONSOLIDATION_VERSION = "SYNTHETIC_FOUNDATION_CONSOLIDATION_V1" as const;

export type FoundationBranchSpec = {
  key: string;
  productCode: typeof LETTERS | typeof ACM;
  inscription: string;
};

export const EIGHT_COMMERCIAL_BRANCHES = {
  scenarioKey: "sfc.request.eight-commercial-branches.v1",
  version: 1,
  provenance: FOUNDATION_CONSOLIDATION_VERSION,
  customerName: "Fundație Sintetică Demo SRL",
  requestTitle: "Opt ramuri comerciale distincte",
  requestDescription:
    "Cerere sintetică cu opt oferte de produs persistate pe aceeași cerere. Date de demonstrație, fără valoare comercială.",
  branches: [
    { key: "sfc.branch.letters.01.v1", productCode: LETTERS, inscription: "SFC-L01" },
    { key: "sfc.branch.letters.02.v1", productCode: LETTERS, inscription: "SFC-L02" },
    { key: "sfc.branch.letters.03.v1", productCode: LETTERS, inscription: "SFC-L03" },
    { key: "sfc.branch.letters.04.v1", productCode: LETTERS, inscription: "SFC-L04" },
    { key: "sfc.branch.acm.01.v1", productCode: ACM, inscription: "SFC-A01" },
    { key: "sfc.branch.acm.02.v1", productCode: ACM, inscription: "SFC-A02" },
    { key: "sfc.branch.acm.03.v1", productCode: ACM, inscription: "SFC-A03" },
    { key: "sfc.branch.acm.04.v1", productCode: ACM, inscription: "SFC-A04" },
  ],
} as const satisfies {
  scenarioKey: string;
  version: number;
  provenance: typeof FOUNDATION_CONSOLIDATION_VERSION;
  customerName: string;
  requestTitle: string;
  requestDescription: string;
  branches: readonly FoundationBranchSpec[];
};

export type FoundationBranchResult = {
  key: string;
  productCode: string;
  inscription: string;
  quoteSnapshotId: string;
  created: boolean;
};

export type EightBranchSeedReport = {
  version: typeof FOUNDATION_CONSOLIDATION_VERSION;
  scenarioKey: typeof EIGHT_COMMERCIAL_BRANCHES.scenarioKey;
  scenarioVersion: number;
  customerId: string;
  requestId: string;
  created: number;
  reused: number;
  branches: FoundationBranchResult[];
};

type LinkedProductOffer = {
  quoteSnapshotId: string;
  productCode: string;
  inscription: string;
};

export async function seedEightCommercialBranches(input: {
  client: SeedHttpClient;
  scenario?: typeof EIGHT_COMMERCIAL_BRANCHES;
}): Promise<EightBranchSeedReport> {
  const scenario = input.scenario ?? EIGHT_COMMERCIAL_BRANCHES;
  const client = input.client;
  await ensureSeller(client);
  const customer = await ensureCustomer(client, scenario.customerName);
  const request = await ensureRequest(
    client,
    customer.customerId,
    scenario.requestTitle,
    scenario.requestDescription,
  );
  const branches: FoundationBranchResult[] = [];
  for (const spec of scenario.branches) {
    branches.push(await ensureBranchQuote(client, customer.customerId, request.requestId, spec));
  }
  return {
    version: FOUNDATION_CONSOLIDATION_VERSION,
    scenarioKey: scenario.scenarioKey,
    scenarioVersion: scenario.version,
    customerId: customer.customerId,
    requestId: request.requestId,
    created: branches.filter((branch) => branch.created).length,
    reused: branches.filter((branch) => !branch.created).length,
    branches,
  };
}

async function ensureBranchQuote(
  client: SeedHttpClient,
  customerId: string,
  requestId: string,
  spec: FoundationBranchSpec,
): Promise<FoundationBranchResult> {
  const existing = (await linkedProductOffers(client, requestId)).find(
    (offer) => offer.productCode === spec.productCode && offer.inscription === spec.inscription,
  );
  if (existing) {
    return {
      key: spec.key,
      productCode: spec.productCode,
      inscription: spec.inscription,
      quoteSnapshotId: existing.quoteSnapshotId,
      created: false,
    };
  }
  const values = spec.productCode === LETTERS ? lettersValues(spec.inscription) : acmValues(spec.inscription);
  const previewed = await requireOk(
    await client.request("POST", `/api/products/${spec.productCode}/preview`, {
      values,
      requestId,
    }),
    `preview:${spec.key}`,
  );
  const priced = await requireOk(
    await client.request("POST", `/api/products/${spec.productCode}/confirm`, {
      values,
      reviewId: previewed.reviewId,
      requestId,
      manualProductNetPrice: SYNTHETIC_MANUAL_NET_PRICE,
    }),
    `confirm:${spec.key}`,
  );
  const disclosure = priced.rateAcknowledgement as
    | { status?: unknown; bindingHash?: unknown }
    | null
    | undefined;
  await requireOk(
    await client.request("POST", `/api/products/${spec.productCode}/quote-snapshots`, {
      values,
      reviewId: previewed.reviewId,
      customerId,
      requestId,
      manualProductNetPrice: SYNTHETIC_MANUAL_NET_PRICE,
      ...(disclosure?.status === "REQUIRED" && typeof disclosure.bindingHash === "string"
        ? { rateAcknowledgement: { bindingHash: disclosure.bindingHash } }
        : {}),
    }),
    `quote:${spec.key}`,
  );
  const created = (await linkedProductOffers(client, requestId)).find(
    (offer) => offer.productCode === spec.productCode && offer.inscription === spec.inscription,
  );
  if (!created) {
    throw new Error(`quote_identity_missing:${spec.key}`);
  }
  return {
    key: spec.key,
    productCode: spec.productCode,
    inscription: spec.inscription,
    quoteSnapshotId: created.quoteSnapshotId,
    created: true,
  };
}

async function linkedProductOffers(
  client: SeedHttpClient,
  requestId: string,
): Promise<LinkedProductOffer[]> {
  const body = await requireOk(
    await client.request("GET", `/api/requests/${encodeURIComponent(requestId)}`),
    "request_detail",
  );
  const detail = body.detail as
    | {
        linkedOffers?: Array<{
          quoteSnapshotId?: unknown;
          productCode?: unknown;
          inscription?: unknown;
          kind?: unknown;
        }>;
      }
    | undefined;
  return (detail?.linkedOffers ?? []).flatMap((offer) => {
    if (
      offer.kind !== "PRODUCT" ||
      typeof offer.quoteSnapshotId !== "string" ||
      typeof offer.productCode !== "string"
    ) {
      return [];
    }
    return [
      {
        quoteSnapshotId: offer.quoteSnapshotId,
        productCode: offer.productCode,
        inscription: typeof offer.inscription === "string" ? offer.inscription : "",
      },
    ];
  });
}
