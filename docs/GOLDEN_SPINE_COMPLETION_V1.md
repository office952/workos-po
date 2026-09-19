# WORKOS_GOLDEN_SPINE_COMPLETION_V1

> HISTORICAL EXECUTION ARTIFACT
> NOT CURRENT PRODUCT AUTHORITY
> CURRENT WORKOS PO SAAS CANON WINS

Execution artifact only. Not a second product roadmap.

```text
OWNER_ACCEPTED_FOUNDATION = YES
OWNER_ACCEPTED_REFERENCE_SLICE = YES
GOLDEN_SPINE = OWNER_ACCEPTED
OWNER_ACCEPTED_GOLDEN_SPINE = YES
OWNER_ACCEPTED_IMPLEMENTATION = YES
INTEGRATED_ON_MAIN = NO
```

Current code / current canon wins over remembered documentation.

## Boundary

```text
WORKOS DOMAIN → API → TRANSPORT DTO → UI20 ADAPTER → PRESENTATION MODEL → UI
```

`office952/workos-final` owns domain, Product Truth, pricing, snapshots, acceptance, order, release, execution, actuals.

`office952/workos-ui20` owns routes, adapters, presentation, interaction.

No UI business engine. No ProductDefinition in the browser.

## First golden product

Canonical LETTERS (`PRD-LETTERS-FRONTLIT-PLEXI-AL06`) is the first selected product, not a permanent architecture constant.

Selection path: Cerere → Catalog → selected product context.

Do not select installation scope. Current canon blocks quote freeze when installation is selected.

## Data

Isolated synthetic data only. Supported public APIs only. No SQL, no Cloud, no real customers.

## Lifecycle map

| Transition | Business object | Owner | API | UI route | Mutation | Snapshot / history | Proof |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH | isolated owner plane | workos-final | `GET /api/health` | health gate | none | none | contract compatible |
| CLIENT | Customer | workos-final | `GET/POST /api/customers` | `/clienti`, `/clienti/:id` | create customer | live registry | list + detail |
| CERERE | CommercialRequest | workos-final | `GET/POST /api/requests` | `/cereri`, `/cereri/:id` | create request without installation | live request | request linked to customer |
| CATALOG | Product catalog | workos-final | `GET /api/product-catalog` | `/catalog` | none | none | select LETTERS |
| CONFIGURATOR | Draft values + preview | workos-final | `POST .../preview` | `/` or `/configurator` | none | review identity | customer/request/product in context |
| PRODUCT TRUTH | Confirmed definition | workos-final | `POST .../confirm` | configurator | confirm with reviewId | review identity | no ProductDefinition sent |
| INTERNAL COST | EIC | workos-final | confirm `eic` | configurator | none | live calculation | labeled cost intern |
| COMMERCIAL PRICE | CommercialPriceProjection | workos-final | confirm `commercialPrice` | configurator | none | live projection | labeled preț client, not cost |
| QUOTE | QuoteSnapshot | workos-final | `POST .../quote-snapshots` | `/quotes/:product/:id`, `/oferte` | freeze with customerId + requestId | immutable snapshot | request link |
| ACCEPTANCE | QuoteAcceptanceDecision | workos-final | `POST .../acceptance` | quote detail | accept frozen quote | acceptance refers to snapshot hash | no rebuild |
| ORDER / LUCRARE | OrderSnapshot / job | workos-final | `POST .../order`, `GET /api/jobs/:jobId` | `/lucrari`, `/lucrari/:jobId` | create order from acceptance | order copies quote commercial | jobId = orderSnapshotId |
| PRODUCTION RELEASE | AcceptedProductionSnapshot | workos-final | `POST .../production-release` | job detail | release from order | production snapshot | release id |
| EXECUTION PLAN | ExecutionPlanRecord | workos-final | `POST .../execution-plan` | `/executie/:planId` | materialize from snapshot | plan from engine | no UI graph |
| ATELIER | Operator session + inbox | workos-final | `POST /api/operator-session`, `GET /api/operator-task-inbox` | `/atelier` | PIN identify | session cookie | no `/api/dev/operator-session` |
| EXECUTION | ExecutionTask | workos-final | `POST .../provider`, `.../start`, `.../complete` | atelier + execution | assign / start / complete | actuals on task | capability stays on server |
| COMPLETE | Job stage EXECUTION_COMPLETED | workos-final | job overview | job detail | all tasks complete | historical actuals | job complete |
| PLANNED VS ACTUAL | task quantities / variance | workos-final | execution plan view | job + execution | none | planned and actual coexist | present server labels only |

## Missing transport / API gap

None proven at program start. Existing workos-final main APIs cover the spine.

`WORKOS_FINAL_WRITE = NO` unless a later hop proves a genuine gap.

## Internal slices

- A: client → request → catalog → configurator context
- B: confirm → commercial price → quote freeze
- C: acceptance → order / lucrare
- D: production release → execution plan
- E: atelier → start → complete at least one real task, then remaining plan tasks
- F: job complete → planned vs actual

## Routes

Smallest useful set on the accepted Foundation shell:

```text
/clienti
/clienti/:customerId
/cereri
/cereri/:id
/catalog
/configurator
/oferte
/quotes/:productCode/:quoteSnapshotId
/lucrari
/lucrari/:jobId
/atelier
/executie/:planId
/admin/resources
```

## Tests

Unit / adapter / component tests per slice. Isolated browser proof of one continuous job. No hand-edited DB between steps.
